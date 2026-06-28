# 鼎脉人脉 (dingmai-club)

高端人脉资源共享平台 — 静态前端 + Express + SQLite。

## 本地运行

```bash
npm install
cp server/payment-config.example.js server/payment-config.js
cp server/alipay.example.js server/alipay.js
# 编辑上述两个文件填入支付配置（勿提交到 Git）
npm run seed   # 可选：初始化数据
npm start      # 默认 http://localhost:3000
```

## 环境变量（可选）

| 变量 | 说明 |
|------|------|
| `BASE_URL` | 站点对外 URL（支付回调） |
| `JWT_SECRET` / `JWT_ADMIN_SECRET` | 见 `server/auth.js` |

## 上传到 GitHub

本仓库已通过 `.gitignore` 排除数据库、上传文件与支付密钥。首次 push 前请确认未误提交 `server/payment-config.js`、`server/alipay.js`。