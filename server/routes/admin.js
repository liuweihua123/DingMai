const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateAdminToken, requireAdmin } = require('../auth');
const level = require('../level');

const router = express.Router();

// ═══════════════════════════════════════════════
// 管理员登录
// ═══════════════════════════════════════════════

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(400).json({ error: '用户名或密码错误' });
  }

  const token = generateAdminToken(admin);
  res.json({ success: true, token, username: admin.username });
});

// ═══════════════════════════════════════════════
// 管理员管理（需要登录后操作）
// ═══════════════════════════════════════════════

// 获取管理员列表
router.get('/admins', requireAdmin, (req, res) => {
  const admins = db.prepare('SELECT id, username, created_at FROM admins ORDER BY id').all();
  res.json(admins.map(a => ({ id: a.id, username: a.username, createdAt: a.created_at })));
});

// 添加管理员
router.post('/admins', requireAdmin, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请填写完整' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });

  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (existing) return res.status(400).json({ error: '管理员已存在' });

  const hashed = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run(username, hashed);
  res.json({ success: true });
});

// 删除管理员
router.delete('/admins/:id', requireAdmin, (req, res) => {
  const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
  if (adminCount <= 1) return res.status(400).json({ error: '至少保留一个管理员' });

  db.prepare('DELETE FROM admins WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 修改密码
router.put('/password', requireAdmin, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写完整' });
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6位' });

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!bcrypt.compareSync(oldPassword, admin.password)) {
    return res.status(400).json({ error: '原密码错误' });
  }

  db.prepare('UPDATE admins SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.admin.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════
// 概览统计
// ═══════════════════════════════════════════════

router.get('/overview', requireAdmin, (req, res) => {
  const totalResources = db.prepare('SELECT COUNT(*) as c FROM resources').get().c;
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'paid'").get().c;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as c FROM orders WHERE status = 'paid'").get().c;
  const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'confirming'").get().c;
  const totalViews = db.prepare('SELECT COALESCE(SUM(views), 0) as c FROM resources').get().c;
  res.json({ totalResources, totalUsers, totalOrders, totalRevenue, pendingOrders, totalViews });
});

// ═══════════════════════════════════════════════
// 资源 CRUD
// ═══════════════════════════════════════════════

router.get('/resources', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const keyword = req.query.keyword || '';
  const category = req.query.category || '';
  const offset = (page - 1) * limit;

  let where = [], params = [];
  if (keyword) {
    where.push('(r.title LIKE ? OR r.intro LIKE ? OR r.contact LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  if (category) { where.push('r.category = ?'); params.push(category); }

  const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) as c FROM resources r ${wc}`).get(...params).c;

  const resources = db.prepare(`
    SELECT r.*, c.name as category_name FROM resources r
    LEFT JOIN categories c ON c.id = r.category
    ${wc} ORDER BY r.id DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    resources: resources.map(r => ({
      id: r.id, title: r.title, category: r.category,
      categoryName: r.category_name, region: r.region,
      intro: r.intro, contact: r.contact, image: r.image || '',
      tags: JSON.parse(r.tags), price: r.price, views: r.views,
      createdAt: r.created_at,
    })),
    total, page, limit,
  });
});

router.post('/resources', requireAdmin, (req, res) => {
  const { title, category, region, intro, contact, image, tags, price } = req.body;
  if (!title || !category || !region || !intro || !contact || !price) {
    return res.status(400).json({ error: '请填写完整信息' });
  }
  const result = db.prepare(`
    INSERT INTO resources (title, category, region, intro, contact, image, tags, price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, category, region, intro, contact, image || '', JSON.stringify(tags || []), Math.round(Number(price)));
  db.prepare('UPDATE categories SET count = count + 1 WHERE id = ?').run(category);
  res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/resources/:id', requireAdmin, (req, res) => {
  const { title, category, region, intro, contact, image, tags, price } = req.body;
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM resources WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '资源不存在' });

  db.prepare(`UPDATE resources SET title=?, category=?, region=?, intro=?, contact=?, image=?, tags=?, price=? WHERE id=?`)
    .run(
      title || existing.title, category || existing.category, region || existing.region,
      intro || existing.intro, contact || existing.contact, image !== undefined ? image : existing.image,
      JSON.stringify(tags || JSON.parse(existing.tags)), Math.round(Number(price || existing.price)), id
    );

  if (category && category !== existing.category) {
    db.prepare('UPDATE categories SET count = count - 1 WHERE id = ?').run(existing.category);
    db.prepare('UPDATE categories SET count = count + 1 WHERE id = ?').run(category);
  }
  res.json({ success: true });
});

router.delete('/resources/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '资源不存在' });

  db.prepare('DELETE FROM resources WHERE id = ?').run(req.params.id);
  db.prepare('UPDATE categories SET count = count - 1 WHERE id = ?').run(existing.category);
  db.prepare('DELETE FROM view_records WHERE resource_id = ?').run(req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════
// 订单管理
// ═══════════════════════════════════════════════

router.get('/orders', requireAdmin, (req, res) => {
  const status = req.query.status || 'confirming';
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

  let whereClause = '';
  let params = [];

  if (status && status !== 'all') {
    whereClause = 'WHERE o.status = ?';
    params.push(status);
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM orders o ${whereClause}`).get(...params).c;

  const orders = db.prepare(`
    SELECT o.*, u.username FROM orders o
    JOIN users u ON u.id = o.user_id
    ${whereClause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    orders: orders.map(o => ({
      id: o.id, orderNo: o.order_no, username: o.username,
      amount: o.amount, points: o.points, status: o.status,
      remark: o.remark, createdAt: o.created_at, paidAt: o.paid_at,
    })),
    total, page, limit,
  });
});

router.post('/orders/approve', requireAdmin, (req, res) => {
  const { orderNo } = req.body;
  const approveTransaction = db.transaction(() => {
    const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
    if (!order) throw { status: 404, message: '订单不存在' };
    if (order.status !== 'confirming') throw { status: 400, message: '订单状态异常' };

    db.prepare("UPDATE orders SET status = 'paid', paid_at = local_datetime() WHERE order_no = ?").run(orderNo);

    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(order.user_id);
    const newBalance = user.points + order.points;
    db.prepare('UPDATE users SET points = ? WHERE id = ?').run(newBalance, order.user_id);

    db.prepare('INSERT INTO transactions (user_id, type, amount, balance, desc) VALUES (?, ?, ?, ?, ?)')
      .run(order.user_id, 'recharge', order.points, newBalance, `充值到账（${order.points}积分）`);

    return { newBalance, points: order.points };
  });

  try {
    res.json({ success: true, ...approveTransaction() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '操作失败' });
  }
});

router.post('/orders/reject', requireAdmin, (req, res) => {
  const { orderNo, reason } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
  if (!order) return res.status(404).json({ error: '订单不存在' });

  db.prepare("UPDATE orders SET status = 'rejected', remark = ? WHERE order_no = ?").run(reason || '', orderNo);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════
// 用户管理
// ═══════════════════════════════════════════════

router.get('/users', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const keyword = req.query.keyword || '';

  let where = '', params = [];
  if (keyword) {
    where = 'WHERE u.username LIKE ?';
    params.push(`%${keyword}%`);
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM users u ${where}`).get(...params).c;

  const users = db.prepare(`
    SELECT u.*,
      (SELECT COUNT(*) FROM view_records WHERE user_id = u.id) as view_count,
      (SELECT COUNT(*) FROM orders WHERE user_id = u.id AND status = 'paid') as order_count,
      (SELECT COALESCE(SUM(amount), 0) FROM orders WHERE user_id = u.id AND status = 'paid') as total_spent
    FROM users u ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    users: users.map(u => ({
      id: u.id, username: u.username, phone: u.phone, points: u.points,
      viewCount: u.view_count, orderCount: u.order_count,
      totalSpent: u.total_spent, createdAt: u.created_at,
    })),
    total, page, limit,
  });
});

// 查看用户详情
router.get('/users/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id, username, phone, points, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const records = db.prepare(`
    SELECT vr.*, r.title, r.category FROM view_records vr
    JOIN resources r ON r.id = vr.resource_id
    WHERE vr.user_id = ? ORDER BY vr.viewed_at DESC
  `).all(req.params.id);

  const transactions = db.prepare(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.params.id);

  res.json({
    user: { id: user.id, username: user.username, phone: user.phone, points: user.points, createdAt: user.created_at },
    records: records.map(r => ({ resourceId: r.resource_id, title: r.title, category: r.category, viewedAt: r.viewed_at })),
    transactions: transactions.map(t => ({ id: t.id, type: t.type, amount: t.amount, balance: t.balance, desc: t.desc, createdAt: t.created_at })),
  });
});

// 调整用户积分
router.post('/users/:id/points', requireAdmin, (req, res) => {
  const { amount, desc } = req.body;
  if (!amount) return res.status(400).json({ error: '请填写调整数量' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const newBalance = user.points + parseInt(amount);
  if (newBalance < 0) return res.status(400).json({ error: '积分不能为负数' });

  db.transaction(() => {
    db.prepare('UPDATE users SET points = ? WHERE id = ?').run(newBalance, req.params.id);
    db.prepare('INSERT INTO transactions (user_id, type, amount, balance, desc) VALUES (?, ?, ?, ?, ?)')
      .run(req.params.id, 'admin_adjust', parseInt(amount), newBalance, desc || '管理员调整');
  })();

  res.json({ success: true, newBalance });
});

// ═══════════════════════════════════════════════
// 分类管理
// ═══════════════════════════════════════════════

router.get('/categories', requireAdmin, (req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY count DESC').all();
  res.json(cats.map(c => ({ id: c.id, name: c.name, icon: c.icon, count: c.count })));
});

router.post('/categories', requireAdmin, (req, res) => {
  const { id, name, icon } = req.body;
  if (!id || !name || !icon) return res.status(400).json({ error: '请填写完整' });
  const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (existing) return res.status(400).json({ error: '分类ID已存在' });
  db.prepare('INSERT INTO categories (id, name, icon, count) VALUES (?, ?, ?, 0)').run(id, name, icon);
  res.json({ success: true });
});

router.put('/categories/:id', requireAdmin, (req, res) => {
  const { name, icon } = req.body;
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: '分类不存在' });
  db.prepare('UPDATE categories SET name = ?, icon = ? WHERE id = ?').run(name || cat.name, icon || cat.icon, req.params.id);
  res.json({ success: true });
});

router.delete('/categories/:id', requireAdmin, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM resources WHERE category = ?').get(req.params.id).c;
  if (count > 0) return res.status(400).json({ error: `该分类下有 ${count} 条资源，无法删除` });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════
// 套餐管理
// ═══════════════════════════════════════════════

router.get('/plans', requireAdmin, (req, res) => {
  const plans = db.prepare('SELECT * FROM plans ORDER BY id').all();
  res.json(plans.map(p => ({ id: p.id, points: p.points, price: p.price, label: p.label, popular: !!p.popular, bonus: p.bonus || 0 })));
});

router.post('/plans', requireAdmin, (req, res) => {
  const { points, price, label, bonus, popular } = req.body;
  if (!points || !price || !label) return res.status(400).json({ error: '请填写完整' });
  const maxId = db.prepare('SELECT MAX(id) as m FROM plans').get().m || 0;
  db.prepare('INSERT INTO plans (id, points, price, label, popular, bonus) VALUES (?, ?, ?, ?, ?, ?)')
    .run(maxId + 1, parseInt(points), parseFloat(price), label, popular ? 1 : 0, parseInt(bonus) || 0);
  res.json({ success: true });
});

router.put('/plans/:id', requireAdmin, (req, res) => {
  const { points, price, label, bonus, popular } = req.body;
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: '套餐不存在' });
  db.prepare('UPDATE plans SET points=?, price=?, label=?, popular=?, bonus=? WHERE id=?')
    .run(parseInt(points) || plan.points, parseFloat(price) || plan.price, label || plan.label, popular ? 1 : 0, parseInt(bonus) || 0, req.params.id);
  res.json({ success: true });
});

router.delete('/plans/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM plans WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════
// 资源审核
// ═══════════════════════════════════════════════

// GET /api/admin/submissions — 待审核资源列表
router.get('/submissions', requireAdmin, (req, res) => {
  const status = req.query.status || 'pending';
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

  const total = db.prepare("SELECT COUNT(*) as c FROM resources WHERE status = ?").get(status).c;

  const resources = db.prepare(`
    SELECT r.*, c.name as category_name, u.username as submitter
    FROM resources r
    LEFT JOIN categories c ON c.id = r.category
    LEFT JOIN users u ON u.id = r.submitted_by
    WHERE r.status = ?
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(status, limit, offset);

  res.json({
    resources: resources.map(r => ({
      id: r.id, title: r.title, category: r.category,
      categoryName: r.category_name, region: r.region,
      intro: r.intro, contact: r.contact, image: r.image || '',
      tags: JSON.parse(r.tags), price: r.price, views: r.views,
      status: r.status, rejectReason: r.reject_reason || '',
      submitter: r.submitter || '管理员',
      submittedBy: r.submitted_by,
      createdAt: r.created_at,
    })),
    total, page, limit,
  });
});

// POST /api/admin/submissions/:id/approve — 审核通过
router.post('/submissions/:id/approve', requireAdmin, (req, res) => {
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
  if (!resource) return res.status(404).json({ error: '资源不存在' });

  db.prepare("UPDATE resources SET status = 'approved' WHERE id = ?").run(req.params.id);

  // 如果是用户提交的，给提交者加经验
  if (resource.submitted_by) {
    level.addExp(resource.submitted_by, level.EXP.RESOURCE_APPROVED, '人脉审核通过');
  }

  res.json({ success: true });
});

// POST /api/admin/submissions/:id/reject — 审核驳回
router.post('/submissions/:id/reject', requireAdmin, (req, res) => {
  const { reason } = req.body;
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
  if (!resource) return res.status(404).json({ error: '资源不存在' });

  db.prepare("UPDATE resources SET status = 'rejected', reject_reason = ? WHERE id = ?").run(reason || '', req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════
// 论坛管理
// ═══════════════════════════════════════════════

// GET /api/admin/posts — 帖子管理列表
router.get('/posts', requireAdmin, (req, res) => {
  const status = req.query.status || 'normal';
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

  const total = db.prepare("SELECT COUNT(*) as c FROM posts WHERE status = ?").get(status).c;

  const posts = db.prepare(`
    SELECT p.*, u.username FROM posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.status = ?
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `).all(status, limit, offset);

  res.json({
    posts: posts.map(p => ({
      id: p.id, title: p.title,
      content: p.content.substring(0, 100),
      author: p.username, authorId: p.user_id,
      likesCount: p.likes_count, repliesCount: p.replies_count,
      status: p.status, createdAt: p.created_at,
    })),
    total, page, limit,
  });
});

// POST /api/admin/posts/:id/hide — 隐藏帖子
router.post('/posts/:id/hide', requireAdmin, (req, res) => {
  db.prepare("UPDATE posts SET status = 'hidden' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// POST /api/admin/posts/:id/restore — 恢复帖子
router.post('/posts/:id/restore', requireAdmin, (req, res) => {
  db.prepare("UPDATE posts SET status = 'normal' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// DELETE /api/admin/posts/:id — 删除帖子
router.delete('/posts/:id', requireAdmin, (req, res) => {
  db.prepare("UPDATE posts SET status = 'deleted' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════
// 举报管理
// ═══════════════════════════════════════════════

// GET /api/admin/reports — 举报列表
router.get('/reports', requireAdmin, (req, res) => {
  const status = req.query.status || 'pending';
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

  const total = db.prepare("SELECT COUNT(*) as c FROM reports WHERE status = ?").get(status).c;

  const reports = db.prepare(`
    SELECT r.*, u.username as reporter
    FROM reports r
    JOIN users u ON u.id = r.user_id
    WHERE r.status = ?
    ORDER BY r.created_at DESC LIMIT ? OFFSET ?
  `).all(status, limit, offset);

  // 获取被举报内容的摘要
  const enriched = reports.map(r => {
    let targetSummary = '';
    if (r.target_type === 'post') {
      const post = db.prepare('SELECT title FROM posts WHERE id = ?').get(r.target_id);
      targetSummary = post ? post.title : '(已删除)';
    } else {
      const reply = db.prepare('SELECT content FROM replies WHERE id = ?').get(r.target_id);
      targetSummary = reply ? reply.content.substring(0, 50) : '(已删除)';
    }
    return {
      id: r.id, targetType: r.target_type, targetId: r.target_id,
      targetSummary, reason: r.reason,
      reporter: r.reporter, status: r.status,
      adminNote: r.admin_note || '', createdAt: r.created_at,
    };
  });

  res.json({ reports: enriched, total, page, limit });
});

// POST /api/admin/reports/:id/resolve — 处理举报
router.post('/reports/:id/resolve', requireAdmin, (req, res) => {
  const { action, adminNote } = req.body; // action: 'dismiss' or 'hide'
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: '举报不存在' });

  db.prepare("UPDATE reports SET status = 'resolved', admin_note = ? WHERE id = ?").run(adminNote || '', req.params.id);

  // 如果选择隐藏，同时隐藏被举报内容
  if (action === 'hide') {
    if (report.target_type === 'post') {
      db.prepare("UPDATE posts SET status = 'hidden' WHERE id = ?").run(report.target_id);
    } else {
      db.prepare("UPDATE replies SET status = 'hidden' WHERE id = ?").run(report.target_id);
    }
  }

  res.json({ success: true });
});

module.exports = router;
