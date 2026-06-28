const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, requireAuth } = require('../auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, password, phone } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码长度不能少于6位' });
  }

  // 检查用户名是否已存在
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  // 加密密码
  const hashedPassword = bcrypt.hashSync(password, 10);

  // 原子操作：创建用户 + 赠送积分 + 记录流水
  const registerTransaction = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO users (username, password, phone, points) VALUES (?, ?, ?, 20)'
    ).run(username, hashedPassword, phone || '');

    const userId = result.lastInsertRowid;

    // 记录注册赠送流水
    db.prepare(
      'INSERT INTO transactions (user_id, type, amount, balance, desc) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, 'register_gift', 20, 20, '注册赠送积分');

    return userId;
  });

  try {
    const userId = registerTransaction();
    const user = db.prepare('SELECT id, username, phone, points, exp, level, avatar, created_at FROM users WHERE id = ?').get(userId);
    const token = generateToken(user);
    const lvl = require('../level');

    res.json({
      success: true,
      token,
      user: {
        id: user.id, username: user.username, phone: user.phone,
        points: user.points, exp: user.exp, level: user.level,
        avatar: user.avatar || '',
        levelTitle: lvl.getLevelTitle(user.level),
        levelColor: lvl.getLevelColor(user.level),
        levelProgress: lvl.getLevelInfo(user.exp).progress,
        nextExp: lvl.getLevelInfo(user.exp).nextExp,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(400).json({ error: '用户名或密码错误' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: '用户名或密码错误' });
  }

  const token = generateToken(user);
  const lvl = require('../level');
  const levelInfo = lvl.getLevelInfo(user.exp || 0);

  res.json({
    success: true,
    token,
    user: {
      id: user.id, username: user.username, phone: user.phone,
      points: user.points, exp: user.exp || 0, level: user.level || 1,
      avatar: user.avatar || '',
      levelTitle: lvl.getLevelTitle(user.level || 1),
      levelColor: lvl.getLevelColor(user.level || 1),
      levelProgress: levelInfo.progress,
      nextExp: levelInfo.nextExp,
      createdAt: user.created_at,
    },
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, phone, points, exp, level, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  const levelInfo = require('../level').getLevelInfo(user.exp);
  res.json({
    id: user.id,
    username: user.username,
    phone: user.phone,
    points: user.points,
    exp: user.exp,
    level: user.level,
    avatar: user.avatar || '',
    levelTitle: require('../level').getLevelTitle(user.level),
    levelColor: require('../level').getLevelColor(user.level),
    levelProgress: levelInfo.progress,
    nextExp: levelInfo.nextExp,
    createdAt: user.created_at,
  });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写完整' });
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6位' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(400).json({ error: '原密码错误' });
  }

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ success: true });
});

// PUT /api/auth/profile — 更新用户资料
router.put('/profile', requireAuth, (req, res) => {
  const { phone, avatar } = req.body;

  if (avatar !== undefined) {
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id);
  }
  if (phone !== undefined) {
    db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone || '', req.user.id);
  }

  const user = db.prepare('SELECT id, username, phone, points, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({
    success: true,
    user: { id: user.id, username: user.username, phone: user.phone, points: user.points, avatar: user.avatar || '', createdAt: user.created_at },
  });
});

module.exports = router;
