import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

// Build with test-only.supabase.co and a dummy public key; every request is
// intercepted below. This test does not log in a real user or send real email.
const root = resolve(process.env.XIMI_LOGIN_WEB_DIR ?? '/tmp/ximi-login-web');
const screenshotDir = mkdtempSync(resolve(tmpdir(), 'ximi-login-ui-'));
const server = createServer((req, res) => {
  let file = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + '/') || !existsSync(file) || !extname(file)) file = resolve(root, 'index.html');
  res.setHeader('Content-Type', extname(file) === '.js' ? 'text/javascript' : extname(file) === '.html' ? 'text/html' : 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const user = { id: '00000000-0000-4000-8000-000000000020', email: 'test@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })).toString('base64url')}.local-test-signature`;
let activePage;
let observedCalls;
try {
  for (const scenario of ['confirmation', 'callback', 'invalid', 'expired']) {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const calls = [];
    observedCalls = calls;
    const errors = [];
    await context.route('https://test-only.supabase.co/**', async (route) => {
      const req = route.request(); const path = new URL(req.url()).pathname;
      const body = req.postDataJSON();
      calls.push({ path, body });
      let status = 200; let data = [];
      if (path.endsWith('/verify')) {
        if (body.token_hash === 'expired') { status = 403; data = { error_code: 'otp_expired', msg: 'expired' }; }
        else data = { access_token: jwt, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user };
      } else if (path.endsWith('/user')) data = user;
      else if (path.endsWith('/otp')) data = {};
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    const page = await context.newPage();
    activePage = page;
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${origin}/os-connect`);
    await page.getByTestId('cloud-email').fill(user.email);
    await page.getByTestId('cloud-code').waitFor();
    assert.match(await page.getByTestId('cloud-code').getAttribute('placeholder'), /完整链接/);
    const value = scenario === 'callback' ? `http://localhost:3000/#access_token=${jwt}&refresh_token=test-refresh&type=signup`
      : scenario === 'invalid' ? 'https://wrong.invalid/auth/v1/verify?token=secret&type=signup'
      : `https://test-only.supabase.co/auth/v1/verify?token=${scenario === 'expired' ? 'expired' : 'fresh-hash'}&type=signup&redirect_to=http%3A%2F%2Flocalhost%3A3000`;
    await page.getByTestId('cloud-code').fill(value);
    await page.getByTestId('cloud-login').click();
    if (scenario === 'confirmation' || scenario === 'callback') {
      await page.getByTestId('cloud-enable').waitFor();
      assert.equal(await page.getByTestId('cloud-code').count(), 0);
      assert.match(await page.getByText(`已登录：${user.email}`).textContent(), /已登录/);
      if (scenario === 'confirmation') assert.ok(calls.some((c) => c.path.endsWith('/verify') && c.body.token_hash === 'fresh-hash'));
      else assert.ok(calls.some((c) => c.path.endsWith('/user')));
      await page.screenshot({ path: resolve(screenshotDir, `${scenario}.png`) });
    } else {
      await page.getByTestId('cloud-message').waitFor();
      assert.match(await page.getByTestId('cloud-message').textContent(), scenario === 'expired' ? /过期或已使用/ : /不是西米OS/);
      assert.equal(await page.getByTestId('cloud-enable').count(), 0);
      if (scenario === 'invalid') assert.ok(!calls.some((c) => c.path.endsWith('/verify')));
    }
    assert.deepEqual(errors, []);
    console.log(`✓ 真实页面粘贴并操作：${scenario}`);
    await context.close();
  }
  console.log(`Screenshots: ${screenshotDir}`);
} catch (error) {
  if (activePage) {
    console.error((await activePage.locator('body').innerText()).slice(0,1800));
    console.error(observedCalls.map((c) => ({ path: c.path, bodyKeys: c.body ? Object.keys(c.body) : [] })));
    await activePage.screenshot({ path: resolve(screenshotDir,'failure.png') });
  }
  throw error;
} finally { await browser.close(); server.close(); }
