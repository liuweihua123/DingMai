const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { rateLimit } = require('./rate-limit');

require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 60000, max: 120 }));
app.set('trust proxy', 1);

// 图片上传配置
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = Date.now() + '-' + Math.random().toString(36).substring(2, 8) + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB（手机拍照可能较大）
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    // 同时检查 MIME 和扩展名，兼容手机端
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'));
    }
  }
});

// 图片上传接口（登录用户即可）
const { requireAuth } = require('./auth');
app.post('/api/upload', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '文件大小不能超过10MB' });
      return res.status(400).json({ error: err.message || '上传失败' });
    }
    if (!req.file) return res.status(400).json({ error: '请选择图片文件' });
    res.json({ success: true, url: '/uploads/' + req.file.filename });
  });
});

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/user', require('./routes/user'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/forum', require('./routes/forum'));
app.use('/api', require('./routes/meta'));

// 静态文件
const publicDir = path.join(__dirname, '..');
app.use(express.static(publicDir));
app.use('/uploads', express.static(path.join(publicDir, 'uploads')));

// 兜底路由
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: '接口不存在' });
  const htmlFile = req.path === '/' ? '/index.html' : req.path;
  res.sendFile(path.join(publicDir, htmlFile), (err) => {
    if (err) res.sendFile(path.join(publicDir, 'index.html'));
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🏛️  鼎脉人脉服务已启动`);
  console.log(`  📍 访问地址: http://localhost:${PORT}`);
  console.log(`  📍 局域网地址: http://0.0.0.0:${PORT}\n`);
  try { require('./seed')(); } catch (e) {}
});
