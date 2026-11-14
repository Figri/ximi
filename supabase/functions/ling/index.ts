import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { dayInZone, retrievalSources, lexicalSources, chunks, type Source } from './core.ts';
import { sha, records, write, stamp, runDaily, sendPush } from './worker.ts';
import { archiveNotion } from './archive.ts';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,authorization,apikey', 'Access-Control-Allow-Methods': 'POST,OPTIONS,GET', 'Cache-Control': 'no-store' };
const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
let inference: any;
async function embedding(text: string) { inference ??= new Supabase.ai.Session('gte-small'); return Array.from(await inference.run(text, { mean_pool: true, normalize: true })); }
async function indexSources(device:any){
 const changed=await db.from('ling_records').select('id,kind,payload,revision').eq('device_id',device.id).in('kind',['ling_sources','ling_favorites']).gt('revision',device.index_cursor??0).order('revision').limit(2);if(changed.error)throw changed.error;let built=0;
 for(const row of changed.data??[]){const s=row.payload,parts=s.deleted?[]:chunks(s.text,650);const {data:old,error}=await db.from('ling_chunks').select('part,content_hash').eq('device_id',device.id).eq('source_id',s.id);if(error)throw error;
 for(let i=0;i<parts.length;i++){const hash=await sha(parts[i]);if(old?.some(r=>r.part===i&&r.content_hash===hash))continue;
 const reused=await db.from('ling_chunks').select('embedding').eq('device_id',device.id).eq('content_hash',hash).limit(1);const v=reused.data?.[0]?.embedding??JSON.stringify(await embedding(parts[i]));
 const saved=await db.from('ling_chunks').upsert({device_id:device.id,source_id:s.id,part:i,text:parts[i],content_hash:hash,embedding:v,model:'gte-small'});if(saved.error)throw saved.error;if(++built>=5)return built;
 }await db.from('ling_chunks').delete().eq('device_id',device.id).eq('source_id',s.id).gte('part',parts.length);const advanced=await db.from('ling_devices').update({index_cursor:row.revision}).eq('id',device.id);if(advanced.error)throw advanced.error;
 }return built;
}
async function authorized(body: any) { if (typeof body.device_id !== 'string' || typeof body.token !== 'string' || body.token.length < 40)
    throw new Error('auth'); const { data, error } = await db.from('ling_devices').select('*').eq('id', body.device_id).eq('token_hash', await sha(body.token)).maybeSingle(); if (error || !data)
    throw new Error('auth'); return data; }
async function worker() { const { data: devices, error } = await db.from('ling_devices').select('*').eq('enabled', true).limit(20); if (error)
    throw error; const summary = []; for (const device of devices ?? []) {
    const started=Date.now();let result: any = { device_id: device.id };
    try {if(device.next_run_at&&device.next_run_at<=stamp()){await runDaily(db,device);result.daily='processed';}}catch(e){result.daily_error=e instanceof Error?e.message:'后台整理失败';}
    if(Date.now()-started>90000){summary.push(result);continue;}
    try{const {data:runs}=await db.from('ling_runs').select('*').eq('device_id',device.id).eq('status','done').in('push_status',['pending','failed','missing_token']).order('day',{ascending:false}).limit(1);for(const run of runs??[])result.push=await sendPush(db,device,run);}catch{result.push_error='推送暂不可用，消息仍已保存';}
    try{result.indexed=await indexSources(device);}catch{result.index_error='语义索引暂不可用，关键词检索仍可使用';}
    try{result.notion=await archiveNotion(db,device);}catch(e){result.notion_error=e instanceof Error?e.message:'归档失败';}
    summary.push(result);
} return summary; }
Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS')
        return new Response('ok', { headers: cors });
    if (req.method === 'GET')
        return json({ service: 'ling', version: '1.0.0' });
    try {
        const body = await req.json();
        if (body.action === 'worker') {
            const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
            const check = await db.rpc('ling_worker_authorized', { p_secret: token });
            if (check.error || !check.data)
                return json({ error: '无权调度' }, 401);
            return json({ results: await worker() });
        }
        if (body.action === 'register') {
            const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n => n.toString(16).padStart(2, '0')).join('');
            const { data, error } = await db.from('ling_devices').insert({ token_hash: await sha(token) }).select('id').single();
            if (error)
                throw error;
            return json({ device_id: data.id, token });
        }
        const device = await authorized(body);
        if (body.action === 'configure') {
            const config = body.config ?? device.config;
            try {
                new Intl.DateTimeFormat('en', { timeZone: config.timezone }).format();
            }
            catch {
                return json({ error: '无效时区' }, 400);
            }
            const credentials = { ...device.credentials };
            for (const k of ['api_key', 'notion_token', 'notion_parent', 'provider', 'model_option'])
                if (typeof body[k] === 'string' && body[k])
                    credentials[k] = body[k];
            if(body.notion_token===null){delete credentials.notion_token;delete credentials.notion_parent;}
            let next = device.next_run_at;
            if (!next||config.timezone!==device.config.timezone) {
                const now = new Date(), day = dayInZone(now, config.timezone, 0), local = new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);
                const [h, m, s] = local.split(':').map(Number);
                const seconds = h * 3600 + m * 60 + s;
                next = new Date(now.getTime() + ((5 * 3600 - seconds + 86400) % 86400 || 86400) * 1000).toISOString();
            }
            const update = await db.from('ling_devices').update({ config, credentials, active_thread: device.active_thread??body.active_thread, push_token: body.push_token ?? device.push_token, enabled: !!config.background && !!credentials.api_key, next_run_at: next, updated_at: stamp() }).eq('id', device.id);
            if (update.error)
                throw update.error;
            return json({ ok: true, next_run_at: next });
        }
        if(body.action==='begin_chat'){const r=await db.rpc('ling_begin_chat',{p_device:device.id});if(r.error)throw r.error;return r.data?json({ok:true}):json({error:'正在整理并续页，请稍后重试，输入内容已保留'},409);}
        if(body.action==='end_chat'){await db.from('ling_devices').update({busy_until:null}).eq('id',device.id);return json({ok:true});}
        if(body.action==='active_thread'){const {data:row}=await db.from('ling_records').select('payload').eq('device_id',device.id).eq('kind','ling_threads').eq('id',body.thread_id).maybeSingle();if(row&&!row.payload.archived)await db.from('ling_devices').update({active_thread:body.thread_id}).eq('id',device.id);return json({ok:true});}
        if (body.action === 'push') {
            if (!Array.isArray(body.records) || body.records.length > 100)
                return json({ error: '请分批同步' }, 400);
            const { data, error } = await db.rpc('ling_write_records', { p_device: device.id, p_records: body.records });
            if (error)
                throw error;
            return json(data);
        }
        if (body.action === 'pull') {
            const { data, error } = await db.from('ling_records').select('kind,id,payload,version,revision').eq('device_id', device.id).gt('revision', Number(body.since) || 0).order('revision').limit(100);
            if (error)
                throw error;
            return json({ records: data });
        }
        if (body.action === 'search') {
            if (typeof body.query !== 'string' || !body.query.trim())
                return json({ results: [], mode: 'keyword' });
            const sources = retrievalSources((await records(db, device.id, 'ling_sources')).map(r => r.payload) as Source[],(await records(db,device.id,'ling_favorites')).map(r=>r.payload),(await records(db,device.id,'ling_memories')).filter(r=>r.payload.status==='forgotten').flatMap(r=>r.payload.source_ids??[]));
            const lexical = lexicalSources(sources, body.query, 4);
            if (/第一|最早/.test(body.query))
                return json({ results: lexical, mode: 'date' });
            let semantic: any[] = [];
            let mode = 'hybrid';
            try {
                const vector = await embedding(body.query);
                const { data, error } = await db.rpc('ling_match', { p_device: device.id, p_embedding: JSON.stringify(vector), p_limit: 8 });
                if (error)
                    throw error;
                semantic = data.filter((r: any) => r.score > .35).flatMap((r: any) => { const source = sources.find(s => s.id === r.source_id && !s.deleted); if(source&&((/信/.test(body.query)&&source.type!=='letter')||(/剧本|剧情/.test(body.query)&&source.type!=='script')||(/收藏/.test(body.query)&&!source.favorite)||(/喜欢/.test(body.query)&&!source.liked)))return [];return source ? [{ ...source, matched_text: r.text, similarity: r.score }] : []; });
            }
            catch {
                mode = 'keyword';
            }
            const results = [...lexical, ...semantic].filter((r, i, a) => a.findIndex(s => s.id === r.id) === i).slice(0, 4);
            return json({ results, mode });
        }
        if (body.action === 'status') {
            const { data: runs } = await db.from('ling_runs').select('day,status,error,push_status,updated_at').eq('device_id', device.id).order('day', { ascending: false }).limit(1);
            const { data: archive } = await db.from('ling_notions').select('source_id,error').eq('device_id', device.id).not('error', 'is', null).limit(1);
            const { count } = await db.from('ling_chunks').select('*', { count: 'exact', head: true }).eq('device_id', device.id);
            return json({ enabled: device.enabled, next_run_at: device.next_run_at, last_job: runs?.[0], index_chunks: count, notion: device.credentials.notion_token ? (archive?.[0]?.error ?? (device.credentials.notion_parent?'已连接，按增量归档':'请在Notion连接页选择「灵的对话存档」')) : '未连接Notion，原文仍保存在OS' });
        }
        if (body.action === 'export') {
            if (typeof body.text !== 'string')
                return json({ error: '导出内容无效' }, 400);
            const stale=await db.storage.from('ling-exports').list(device.id,{limit:100,sortBy:{column:'created_at',order:'asc'}});const expired=(stale.data??[]).filter(f=>Date.parse(f.created_at)<Date.now()-86400000).map(f=>`${device.id}/${f.name}`);if(expired.length)await db.storage.from('ling-exports').remove(expired);
            const name = `${device.id}/${crypto.randomUUID()}.${body.format === 'md' ? 'md' : 'json'}`;
            const put = await db.storage.from('ling-exports').upload(name, new TextEncoder().encode(body.text), { contentType: body.format === 'md' ? 'text/markdown' : 'application/json', upsert: false });
            if (put.error)
                throw put.error;
            const result = await db.storage.from('ling-exports').createSignedUrl(name, 300, { download: `ling-${stamp().slice(0, 10)}.${body.format === 'md' ? 'md' : 'json'}` });
            if (result.error)
                throw result.error;
            return json({ url: result.data.signedUrl });
        }
        if (body.action === 'test_push') {
            if (!device.push_token)
                return json({ error: '手机尚未取得远程推送凭证，请查看设定页的后台状态' }, 409);
            const id = 'push-test:' + crypto.randomUUID();
            await write(db, device.id, [{ kind: 'ling_messages', id, payload: { id, role: 'assistant', thread_id: device.active_thread, turn_id: id, kind: 'chat', content: '这是一条手机推送测试。', created_at: stamp(), updated_at: stamp() } }]);
            const message = await sendPush(db, device, { day: id, morning: '这是一条手机推送测试。', thread_id: device.active_thread });
            return json({ message });
        }
        return json({ error: '未知操作' }, 400);
    }
    catch (e) {
        if (e instanceof Error && e.message === 'auth')
            return json({ error: '手机后台凭证无效，请保留本机数据并重新连接' }, 401);
        return json({ error: e instanceof Error ? e.message : '后台处理失败' }, 500);
    }
});
