const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const level = require('../level');

const router = express.Router();

// POST /api/user/recharge — 充值
router.post('/recharge', requireAuth, (req, res) => {
  const { planId } = req.body;
  const userId = req.user.id;

  if (!planId) {
    return res.status(400).json({ error: '请选择充值套餐' });
  }

  const rechargeTransaction = db.transaction(() => {
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
    if (!plan) {
      throw { status: 400, message: '套餐不存在' };
    }

    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
    const totalPoints = plan.points + (plan.bonus || 0);
    const newBalance = user.points + totalPoints;

    // 更新积分
    db.prepare('UPDATE users SET points = ? WHERE id = ?').run(newBalance, userId);

    // 记录流水
    const desc = plan.bonus
      ? `充值${plan.label}（${plan.points}积分 + 赠送${plan.bonus}积分）`
      : `充值${plan.label}（${plan.points}积分）`;

    db.prepare(
      'INSERT INTO transactions (user_id, type, amount, balance, desc) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, 'recharge', totalPoints, newBalance, desc);

    return { newBalance, totalPoints };
  });

  try {
    const result = rechargeTransaction();
    res.json({
      success: true,
      newBalance: result.newBalance,
      totalPoints: result.totalPoints,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    res.status(500).json({ error: '充值失败，请稍后重试' });
  }
});

// GET /api/transactions — 积分流水
router.get('/transactions', requireAuth, (req, res) => {
  const transactions = db.prepare(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);

  res.json(transactions.map(t => ({
    id: t.id,
    type: t.type,
    amount: t.amount,
    balance: t.balance,
    desc: t.desc,
    createdAt: t.created_at,
  })));
});

// GET /api/view-records — 已查看记录
router.get('/view-records', requireAuth, (req, res) => {
  const records = db.prepare(`
    SELECT vr.*, r.title, r.category, r.region, r.price
    FROM view_records vr
    JOIN resources r ON r.id = vr.resource_id
    WHERE vr.user_id = ?
    ORDER BY vr.viewed_at DESC
  `).all(req.user.id);

  res.json(records.map(r => ({
    id: r.id,
    resourceId: r.resource_id,
    viewedAt: r.viewed_at,
    title: r.title,
    category: r.category,
    region: r.region,
    price: r.price,
  })));
});

// ═══════════════════════════════════════════════
// 每日签到
// ═══════════════════════════════════════════════

const CHECKIN_POINTS = 5; // 每日签到送5积分

// 获取本地日期（避免 UTC 时差问题）
function getLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// GET /api/user/checkin/status — 查询今日签到状态
router.get('/checkin/status', requireAuth, (req, res) => {
  const today = getLocalDate();
  const record = db.prepare(
    'SELECT id FROM checkins WHERE user_id = ? AND checkin_date = ?'
  ).get(req.user.id, today);

  // 查询连续签到天数
  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const r = db.prepare('SELECT id FROM checkins WHERE user_id = ? AND checkin_date = ?').get(req.user.id, dateStr);
    if (!r) break;
    streak++;
  }

  res.json({ checkedIn: !!record, streak, points: CHECKIN_POINTS });
});

// POST /api/user/checkin — 执行签到
router.post('/checkin', requireAuth, (req, res) => {
  const today = getLocalDate();

  // 检查是否已签到
  const existing = db.prepare(
    'SELECT id FROM checkins WHERE user_id = ? AND checkin_date = ?'
  ).get(req.user.id, today);
  if (existing) {
    return res.status(400).json({ error: '今日已签到' });
  }

  // 签到 + 加积分
  try {
    db.transaction(() => {
      const user = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);
      if (!user) throw { status: 401, message: '用户不存在，请重新登录' };

      db.prepare('INSERT INTO checkins (user_id, checkin_date) VALUES (?, ?)').run(req.user.id, today);

      const newBalance = user.points + CHECKIN_POINTS;
      db.prepare('UPDATE users SET points = ? WHERE id = ?').run(newBalance, req.user.id);

      db.prepare('INSERT INTO transactions (user_id, type, amount, balance, desc) VALUES (?, ?, ?, ?, ?)')
        .run(req.user.id, 'checkin', CHECKIN_POINTS, newBalance, '每日签到');

      // 增加经验值
      level.addExp(req.user.id, level.EXP.CHECKIN, '每日签到');
    })();

    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, points: CHECKIN_POINTS, newBalance: user.points });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '签到失败' });
  }
});

// ═══════════════════════════════════════════════
// 收藏
// ═══════════════════════════════════════════════

// POST /api/user/favorites/:resourceId — 收藏/取消收藏
router.post('/favorites/:resourceId', requireAuth, (req, res) => {
  const resourceId = parseInt(req.params.resourceId);
  const existing = db.prepare(
    'SELECT id FROM favorites WHERE user_id = ? AND resource_id = ?'
  ).get(req.user.id, resourceId);

  if (existing) {
    db.prepare('DELETE FROM favorites WHERE id = ?').run(existing.id);
    res.json({ success: true, favorited: false });
  } else {
    db.prepare('INSERT INTO favorites (user_id, resource_id) VALUES (?, ?)').run(req.user.id, resourceId);
    res.json({ success: true, favorited: true });
  }
});

// GET /api/user/favorites — 获取收藏列表
router.get('/favorites', requireAuth, (req, res) => {
  const favorites = db.prepare(`
    SELECT f.*, r.title, r.category, r.region, r.price, r.views, r.image
    FROM favorites f
    JOIN resources r ON r.id = f.resource_id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(req.user.id);

  res.json(favorites.map(f => ({
    id: f.id, resourceId: f.resource_id,
    title: f.title, category: f.category, region: f.region,
    price: f.price, views: f.views, image: f.image || '',
    createdAt: f.created_at,
  })));
});

// GET /api/user/favorites/check/:resourceId — 检查是否已收藏
router.get('/favorites/check/:resourceId', requireAuth, (req, res) => {
  const existing = db.prepare(
    'SELECT id FROM favorites WHERE user_id = ? AND resource_id = ?'
  ).get(req.user.id, parseInt(req.params.resourceId));
  res.json({ favorited: !!existing });
});

// ═══════════════════════════════════════════════
// 用户发布资源
// ═══════════════════════════════════════════════

// POST /api/user/submit — 提交资源
router.post('/submit', requireAuth, (req, res) => {
  const { title, category, region, intro, contact, image, tags, price } = req.body;

  if (!title || !category || !region || !intro || !contact || !price) {
    return res.status(400).json({ error: '请填写完整信息' });
  }
  if (parseInt(price) < 1) {
    return res.status(400).json({ error: '积分价格至少为1' });
  }

  const result = db.prepare(`
    INSERT INTO resources (title, category, region, intro, contact, image, tags, price, status, submitted_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(title, category, region, intro, contact, image || '', JSON.stringify(tags || []), Math.round(Number(price)), req.user.id);

  res.json({ success: true, id: result.lastInsertRowid });
});

// GET /api/user/submissions — 查看我的发布记录
router.get('/submissions', requireAuth, (req, res) => {
  const submissions = db.prepare(`
    SELECT r.*, c.name as category_name
    FROM resources r
    LEFT JOIN categories c ON c.id = r.category
    WHERE r.submitted_by = ?
    ORDER BY r.created_at DESC
  `).all(req.user.id);

  res.json(submissions.map(r => ({
    id: r.id, title: r.title, category: r.category,
    categoryName: r.category_name, region: r.region,
    price: r.price, status: r.status, rejectReason: r.reject_reason || '',
    views: r.views, createdAt: r.created_at,
  })));
});

// PUT /api/user/submissions/:id — 修改被驳回的资源
router.put('/submissions/:id', requireAuth, (req, res) => {
  const { title, category, region, intro, contact, image, tags, price } = req.body;
  const resource = db.prepare(
    'SELECT * FROM resources WHERE id = ? AND submitted_by = ?'
  ).get(req.params.id, req.user.id);

  if (!resource) return res.status(404).json({ error: '资源不存在' });
  if (resource.status !== 'rejected' && resource.status !== 'pending') {
    return res.status(400).json({ error: '只能修改待审核或被驳回的资源' });
  }

  db.prepare(`
    UPDATE resources SET title=?, category=?, region=?, intro=?, contact=?, image=?, tags=?, price=?, status='pending', reject_reason=''
    WHERE id=? AND submitted_by=?
  `).run(
    title || resource.title, category || resource.category, region || resource.region,
    intro || resource.intro, contact || resource.contact, image !== undefined ? image : resource.image,
    JSON.stringify(tags || JSON.parse(resource.tags)), Math.round(Number(price || resource.price)),
    resource.id, req.user.id
  );

  res.json({ success: true });
});

// DELETE /api/user/submissions/:id — 撤回待审核的资源
router.delete('/submissions/:id', requireAuth, (req, res) => {
  const resource = db.prepare(
    'SELECT * FROM resources WHERE id = ? AND submitted_by = ?'
  ).get(req.params.id, req.user.id);

  if (!resource) return res.status(404).json({ error: '资源不存在' });
  if (resource.status !== 'pending') return res.status(400).json({ error: '只能撤回待审核的资源' });

  db.prepare('DELETE FROM resources WHERE id = ? AND submitted_by = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// GET /api/user/submissions/:id — 查看单条发布详情
router.get('/submissions/:id', requireAuth, (req, res) => {
  const resource = db.prepare(`
    SELECT r.*, c.name as category_name
    FROM resources r
    LEFT JOIN categories c ON c.id = r.category
    WHERE r.id = ? AND r.submitted_by = ?
  `).get(req.params.id, req.user.id);

  if (!resource) return res.status(404).json({ error: '资源不存在' });

  res.json({
    id: resource.id, title: resource.title, category: resource.category,
    categoryName: resource.category_name, region: resource.region,
    intro: resource.intro, contact: resource.contact, image: resource.image || '',
    tags: JSON.parse(resource.tags), price: resource.price,
    status: resource.status, rejectReason: resource.reject_reason || '',
    views: resource.views, createdAt: resource.created_at,
  });
});

module.exports = router;
