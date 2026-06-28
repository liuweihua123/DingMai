import { chromium } from 'playwright';
import path from 'path';
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

// ── 积分充值（全页截图） ──
const userRes = await api('/api/auth/register', {
  username: 'snap_user_' + Date.now(),
  password: 'demo123456',
});
const userCtx = await browser.newContext({
  viewport: { width: 1440, height: 2000 },
  locale: 'zh-CN',
  deviceScaleFactor: 1,
});
const up = await userCtx.newPage();
await up.addInitScript(([t, u]) => {
  localStorage.setItem('club_token', t);
  localStorage.setItem('club_user', JSON.stringify(u));
}, [userRes.token, userRes.user]);
await up.goto(BASE + '/user.html', { waitUntil: 'networkidle', timeout: 60000 });
await up.waitForTimeout(2500);
// 点击积分充值 tab
const tabs = await up.locator('[data-tab], .tab, button, a').allTextContents();
const chargeTab = up.locator('[data-tab="charge"], .tab:has-text("充值"), button:has-text("充值"), a:has-text("充值"), div:has-text("积分充值")').first();
if (await chargeTab.count()) {
  await chargeTab.click();
  await up.waitForTimeout(1500);
}
await up.screenshot({ path: path.join(OUT, '07-points.png'), fullPage: true });
console.log('✓ 积分充值（全页）');
await up.close();
await userCtx.close();

// ── 后台管理（等 rate limit 恢复，新 context） ──
const adminRes = await api('/api/admin/login', {
  username: 'admin',
  password: 'admin123',
});
const adminCtx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  deviceScaleFactor: 1,
});
const ap = await adminCtx.newPage();
await ap.addInitScript((t) => {
  localStorage.setItem('admin_token', t);
}, adminRes.token);
await ap.goto(BASE + '/admin.html', { waitUntil: 'networkidle', timeout: 60000 });
await ap.waitForTimeout(3000);
await ap.screenshot({ path: path.join(OUT, '09-admin.png'), fullPage: false });
console.log('✓ 后台管理');
await ap.close();
await adminCtx.close();

await browser.close();
