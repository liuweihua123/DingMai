const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dingmai-club-secret-key-2024';
const ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || 'dingmai-admin-secret-key-2024';
const EXPIRES_IN = '7d';

// 生成普通用户 token
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: 'user' },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

// 生成管理员 token
function generateAdminToken(admin) {
  return jwt.sign(
    { id: admin.id, username: admin.username, role: 'admin' },
    ADMIN_SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

// 普通用户认证
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

// 管理员认证（也接受 query 参数 key 作为兼容）
function requireAdmin(req, res, next) {
  // 优先从 header 获取 token
  const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      req.admin = jwt.verify(token, ADMIN_SECRET);
      return next();
    } catch (err) {}
  }

  // 兼容旧的 key 方式
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key) {
    const db = require('./db');
    const bcrypt = require('bcryptjs');
    // 尝试用 key 作为密码验证默认管理员
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get('admin');
    if (admin && bcrypt.compareSync(key, admin.password)) {
      req.admin = { id: admin.id, username: admin.username };
      return next();
    }
  }

  return res.status(403).json({ error: '管理员认证失败' });
}

// 可选认证
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(authHeader.split(' ')[1], SECRET);
    } catch (err) {}
  }
  next();
}

module.exports = {
  generateToken, generateAdminToken,
  requireAuth, requireAdmin, optionalAuth,
  SECRET, ADMIN_SECRET
};
