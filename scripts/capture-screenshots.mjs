import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');

const PAGES = [
  { file: '01-home.png', path: '/', name: '首页' },
  { file: '02-resources.png', path: '/list.html', name: '人脉资源' },
  { file: '03-forum.png', path: '/forum.html', name: '论坛' },
  { file: '04-login.png', path: '/login.html', name: '登录注册' },
  { file: '05-publish.png', path: '/publish.html', name: '发布' },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  deviceScaleFactor: 1,
});
const page = await context.newPage();

fs.mkdirSync(OUT, { recursive: true });

for (const p of PAGES) {
  const url = BASE.replace(/\/$/, '') + p.path;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const outPath = path.join(OUT, p.file);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log('OK', p.name, outPath);
}

await page.goto(BASE + '/list.html', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);
const detailLink = page.locator('a[href*="detail"]').first();
if (await detailLink.count()) {
  await detailLink.click();
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(OUT, '06-detail.png'),
    fullPage: false,
  });
  console.log('OK', '详情', path.join(OUT, '06-detail.png'));
}

await browser.close();