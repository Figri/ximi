// Contract tests use the real Supabase SDK with a local Auth HTTP adapter.
// They never send mail, use a real user's token, or claim production sign-in.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const out = join(mkdtempSync(join(tmpdir(), 'ximi-login-')), 'login.cjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../lib/osLogin.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
const { parseOsLoginInput: parse, completeOsLogin: login, sendOsLoginEmail: send } = createRequire(import.meta.url)(out);
const base = 'https://test-only.supabase.co';
assert.deepEqual(parse('123 456', base), { kind: 'code', token: '123456' });
assert.deepEqual(parse(`${base}/auth/v1/verify?token=confirmation-hash&type=signup&redirect_to=http%3A%2F%2Flocalhost%3A3000`, base), { kind: 'confirmation', tokenHash: 'confirmation-hash', type: 'signup' });
assert.deepEqual(parse(`${base}/auth/v1/verify?token_hash=login-hash&type=email`, base), { kind: 'confirmation', tokenHash: 'login-hash', type: 'email' });
assert.deepEqual(parse(`${base}/auth/v1/verify?token=login-hash&type=magiclink`, base), { kind: 'confirmation', tokenHash: 'login-hash', type: 'magiclink' });
for (const value of [
  'https://other.supabase.co/auth/v1/verify?token=secret&type=email',
  'https://test-only.supabase.co.attacker.invalid/auth/v1/verify?token=secret&type=email',
  'https://user:pass@test-only.supabase.co/auth/v1/verify?token=secret&type=email',
  'http://test-only.supabase.co/auth/v1/verify?token=secret&type=email',
  `${base}/auth/v1/verify?token=secret&type=email_change`,
  `${base}/auth/v1/verify?token=secret&type=recovery`,
  `${base}/auth/v1/verify?type=signup`, '', 'not a link',
]) assert.throws(() => parse(value, base));
assert.throws(() => parse('http://localhost:3000/#error=access_denied&error_code=otp_expired', base), /已失效/);
console.log('✓ 验证码、注册/登录邮件链接、来源校验和失效链接提示');

const user = { id: '00000000-0000-4000-8000-000000000010', aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })).toString('base64url')}.local-test-signature`;
const calls = [];
const cloud = createClient(base, 'test-public-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (input, init) => {
  const url = new URL(input); const body = init?.body ? JSON.parse(init.body) : null;
  calls.push({ path: url.pathname, body });
  if (url.pathname.endsWith('/otp')) return Response.json({});
  if (body?.token_hash === 'expired') return Response.json({ error_code: 'otp_expired', msg: 'expired' }, { status: 403 });
  if (url.pathname.endsWith('/verify')) return Response.json({ access_token: jwt, token_type: 'bearer', refresh_token: 'test-refresh', expires_in: 3600, user });
  if (url.pathname.endsWith('/user')) return Response.json(user);
  throw new Error('unexpected auth endpoint');
} } });
await send(cloud.auth, ' test@example.invalid ');
assert.equal(calls.at(-1).body.email, 'test@example.invalid');
assert.equal(calls.at(-1).body.create_user, true);
const beforeInvalidEmail = calls.length;
await assert.rejects(send(cloud.auth, ''), /完整邮箱/);
assert.equal(calls.length, beforeInvalidEmail);
console.log('✓ 首次邮箱注册沿用官方SDK，空邮箱不发送请求');
await login(cloud.auth, ' test@example.invalid ', '123456', base);
assert.equal(calls.at(-1).body.email, 'test@example.invalid');
assert.equal(calls.at(-1).body.token, '123456');
await login(cloud.auth, '', `${base}/auth/v1/verify?token=confirmation-hash&type=signup`, base);
assert.equal(calls.at(-1).body.token_hash, 'confirmation-hash');
assert.equal(calls.at(-1).body.type, 'signup');
assert.equal((await cloud.auth.getUser()).data.user.id, user.id);
console.log('✓ 真实SDK将邮件链接兑换为会话，未打开错误跳转页');
const callback = `http://localhost:3000/#access_token=${jwt}&refresh_token=test-refresh&type=signup`;
await login(cloud.auth, '', callback, base);
assert.equal(calls.at(-1).path, '/auth/v1/user');
assert.equal((await cloud.auth.getSession()).data.session.user.id, user.id);
assert.equal(parse(`ximios://os-connect#access_token=${jwt}&refresh_token=test-refresh`, base).kind, 'session');
console.log('✓ 确认邮件后跳转失败的localhost地址仍可导入并验证会话');
await assert.rejects(login(cloud.auth, '', `${base}/auth/v1/verify?token=expired&type=email`, base), /过期或已使用/);
const before = calls.length;
await assert.rejects(login(cloud.auth, '', 'https://attacker.invalid/#access_token=secret&refresh_token=secret', base), /不是西米OS/);
assert.equal(calls.length, before);
console.log('✓ 已使用链接给出恢复步骤，非本项目链接不发起网络请求');
