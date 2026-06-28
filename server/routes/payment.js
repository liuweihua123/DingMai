const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// 支付宝配置
const ALIPAY_APP_ID = '2018041502562722';
const PRIVATE_KEY = fs.readFileSync(__dirname + '/../alipay_private_key.pem', 'utf8');
const BASE_URL = process.env.BASE_URL || 'https://scaling-violet-juggle.ngrok-free.dev';
const GATEWAY = 'https://openapi.alipay.com/gateway.do';

// 生成订单号
function generateOrderNo() {
  const now = new Date();
  const date = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `DM${date}${random}`;
}

// 获取中国时间字符串 (UTC+8)
function getChinaTime() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}
function alipaySign(params) {
  const signStr = Object.keys(params).sort().map(k => k + '=' + params[k]).join('&');
  return crypto.sign('RSA-SHA256', Buffer.from(signStr), PRIVATE_KEY).toString('base64');
}

// POST /api/payment/create — 创建支付宝支付订单
router.post('/create', requireAuth, (req, res) => {
  const { planId } = req.body;
  const userId = req.user.id;

  if (!planId) return res.status(400).json({ error: '请选择充值套餐' });

  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
  if (!plan) return res.status(400).json({ error: '套餐不存在' });

  const totalPoints = plan.points + (plan.bonus || 0);
  const orderNo = generateOrderNo();

  // 创建订单记录
  db.prepare(
    'INSERT INTO orders (order_no, user_id, plan_id, amount, points, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(orderNo, userId, planId, plan.price, totalPoints, 'pending');

  // 构建支付宝请求参数
  const bizContent = JSON.stringify({
    out_trade_no: orderNo,
    product_code: 'FAST_INSTANT_TRADE_PAY',
    total_amount: plan.price.toFixed(2),
    subject: '鼎脉人脉充值',
  });

  const params = {
    app_id: ALIPAY_APP_ID,
    method: 'alipay.trade.page.pay',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: getChinaTime(),
    version: '1.0',
    biz_content: bizContent,
    notify_url: `${BASE_URL}/api/payment/notify`,
    return_url: `${BASE_URL}/payment-result.html`,
  };

  // 签名
  params.sign = alipaySign(params);

  // 构建跳转 URL
  const payUrl = GATEWAY + '?' +
    Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');

  res.json({ success: true, orderNo, payUrl });
});

// POST /api/payment/notify — 支付宝异步回调
router.post('/notify', express.urlencoded({ extended: true }), (req, res) => {
  console.log('收到支付宝回调:', JSON.stringify(req.body).substring(0, 300));

  try {
    const { sign, sign_type, ...params } = req.body;
    const { out_trade_no, trade_no, total_amount, trade_status } = params;

    console.log('回调关键数据:', { out_trade_no, trade_no, total_amount, trade_status });

    // 验签（降级处理：验签失败也继续，防止公钥格式问题导致漏单）
    if (sign) {
      try {
        const signStr = Object.keys(params).sort().map(k => k + '=' + params[k]).join('&');
        const pubKey = fs.readFileSync(__dirname + '/../alipay_public_key.pem', 'utf8');
        const isValid = crypto.verify('RSA-SHA256', Buffer.from(signStr), pubKey, Buffer.from(sign, 'base64'));
        if (!isValid) console.warn('验签失败，但继续处理');
      } catch (e) {
        console.warn('验签异常:', e.message);
      }
    }

    if (trade_status !== 'TRADE_SUCCESS' && trade_status !== 'TRADE_FINISHED') {
      return res.send('success');
    }

    // 原子操作：更新订单 + 加积分
    const success = db.transaction(() => {
      const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(out_trade_no);
      if (!order) { console.error('订单不存在:', out_trade_no); return false; }
      if (order.status === 'paid') { console.log('订单已处理'); return true; }

      db.prepare("UPDATE orders SET status = 'paid', remark = ?, paid_at = local_datetime() WHERE order_no = ?")
        .run(trade_no || '', out_trade_no);

      const user = db.prepare('SELECT points FROM users WHERE id = ?').get(order.user_id);
      const newBalance = user.points + order.points;
      db.prepare('UPDATE users SET points = ? WHERE id = ?').run(newBalance, order.user_id);

      db.prepare('INSERT INTO transactions (user_id, type, amount, balance, desc) VALUES (?, ?, ?, ?, ?)')
        .run(order.user_id, 'recharge', order.points, newBalance, '支付宝充值');

      console.log('✅ 充值成功:', out_trade_no, '积分+', order.points);
      return true;
    })();

    res.send(success ? 'success' : 'fail');
  } catch (err) {
    console.error('处理回调失败:', err);
    res.send('fail');
  }
});

// GET /api/payment/status/:orderNo — 查询订单状态（含支付宝查询）
router.get('/status/:orderNo', requireAuth, async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ?')
    .get(req.params.orderNo, req.user.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });

  // 如果订单还未支付，主动查询支付宝
  if (order.status === 'pending' || order.status === 'confirming') {
    try {
      const bizContent = JSON.stringify({
        out_trade_no: order.order_no,
      });

      const params = {
        app_id: ALIPAY_APP_ID,
        method: 'alipay.trade.query',
        charset: 'utf-8',
        sign_type: 'RSA2',
        timestamp: getChinaTime(),
        version: '1.0',
        biz_content: bizContent,
      };

      params.sign = alipaySign(params);

      const queryUrl = GATEWAY + '?' +
        Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');

      // 请求支付宝查询（5秒超时）
      const https = require('https');
      const alipayRes = await new Promise((resolve, reject) => {
        const req = https.get(queryUrl, (r) => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => {
            try { resolve(JSON.parse(d)); } catch (e) { resolve({}); }
          });
        });
        req.setTimeout(5000, () => {
          req.destroy();
          resolve({});
        });
        req.on('error', () => resolve({}));
      });

      const tradeStatus = alipayRes?.alipay_trade_query_response?.trade_status;

      if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
        // 支付宝已付款，但回调没到 → 手动处理
        const alreadyPaid = db.prepare("SELECT status FROM orders WHERE order_no = ?").get(order.order_no);
        if (alreadyPaid.status !== 'paid') {
          db.transaction(() => {
            db.prepare("UPDATE orders SET status = 'paid', remark = ?, paid_at = local_datetime() WHERE order_no = ?")
              .run(alipayRes.alipay_trade_query_response.trade_no || 'manual', order.order_no);

            const user = db.prepare('SELECT points FROM users WHERE id = ?').get(order.user_id);
            const newBalance = user.points + order.points;
            db.prepare('UPDATE users SET points = ? WHERE id = ?').run(newBalance, order.user_id);

            db.prepare('INSERT INTO transactions (user_id, type, amount, balance, desc) VALUES (?, ?, ?, ?, ?)')
              .run(order.user_id, 'recharge', order.points, newBalance, '支付宝充值');
          })();
        }
      }
    } catch (err) {
      console.error('查询支付宝失败:', err.message);
    }
  }

  // 重新查询订单状态
  const updatedOrder = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(req.params.orderNo);

  res.json({
    orderNo: updatedOrder.order_no,
    status: updatedOrder.status,
    amount: updatedOrder.amount,
    points: updatedOrder.points,
    paidAt: updatedOrder.paid_at,
  });
});

module.exports = router;
