const express = require('express');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../auth');
const level = require('../level');

const router = express.Router();

// GET /api/resources — 资源列表
router.get('/', optionalAuth, (req, res) => {
  const { category, region, keyword, sort = 'newest', page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(parseInt(limit) || 20, 50); // 最多50条，防爬虫

  let where = ["r.status = 'approved'"];
  let params = [];

  if (category) {
    where.push('r.category = ?');
    params.push(category);
  }
  if (region) {
    where.push('r.region = ?');
    params.push(region);
  }
  if (keyword) {
    where.push('(r.title LIKE ? OR r.intro LIKE ? OR r.tags LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  let orderClause;
  switch (sort) {
    case 'popular': orderClause = 'ORDER BY r.views DESC'; break;
    case 'price-asc': orderClause = 'ORDER BY r.price ASC'; break;
    case 'price-desc': orderClause = 'ORDER BY r.price DESC'; break;
    default: orderClause = 'ORDER BY r.created_at DESC';
  }

  const offset = (parseInt(page) - 1) * safeLimit;

  // 查询总数
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM resources r ${whereClause}`).get(...params);

  // 查询资源列表（不返回 contact 字段，附带解锁人数）
  const resources = db.prepare(`
    SELECT r.id, r.title, r.category, r.region, r.intro, r.image, r.tags, r.price, r.views, r.created_at,
      (SELECT COUNT(*) FROM view_records WHERE resource_id = r.id) as unlock_count
    FROM resources r
    ${whereClause}
    ${orderClause}
    LIMIT ? OFFSET ?
  `).all(...params, safeLimit, offset);

  // 解析 tags JSON
  const formatted = resources.map(r => ({
    ...r,
    tags: JSON.parse(r.tags),
    unlockCount: r.unlock_count,
    createdAt: r.created_at,
  }));

  res.json({
    resources: formatted,
    total: countRow.total,
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

// POST /api/resources/:id/view — 增加浏览次数（真实统计）
router.post('/:id/view', (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('UPDATE resources SET views = views + 1 WHERE id = ?').run(id);
  const r = db.prepare('SELECT views FROM resources WHERE id = ?').get(id);
  res.json({ views: r ? r.views : 0 });
});

// GET /api/resources/hot — 热门排行（按解锁人数排序）
router.get('/hot', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 20);
  const resources = db.prepare(`
    SELECT r.id, r.title, r.category, r.region, r.price, r.image, r.views,
      (SELECT COUNT(*) FROM view_records WHERE resource_id = r.id) as unlock_count
    FROM resources r
    WHERE r.status = 'approved'
    ORDER BY unlock_count DESC, r.views DESC
    LIMIT ?
  `).all(limit);

  res.json(resources.map(r => ({
    id: r.id, title: r.title, category: r.category, region: r.region,
    price: r.price, image: r.image || '', views: r.views, unlockCount: r.unlock_count,
  })));
});

// GET /api/resources/:id — 资源详情
router.get('/:id', optionalAuth, (req, res) => {
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
  if (!resource) {
    return res.status(404).json({ error: '资源不存在' });
  }

  let isUnlocked = false;
  let contact = null;
  let isFavorited = false;

  // 检查是否已解锁和收藏
  if (req.user) {
    const record = db.prepare(
      'SELECT id FROM view_records WHERE user_id = ? AND resource_id = ?'
    ).get(req.user.id, resource.id);
    isUnlocked = !!record;

    const fav = db.prepare(
      'SELECT id FROM favorites WHERE user_id = ? AND resource_id = ?'
    ).get(req.user.id, resource.id);
    isFavorited = !!fav;
  }

  if (isUnlocked) {
    contact = resource.contact;
  }

  // 解锁人数
  const unlockCount = db.prepare(
    'SELECT COUNT(*) as c FROM view_records WHERE resource_id = ?'
  ).get(resource.id).c;

  res.json({
    id: resource.id,
    title: resource.title,
    category: resource.category,
    region: resource.region,
    intro: resource.intro,
    image: resource.image || '',
    contact,
    isUnlocked,
    isFavorited,
    unlockCount,
    tags: JSON.parse(resource.tags),
    price: resource.price,
    views: resource.views,
    createdAt: resource.created_at,
  });
});

// POST /api/resources/:id/unlock — 解锁资源（核心原子操作）
router.post('/:id/unlock', requireAuth, (req, res) => {
  const resourceId = parseInt(req.params.id);
  const userId = req.user.id;

  const unlockTransaction = db.transaction(() => {
    // 1. 获取资源
    const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId);
    if (!resource) {
      throw { status: 404, message: '资源不存在' };
    }

    // 2. 检查是否已解锁
    const existing = db.prepare(
      'SELECT id FROM view_records WHERE user_id = ? AND resource_id = ?'
    ).get(userId, resourceId);
    if (existing) {
      throw { status: 400, message: '该资源已解锁' };
    }

    // 3. 检查积分是否充足
    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
    if (user.points < resource.price) {
      throw { status: 400, message: '积分不足', code: 'INSUFFICIENT_POINTS' };
    }

    // 4. 扣除积分
    const newBalance = user.points - resource.price;
    db.prepare('UPDATE users SET points = ? WHERE id = ?').run(newBalance, userId);

    // 5. 记录交易流水
    db.prepare(
      'INSERT INTO transactions (user_id, type, amount, balance, desc) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, 'view', -resource.price, newBalance, `查看资源：${resource.title}`);

    // 6. 记录解锁
    db.prepare(
      'INSERT INTO view_records (user_id, resource_id) VALUES (?, ?)'
    ).run(userId, resourceId);

    // 7. 增加浏览量
    db.prepare('UPDATE resources SET views = views + 1 WHERE id = ?').run(resourceId);

    // 8. 给资源发布者加经验（如果有的话）
    if (resource.submitted_by && resource.submitted_by !== userId) {
      level.addExp(resource.submitted_by, level.EXP.RESOURCE_UNLOCKED, '人脉被解锁');
    }

    return { contact: resource.contact, newBalance };
  });

  try {
    const result = unlockTransaction();
    res.json({
      success: true,
      contact: result.contact,
      newBalance: result.newBalance,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: '解锁失败，请稍后重试' });
  }
});

module.exports = router;
