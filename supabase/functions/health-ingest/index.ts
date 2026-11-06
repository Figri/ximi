// health-ingest：接 HC Webhook（手机上 Health Connect → 定时推送）发来的健康数据，写进 health_records。
// - 只收 POST；请求头 x-secret 不对 → 401（密钥只在数据库里存哈希，见 migrations/013_health_records.sql）
// - 整包原样存一行（type = 'payload'），再按格式拆成一条条（parse.ts），按 (type, start_time, end_time) upsert
// - 部署时 verify_jwt = false：手机那边不带 Supabase 的 JWT，靠 x-secret 认
import { parsePayload } from './parse.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHUNK = 1000;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'only POST' });

  const secret = req.headers.get('x-secret') ?? '';
  try {
    if (!secret || !(await rpc('health_ingest_ok', { p_secret: secret }))) return json(401, { ok: false, error: 'bad secret' });
  } catch (e) {
    console.error('secret check failed', e);
    return json(500, { ok: false, error: 'secret check failed' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('not an object');
  } catch {
    return json(400, { ok: false, error: 'body is not a JSON object' });
  }

  const { rows, replaceIds, counts, skipped } = parsePayload(payload);
  try {
    let written = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      written += Number(
        await rpc('health_ingest', { p_secret: secret, p_rows: rows.slice(i, i + CHUNK), p_replace_ids: i === 0 ? replaceIds : [] })
      );
    }
    return json(200, { ok: true, written, counts, skipped, replaced: replaceIds.length });
  } catch (e) {
    // 500 让 HC Webhook 下次再推一遍（它会留着没送到的）
    console.error('ingest failed', e);
    return json(500, { ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) });
  }
});
