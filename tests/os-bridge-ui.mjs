// Uses the records produced by the actual SQL/MCP/mobile integration test.
// Serves a real Expo export and clicks it in Chromium. No production credentials.
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const dir = mkdtempSync(resolve(tmpdir(), 'ximi-ui-'));
const fixture = resolve(dir, 'storage.json');
const integration = spawnSync(process.execPath, ['tests/os-bridge.test.mjs'], { env: { ...process.env, XIMI_TEST_STORAGE: fixture }, encoding: 'utf8' });
if (integration.status !== 0) throw new Error(integration.stdout + integration.stderr);
const storage = JSON.parse(readFileSync(fixture, 'utf8'));
const types = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const root = resolve('dist');
  let file = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + '/')) file = resolve(root, 'index.html');
  if (!existsSync(file) || !extname(file)) file = resolve(root, 'index.html');
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, timezoneId: 'UTC' });
  await page.clock.install({ time: new Date('2026-11-12T12:00:00Z') });
  await page.addInitScript((data) => { for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v); }, storage);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByTestId('os-reviews').waitFor();
  const body = page.getByTestId('review-body-mcp-review');
  const expected = JSON.parse(storage.ldb_v1_os_reviews_0)[0].body;
  assert.equal(await body.textContent(), expected);
  console.log('✓ 实际MCP写回复盘在今日页全文显示（无截断）');
  await page.getByTestId('review-search').fill('没有这个关键词');
  await body.waitFor({ state: 'detached' });
  await page.getByTestId('review-search').fill('情绪变化');
  await body.waitFor();
  assert.equal(await body.textContent(), expected);
  await page.getByText('本地验收复盘 · 记录', { exact: false }).click();
  await body.waitFor({ state: 'detached' });
  await page.getByText('本地验收复盘 · 记录', { exact: false }).click();
  await body.waitFor();
  console.log('✓ 全文搜索、收起和展开');
  await page.getByTestId('review-search').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(dir, 'review.png') });
  await page.goto(`${url}/os-connect`);
  await page.getByTestId('cloud-email').fill('test@example.invalid');
  await page.getByTestId('cloud-send-code').click();
  assert.match(await page.getByTestId('cloud-message').textContent(), /尚未配置/);
  assert.match(await page.getByTestId('cloud-status').textContent(), /尚未同步/);
  await page.screenshot({ path: resolve(dir, 'connection.png') });
  console.log('✓ 未配置云端时明确显示失败，未伪造已连接/同步成功');
  await page.goto(`${url}/os-consent`);
  await page.getByTestId('consent-message').waitFor();
  assert.match(await page.getByTestId('consent-message').textContent(), /缺少授权请求/);
  assert.equal(await page.getByTestId('consent-approve').count(), 0);
  console.log('✓ 缺少OAuth请求时禁止授权');
  assert.deepEqual(errors, []);
  console.log(`Screenshots: ${dir}`);
} finally { await browser.close(); server.close(); }
