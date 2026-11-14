import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCompanionEvents } from './events';
import { db, readTable, uuid, mergeRows, replaceTable } from '../localdb';
import { dayInZone, carryRounds,clipText,repairGeneratedTitle, sourceId, logicalMessages, planMemories, type ChatMessage, type Memory, type Source } from './core';
import { loadCompanionConfig, sanitizeConfig, CONFIG_KEY } from './config';
export interface Thread {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    archived: boolean;
    carry: ChatMessage[];
    parent_id?: string;
    day?: string;
}
export interface Favorite extends Source {
    source_id: string;
}
export const LING_TABLES = ['ling_threads', 'ling_messages', 'ling_message_versions', 'ling_memories', 'ling_memory_versions', 'ling_sources', 'ling_favorites', 'ling_usage', 'ling_daily_jobs'] as const;
let chain: Promise<any> = Promise.resolve();
export function serial<T>(fn: () => Promise<T>): Promise<T> { const p = chain.catch(() => { }).then(fn); chain = p; return p; }
export async function put(table: string, row: any) {if(table==='ling_memories'){const old=(await readTable(table)).find(m=>m.id===row.id);if(old&&(old.text!==row.text||old.status!==row.status)){const id=uuid();const r=await db.from('ling_memory_versions').insert({...old,id,memory_id:old.id,saved_at:new Date().toISOString()});if(r.error)throw new Error(r.error.message);}} const value = { ...row, updated_at: new Date().toISOString() }; const r = await db.from(table).upsert(value); if (r.error)
    throw new Error(r.error.message); useCompanionEvents.getState().bump(); return value; }
let initializing: Promise<void> | undefined;
export async function initializeCompanion() { if (!initializing)
    initializing = (async () => { const all = await readTable('ling_threads'); if (all.length) {
        await indexLegacy();await migrateLegacyLayers();await repairLegacyTitles();
        return;
    } const c = await loadCompanionConfig(); const messages = await readTable('ling_messages'); const id = 'legacy'; const now = new Date().toISOString(); await put('ling_threads', { id, title: messages.length ? '原来的对话' : '和灵聊天', created_at: messages[0]?.created_at ?? now, archived: false, carry: [], day: dayInZone(new Date(), c.timezone) }); if (messages.length) {
        await replaceTable('ling_messages', messages.map(m => ({ ...m, thread_id: m.thread_id ?? id, turn_id: m.turn_id ?? m.id, updated_at: m.updated_at ?? m.created_at })));
    } await AsyncStorage.setItem('ling_active_thread_v1', id); await indexLegacy(); const mem = await db.from('settings').select('value').eq('key', 'ai_memory').maybeSingle(); if (mem.data?.value)
        await put('ling_memories', { id: 'legacy-memory', text: String(mem.data.value), kind: 'core', source_ids: [], pinned: true, authority: 'explicit', status: 'active' });await migrateLegacyLayers();await repairLegacyTitles(); })().catch(e => { initializing = undefined; throw e; }); return initializing; }
async function migrateLegacyLayers(){
 const flag='ling_legacy_memory_layers_v1';if(await AsyncStorage.getItem(flag))return;
 const layers=JSON.parse(await AsyncStorage.getItem('ling_layers_v1')??'{}');const prior=new Set((await readTable('ling_memories')).map(m=>m.id));
 for(const key of ['archive','recent']){const layer=layers[key],text=typeof layer?.text==='string'?layer.text.trim():'';if(!text)continue;const id='legacy-layer:'+key,title=key==='archive'?'旧版长期档案':'旧版近况',at=Number.isFinite(Date.parse(layer.updatedAt))?layer.updatedAt:new Date().toISOString();
 if(!(await readTable('ling_sources')).some(s=>s.id===id))await put('ling_sources',{id,title,text,type:'chat',created_at:at,message_ids:[id],origin:'legacy_notion'});
 const chars=Array.from(text);for(let i=0;i<chars.length;i+=400){const memoryId=id+':'+i;if(prior.has(memoryId))continue;await put('ling_memories',{id:memoryId,text:chars.slice(i,i+400).join(''),kind:key==='archive'?'core':'episode',source_ids:[id],pinned:false,authority:'explicit',status:'active',source_label:title,original_updated_at:at});}
 }await AsyncStorage.setItem(flag,'1');
}
async function repairLegacyTitles(){if(await AsyncStorage.getItem('ling_unicode_titles_v1'))return;for(const table of ['ling_sources','ling_favorites'])for(const row of await readTable(table)){const next=repairGeneratedTitle(row);if(next!==row)await put(table,next);}await AsyncStorage.setItem('ling_unicode_titles_v1','1');}
async function indexLegacy() { if (await AsyncStorage.getItem('ling_sources_migrated_v1'))
    return; const messages = await readTable('ling_messages'); const existing = new Set((await readTable('ling_sources')).map(s => s.id)); const sources = messages.filter(m => m.role === 'assistant' && !m.deleted && !existing.has(sourceId(m as ChatMessage))).map(m => ({ id: sourceId(m as ChatMessage), text: m.content, title: clipText(m.content,28), type: /亲爱的.*[：:]|写给.*的信|此致|一封信/.test(m.content) ? 'letter' : /剧本|第[一二三四五六七八九十\d]+幕/.test(m.content) ? 'script' : 'chat', created_at: m.created_at, updated_at: m.created_at, message_ids: [m.id], liked: !!m.liked, favorite: !!m.favorite })); if (sources.length)
    await mergeRows('ling_sources', sources); await AsyncStorage.setItem('ling_sources_migrated_v1', '1'); }
export async function currentThread(): Promise<Thread> { await initializeCompanion(); const id = await AsyncStorage.getItem('ling_active_thread_v1'); const all = await readTable('ling_threads'); return (all.find(t => t.id === id && !t.archived) ?? all.find(t => !t.archived) ?? all[all.length - 1]) as Thread; }
export async function newThread(title = '和灵聊天', carry: ChatMessage[] = [], parent?: Thread, day?: string): Promise<Thread> { const now = new Date().toISOString(); const t = await put('ling_threads', { id: uuid(), title, carry, parent_id: parent?.id, day, created_at: now, archived: false }); await AsyncStorage.setItem('ling_active_thread_v1', t.id); return t; }
export async function listThreads() { await initializeCompanion(); return (await readTable('ling_threads')).sort((a, b) => b.created_at.localeCompare(a.created_at)) as Thread[]; }
export async function threadMessages(id: string, limit = 60): Promise<ChatMessage[]> { const r = await db.from('ling_messages').select('*').eq('thread_id', id).order('created_at', { ascending: false }).limit(limit); if (r.error)
    throw new Error(r.error.message); return (r.data ?? []).reverse().filter((m: any) => !m.deleted); }
export async function addChatMessage(row: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'content'>) { const t = row.thread_id ?? (await currentThread()).id; return put('ling_messages', { id: row.id ?? uuid(), created_at: new Date().toISOString(), kind: 'chat', status: 'sent', ...row, thread_id: t }); }
export async function editChatMessage(id: string, text: string) { const row = (await readTable('ling_messages')).find(r => r.id === id); if (!row)
    throw new Error('记录不存在'); await put('ling_message_versions',{...row,id:uuid(),message_id:row.id,saved_at:new Date().toISOString()}); await put('ling_messages', { ...row, content: text }); for(const m of await readTable('ling_memories')) if(m.source_ids?.includes(id)&&!m.pinned&&m.status==='active') await put('ling_memories',{...m,authority:'inferred',review_reason:'来源消息已编辑'}); await indexReply({ ...row, content: text } as ChatMessage); }
export async function deleteChatMessage(id: string) { const row = (await readTable('ling_messages')).find(r => r.id === id); if (!row)
    return; await put('ling_messages', { ...row, deleted: true }); const sid = sourceId(row as ChatMessage); const s = (await readTable('ling_sources')).find(r => r.id === sid); if (s)
    await put('ling_sources', { ...s, deleted: true }); for (const m of await readTable('ling_memories'))
    if (m.source_ids?.includes(id) && !m.pinned)
        await put('ling_memories', { ...m, status: 'forgotten' }); }
export async function indexReply(m: ChatMessage, artifact?: {
    type?: string;
    title?: string;
}) { if (m.role !== 'assistant' || !m.content.trim())
    return; const id = sourceId(m); const prior = (await readTable('ling_sources')).find(s => s.id === id); const siblings = (await readTable('ling_messages')).filter(r => r.role === 'assistant' && !r.deleted && (r.turn_id ?? r.id) === (m.turn_id ?? m.id)); const text = siblings.length ? siblings.map(s => s.content).join('\n\n') : m.content; const kind = ['letter', 'script'].includes(artifact?.type ?? '') ? artifact!.type : prior?.type ?? (/亲爱的.*[：:]|写给.*的信|此致|一封信/.test(text) ? 'letter' : /剧本|第[一二三四五六七八九十\d]+幕|场景[一二三\d：:]/.test(text) ? 'script' : 'chat'); return put('ling_sources', { ...prior, id, text, title: artifact?.title?.trim() || prior?.title || clipText(text,28), type: kind, created_at: prior?.created_at ?? m.created_at, message_ids: siblings.length ? siblings.map(s => s.id) : [m.id], liked: prior?.liked ?? false, favorite: prior?.favorite ?? false, deleted: false }); }
export async function toggleReply(id: string, flag: 'liked' | 'favorite') { return serial(async () => { const all = await readTable('ling_messages'); const m = all.find(r => r.id === id) as ChatMessage | undefined; if (!m)
    throw new Error('记录不存在'); const sid = sourceId(m); let s = (await readTable('ling_sources')).find(r => r.id === sid) as Source | undefined; if (!s)
    s = await indexReply(m) as Source; const value = !s[flag]; await put('ling_sources', { ...s, [flag]: value }); for (const r of all.filter(r => (r.turn_id ?? r.id) === (m.turn_id ?? m.id)))
    await put('ling_messages', { ...r, [flag]: value }); if (flag === 'favorite') {
    const old = (await readTable('ling_favorites')).find(f => f.source_id === sid);
    if (value) {
        await put('ling_favorites', { ...(old ?? s), id: old?.id ?? `favorite:${sid}`, source_id: sid, favorite: true, deleted: false });
    }
    else if (old)
        await put('ling_favorites', { ...old, deleted: true, favorite: false });
} return value; }); }
export async function favorites() { return (await readTable('ling_favorites')).filter(f => !f.deleted) as Favorite[]; }
export async function memories() { return (await readTable('ling_memories')).filter(m => m.status !== 'forgotten') as Memory[]; }
function hash(s: string) { let h = 2166136261; for (const ch of s)
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0).toString(16); }
export async function acceptMemories(items:any[],sources:ChatMessage[]){for(const row of planMemories(items,await memoriesIncludingForgotten(),sources))await put('ling_memories',row);}
async function memoriesIncludingForgotten(){return await readTable('ling_memories') as Memory[];}
export async function modelMessages(thread: Thread, budget = 60) { const current = await threadMessages(thread.id, budget); return [...thread.carry, ...current]; }
export async function rotateLocal(day: string, body: string, items: any[], sourceMessages: ChatMessage[]) { return serial(async () => { const id = `morning:${day}`; const jobs = await readTable('ling_daily_jobs'); if (jobs.some(j => j.id === id && j.status === 'done'))
    return; await acceptMemories(items, sourceMessages); const parent = await currentThread(); const old = await modelMessages(parent, 10000); const t: Thread = { id, title: `${day.slice(5)} · 和灵`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archived: false, carry: carryRounds(old, 5), parent_id: parent.id, day }; await put('ling_threads', t); await addChatMessage({ id: `morning-message:${day}`, thread_id: id, turn_id: `morning-message:${day}`, role: 'assistant', content: body, kind: 'morning' }); await put('ling_threads', { ...parent, archived: true }); await put('ling_daily_jobs', { id, status: 'done', day, created_at: new Date().toISOString(), mode: 'foreground' }); await AsyncStorage.setItem('ling_active_thread_v1', id); return t; }); }
export async function exportCompanion() { const tables: Record<string, any[]> = {}; for (const t of LING_TABLES)
    tables[t] = await readTable(t); const config = await loadCompanionConfig(); const versions = JSON.parse(await AsyncStorage.getItem('ling_companion_config_versions_v1') ?? '[]'); const json = JSON.stringify({ app: 'ximi-ling', version: 1, exportedAt: new Date().toISOString(), config, versions, active_thread:await AsyncStorage.getItem('ling_active_thread_v1'),tables }, null, 2); let markdown = '# 和灵的记录\n\n'; for (const t of tables.ling_threads) {
    markdown += `## ${t.title}\n\n`;
    for (const m of tables.ling_messages.filter(m => m.thread_id === t.id && !m.deleted).sort((a,b)=>a.created_at.localeCompare(b.created_at)))
        markdown += `### ${m.role === 'user' ? '我' : '灵'} · ${m.created_at}\n\n${m.content}\n\n`;
} for (const f of tables.ling_favorites.filter(f => !f.deleted))
    markdown += `## 收藏：${f.title}\n\n${f.text}\n\n`; markdown += '## 记忆\n\n' + tables.ling_memories.map(m => `- [${m.status}] ${m.text}`).join('\n'); markdown += '\n\n## 提示词\n\n' + Object.entries(config).filter(([, v]) => typeof v === 'string').map(([k, v]) => `### ${k}\n\n${v}`).join('\n\n'); for(const [table,label,field] of [['ling_message_versions','消息历史版本','content'],['ling_memory_versions','记忆历史版本','text']] as const){markdown+='\n\n## '+label+'\n\n'+tables[table].map(r=>`${r.saved_at}\n\n${r[field]}`).join('\n\n');}markdown+='\n\n## 提示词历史版本\n\n'+versions.map((v:any)=>Object.entries(v).filter(([,x])=>typeof x==='string').map(([k,x])=>`${k}：${x}`).join('\n\n')).join('\n\n---\n\n');return { json, markdown }; }
export async function importCompanion(json: string) { const file = JSON.parse(json); if (file.app !== 'ximi-ling' || file.version !== 1 || !file.tables || !file.config)
    throw new Error('不是灵的完整备份'); file.tables.ling_message_versions??=[];file.tables.ling_memory_versions??=[];for (const t of LING_TABLES)
    if (!Array.isArray(file.tables[t]) || file.tables[t].some((r: any) => !r || typeof r.id !== 'string'))
        throw new Error(`备份缺少或损坏${t}`); if(file.tables.ling_messages.some((r:any)=>typeof r.content!=='string'||!['user','assistant','system'].includes(r.role)||!Number.isFinite(Date.parse(r.created_at)))||file.tables.ling_threads.some((r:any)=>typeof r.title!=='string'||!Array.isArray(r.carry))||file.tables.ling_memories.some((r:any)=>typeof r.text!=='string'||!Array.isArray(r.source_ids)||!['core','episode','agreement','state'].includes(r.kind))||file.tables.ling_favorites.some((r:any)=>typeof r.text!=='string'||typeof r.title!=='string'||!Array.isArray(r.message_ids)))throw new Error('备份内容损坏，未修改手机数据');const before = await exportCompanion(); await AsyncStorage.setItem('ling_before_import_v1', before.json);await AsyncStorage.setItem('ling_cloud_restore_paused_v1','1'); for (const t of LING_TABLES) {
    const current = await readTable(t);
    const rows = file.tables[t].filter((r: any) => { const old = current.find(v => v.id === r.id); return !old || !old.updated_at || !r.updated_at || old.updated_at <= r.updated_at; });
    await mergeRows(t, rows);
} await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(sanitizeConfig(file.config))); await AsyncStorage.setItem('ling_companion_config_versions_v1', JSON.stringify(file.versions ?? [])); await AsyncStorage.setItem('ling_cloud_restore_paused_v1', '1'); const active = file.tables.ling_threads.find((t:any)=>t.id===file.active_thread&&!t.archived)??file.tables.ling_threads.filter((t:any)=>!t.archived).sort((a:any,b:any)=>b.created_at.localeCompare(a.created_at))[0]; if (active)
    await AsyncStorage.setItem('ling_active_thread_v1', active.id); }
