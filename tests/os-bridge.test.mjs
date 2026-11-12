// PostgreSQL (PGlite) + real application sync code + official MCP client/server.
// Local contract/integration tests; these do NOT establish production connectivity.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const pg = new PGlite();
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
await pg.exec(`create role anon; create role authenticated;
  create schema auth; create table auth.users(id uuid primary key);
  insert into auth.users values ('${A}'),('${B}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
await pg.exec(readFileSync(new URL('../supabase/migrations/014_os_bridge.sql', import.meta.url), 'utf8'));
let checks = 0;
function pass(name) { checks++; console.log(`✓ ${name}`); }
let serial = Promise.resolve();
function as(user, sql, params = [], role = 'authenticated') {
  const task = serial.catch(() => {}).then(() => pg.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? '']);
    return (await tx.query(sql, params)).rows;
  }));
  serial = task; return task;
}
async function rpcFor(user, name, args) {
  const entries = Object.entries(args);
  const named = entries.map(([k], i) => `${k} => $${i + 1}`).join(',');
  const values = entries.map(([, v]) => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
  return (await as(user, `select public.${name}(${named}) as result`, values))[0].result;
}
const at = '2026-11-12T10:00:00.000Z';
function write(id, text, version = 0, operation = randomUUID(), user = A) {
  return rpcFor(user, 'ximi_write_record', { p_kind: 'fragment', p_id: id, p_date: '2026-11-12', p_payload: { id, text, at }, p_expected_version: version, p_operation_id: operation });
}
const op = randomUUID();
const first = await write('f1', 'OS 测试记录', 0, op);
assert.equal(first.record.version, 1);
assert.deepEqual(await write('f1', 'OS 测试记录', 0, op), first);
pass('重复请求返回同一结果，不产生第二个版本');
await assert.rejects(write('f1', '另一份数据', 0, op), /reused/);
assert.equal((await write('f1', '过期编辑', 0)).code, 'conflict');
assert.equal((await write('f1', '用户纠正', 1)).record.version, 2);
pass('幂等键内容校验、旧版本拒绝和正确版本更新');
await rpcFor(A, 'ximi_write_record', { p_kind: 'fragment', p_id: 'mood-link', p_date: '2026-11-12', p_payload: { id: 'mood-link', text: '累', at, face: '😪', state_event_id: 'linked-mood' }, p_expected_version: 0, p_operation_id: randomUUID(), p_source: 'os' });
assert.equal((await write('mood-link', '有点累', 1)).record.payload.state_event_id, 'linked-mood');
pass('AI编辑随心记保留原表情与情绪关联');
assert.equal((await rpcFor(B, 'ximi_read_records', { p_kind: 'fragment' })).length, 0);
assert.equal((await as(B, 'select * from public.ximi_fragments')).length, 0);
await assert.rejects(as(A, "update public.ximi_fragments set payload='{}'"), /permission denied/);
await assert.rejects(as(null, 'select * from public.ximi_fragments', [], 'anon'), /permission denied/);
await assert.rejects(as(null, "select public.ximi_read_records('fragment')", [], 'anon'), /permission denied/);
pass('跨用户读隔离、匿名拒绝、绕过RPC直接写入拒绝');
const longBody = '完整复盘正文与情绪变化。\n'.repeat(12000);
const review = { p_kind: 'review', p_id: 'r1', p_date: '2026-11-12', p_payload: { id: 'r1', body: longBody, at, date: '2026-11-12' }, p_expected_version: 0, p_operation_id: randomUUID() };
assert.equal((await rpcFor(A, 'ximi_write_record', review)).record.payload.body, longBody);
assert.equal((await rpcFor(A, 'ximi_read_records', { p_kind: 'review', p_date: '2026-11-12', p_query: '情绪变化' }))[0].payload.body.length, longBody.length);
assert.equal((await rpcFor(A, 'ximi_read_records', { p_kind: 'review', p_date: '2026-11-11' })).length, 0);
pass('长正文原样保存、按日期隔离、全文关键字检索');
const page = await rpcFor(A, 'ximi_read_records', { p_kind: 'fragment', p_limit: 1 });
assert.equal(page.length, 1);
assert.equal((await rpcFor(A, 'ximi_read_records', { p_kind: 'fragment', p_after: page[0].revision })).length, 1);
await assert.rejects(rpcFor(A, 'ximi_read_records', { p_kind: 'fragment', p_limit: 201 }), /invalid query/);
assert.equal((await as(A, "select * from public.ximi_record_versions where kind='fragment' and id='f1'")).length, 2);
pass('分页游标、边界参数、历史版本');

// Test actual mobile modules with in-memory AsyncStorage and a PostgreSQL RPC
// adapter. Auth service and device storage are substitutes, explicitly local.
const memory = new Map();
const storage = {
  getItem: async (key) => memory.get(key) ?? null,
  setItem: async (key, value) => { memory.set(key, value); },
  removeItem: async (key) => { memory.delete(key); },
  getMany: async (keys) => Object.fromEntries(keys.map((k) => [k, memory.get(k) ?? null])),
  setMany: async (entries) => { for (const [k, v] of Object.entries(entries)) memory.set(k, v); },
  removeMany: async (keys) => { keys.forEach((k) => memory.delete(k)); },
};
let dropResponse = false;
const cloud = { auth: { getUser: async () => ({ data: { user: { id: B } } }) }, rpc: async (name, args) => {
  try {
    const data = await rpcFor(B, name, args);
    if (dropResponse && name === 'ximi_write_record') { dropResponse = false; throw new Error('connection interrupted after commit'); }
    return { data, error: null };
  } catch (error) { return { data: null, error }; }
} };
const modules = new Map();
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
function load(file) {
  const abs = resolve(root, file);
  if (modules.has(abs)) return modules.get(abs).exports;
  const module = { exports: {} }; modules.set(abs, module);
  const code = ts.transpileModule(readFileSync(abs, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = (name) => {
    if (name === '@react-native-async-storage/async-storage') return { default: storage, __esModule: true };
    if (name === './osCloud') return { osCloud: () => cloud };
    if (name === './dataBus') return { useDataBus: { getState: () => ({ bump() {} }) } };
    if (name === './ling/settings') return { loadLingSettings: async () => ({ dayStartHour: 5 }), lingDayKey: (d) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10) };
    if (name.startsWith('.')) return load(resolve(dirname(abs), name + '.ts'));
    return require(name);
  };
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}
const local = load('lib/localdb.ts');
const sync = load('lib/osSync.ts');
await local.db.from('fragments').insert({ id: 'mobile-f1', at, text: '我今天有点累', created_at: at });
await sync.enableOsSync();
assert.ok(memory.has('os_before_cloud_v1'));
let rows = await rpcFor(B, 'ximi_read_records', { p_kind: 'fragment' });
assert.equal(rows[0].payload.text, '我今天有点累');
pass('实际手机同步模块：启用前备份，本地随心记上传到PostgreSQL');
await local.db.from('fragments').update({ text: '后来好多了' }).eq('id', 'mobile-f1');
dropResponse = true;
await assert.rejects(sync.syncOs(), /interrupted/);
await sync.syncOs();
rows = await rpcFor(B, 'ximi_read_records', { p_kind: 'fragment' });
assert.equal(rows[0].version, 2);
assert.equal(rows[0].payload.text, '后来好多了');
pass('提交后断线：持久化outbox用原幂等键重试，未重复写入');
const savedChunk = memory.get('ldb_v1_fragments_0');
memory.set('ldb_v1_fragments_0', 'broken JSON');
await assert.rejects(sync.syncOs(), /JSON/);
assert.equal((await rpcFor(B, 'ximi_read_records', { p_kind: 'fragment' }))[0].deleted, false);
memory.set('ldb_v1_fragments_0', savedChunk);
pass('本地块损坏时停止同步，不上传误删除');

// Real official SDK client calls the actual Edge handler. Supabase Auth is a
// local test adapter; DB operations still execute under authenticated RLS roles.
const temp = mkdtempSync(resolve(tmpdir(), 'ximi-mcp-'));
let source = ts.transpileModule(readFileSync(resolve(root, 'supabase/functions/os-mcp/handler.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
source = source.replace('npm:@modelcontextprotocol/server@2.4.0', import.meta.resolve('@modelcontextprotocol/server')).replace('npm:zod@4.3.6', import.meta.resolve('zod'));
writeFileSync(resolve(temp, 'handler.mjs'), source);
const { createHandler } = await import(pathToFileURL(resolve(temp, 'handler.mjs')));
const handler = createHandler({ url: 'https://test.supabase.invalid', key: 'test-public-key', publicUrl: 'https://test.invalid/mcp' }, async (input, init) => {
  const url = new URL(input);
  const bearer = init.headers.Authorization;
  const user = bearer === 'Bearer owner-b' ? B : bearer === 'Bearer owner-a' ? A : null;
  if (url.pathname === '/auth/v1/user') return Response.json(user ? { id: user } : { error: 'bad token' }, { status: user ? 200 : 401 });
  if (url.pathname.includes('/rpc/')) {
    try { return Response.json(await rpcFor(user, url.pathname.split('/').at(-1), JSON.parse(init.body))); }
    catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
  }
  if (url.pathname.endsWith('/ximi_sync_operations')) return Response.json(await as(user, "select operation_id,result->'ok' as ok,result->'code' as code,created_at from public.ximi_sync_operations order by created_at desc limit 5"));
  throw new Error('unexpected fetch');
});
assert.equal((await handler(new Request('https://test.invalid/mcp'))).status, 401);
assert.equal((await handler(new Request('https://test.invalid/mcp', { headers: { Authorization: 'Bearer invalid' } }))).status, 401);
pass('MCP未授权、无效token拒绝，暴露OAuth发现挑战');
const client = new Client({ name: 'ximi-local-test', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('https://test.invalid/mcp'), {
  requestInit: { headers: { Authorization: 'Bearer owner-b' } },
  fetch: async (input, init) => handler(input instanceof Request ? input : new Request(input, init)),
}));
const tools = await client.listTools();
assert.equal(tools.tools.length, 4);
const read = await client.callTool({ name: 'get_daily_records', arguments: { date: '2026-11-12' } });
assert.equal(JSON.parse(read.content[0].text).records[0].payload.text, '后来好多了');
const args = { date: '2026-11-12', kind: 'review', id: 'mcp-review', expected_version: 0, operation_id: randomUUID(), confirmed: true, payload: { id: 'mcp-review', at, title: '本地验收复盘', body: longBody } };
const written = await client.callTool({ name: 'upsert_daily_record', arguments: args });
assert.equal(JSON.parse(written.content[0].text).record.payload.body, longBody);
assert.equal(JSON.parse((await client.callTool({ name: 'upsert_daily_record', arguments: args })).content[0].text).record.version, 1);
assert.equal((await client.callTool({ name: 'upsert_daily_record', arguments: { ...args, confirmed: false } })).isError, true);
pass('官方MCP协议协商、工具发现、读取OS记录、确认后写回复盘及重试');
const status = JSON.parse((await client.callTool({ name: 'get_latest_sync_status', arguments: {} })).content[0].text);
assert.equal(status.notion_backup, 'not_configured');
assert.equal(status.automatic_chatgpt_history, 'unavailable');
assert.ok(status.operations.every((o) => !('result' in o) && !('payload' in o)));
pass('状态工具只返回结果元数据，不夹带历史全文或虚报Notion备份');
await sync.syncOs();
assert.equal((await local.readTable('os_reviews'))[0].body, longBody);
assert.equal((await local.db.from('os_reviews').select('*').ilike('body', '%情绪变化%')).data.length, 1);
pass('MCP写回的完整复盘下载到OS现有本地数据库');
if (process.env.XIMI_TEST_STORAGE) writeFileSync(process.env.XIMI_TEST_STORAGE, JSON.stringify(Object.fromEntries([...memory.entries()].filter(([key]) => key.startsWith('ldb_v1_')))));
const payload = rows[0].payload;
await rpcFor(B, 'ximi_write_record', { p_kind: 'fragment', p_id: 'mobile-f1', p_date: '2026-11-12', p_payload: { ...payload, text: '云端新编辑' }, p_expected_version: 2, p_operation_id: randomUUID() });
await local.db.from('fragments').update({ text: '本地手动纠正' }).eq('id', 'mobile-f1');
await assert.rejects(sync.syncOs(), /版本冲突/);
assert.equal((await local.readTable('fragments'))[0].text, '本地手动纠正');
assert.ok(memory.has('os_sync_conflict_v1'));
pass('本地与云端并发修改：停止覆盖并保留双方副本');
assert.equal(await local.compareAndSetRow('fragments', 'mobile-f1', payload, { ...payload, text: '旧备份' }), false);
await storage.setItem(sync.SYNC_RESTORE_BLOCK, 'test');
await assert.rejects(sync.syncOs(), /恢复备份后/);
pass('下载CAS保护本地新编辑，恢复旧备份后阻止自动覆盖');
await client.close();
await pg.close();
console.log(`\n${checks} integration groups passed (local PostgreSQL/MCP; not production).`);
