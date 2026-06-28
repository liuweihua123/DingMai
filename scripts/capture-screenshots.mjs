import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');

const api = async (p, body) => {
  const res = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  deviceScaleFactor: 1,
});
fs.mkdirSync(OUT, { recursive: true });

const go = async (page, url, file, name) => {
  await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  console.log('✓', name, file);
};

// ── 公开页面 ──
const pub = await context.newPage();
const PUBLIC = [
  { file: '01-home.png', path: '/', name: '首页' },
  { file: '02-resources.png', path: '/list.html', name: '人脉资源' },
  { file: '03-forum.png', path: '/forum.html', name: '论坛' },
  { file: '04-login.png', path: '/login.html', name: '登录注册' },
];
for (const p of PUBLIC) await go(pub, p.path, p.file, p.name);
await pub.close();

// ── 注册测试用户，登录获取 token ──
const regRes = await api('/api/auth/register', {
  username: 'demo_user_' + Date.now(),
  password: 'demo123456',
});
const userToken = regRes.token;
const userObj = regRes.user;

const injectAuth = async (page, token, user) => {
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('club_token', t);
    localStorage.setItem('club_user', JSON.stringify(u));
  }, [token, user]);
};

// ── 用户中心 ──
const userCtx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  deviceScaleFactor: 1,
});
const up = await userCtx.newPage();
await injectAuth(up, userToken, userObj);

await go(up, '/user.html', '06-user.png', '用户中心');
// 点击「积分充值」tab
const chargeTab = up.locator('text=积分充值, text=充值, [data-tab="charge"], .tab:has-text("充值"), a:has-text("充值"), button:has-text("充值")').first();
if (await chargeTab.count()) {
  await chargeTab.click();
  await up.waitForTimeout(1500);
}
await up.screenshot({ path: path.join(OUT, '07-points.png'), fullPage: false });
console.log('✓', '积分充值', '07-points.png');
await up.close();
await userCtx.close();

// ── 发布资源（需要登录） ──
const pubCtx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  deviceScaleFactor: 1,
});
const pp = await pubCtx.newPage();
await injectAuth(pp, userToken, userObj);
await go(pp, '/publish.html', '08-publish.png', '发布资源');
await pp.close();
await pubCtx.close();

// ── 管理员登录 ──
const adminRes = await api('/api/admin/login', {
  username: 'admin',
  password: 'admin123',
});
const adminToken = adminRes.token;

const adminCtx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  deviceScaleFactor: 1,
});
const ap = await adminCtx.newPage();
await ap.addInitScript((t) => {
  localStorage.setItem('admin_token', t);
}, adminToken);
await go(ap, '/admin.html', '09-admin.png', '后台管理');
await ap.close();
await adminCtx.close();

await browser.close();
console.log('Done');
