// ═══════════════════════════════════════════════
// 简单的速率限制中间件（防爬虫）
// ═══════════════════════════════════════════════

const requests = new Map(); // IP -> { count, resetTime }

function rateLimit({ windowMs = 60000, max = 60 } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    let record = requests.get(ip);

    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + windowMs };
      requests.set(ip, record);
    }

    record.count++;

    if (record.count > max) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }

    next();
  };
}

// 清理过期记录（每5分钟）
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requests) {
    if (now > record.resetTime) requests.delete(ip);
  }
}, 300000);

module.exports = { rateLimit };
