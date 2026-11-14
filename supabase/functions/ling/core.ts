// 手机与后台共用的纯逻辑；不依赖平台或第三方SDK。
export type MemoryKind = 'core' | 'episode' | 'agreement' | 'state';
export interface Memory {
    id: string;
    text: string;
    kind: MemoryKind;
    source_ids: string[];
    pinned: boolean;
    authority: 'explicit' | 'inferred';
    date?: string;
    status: 'active' | 'done' | 'cancelled' | 'forgotten';
    updated_at: string;
}
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at: string;
    thread_id?: string;
    turn_id?: string;
    liked?: boolean;
    favorite?: boolean;
    updated_at?: string;
    deleted?: boolean;
    incomplete?:boolean;
    status?: 'pending' | 'sent' | 'failed';
    kind?: string;
}
export interface Source {
    id: string;
    text: string;
    title: string;
    type: 'chat' | 'letter' | 'script';
    created_at: string;
    liked?: boolean;
    favorite?: boolean;
    message_ids: string[];
    notion_url?: string;
    deleted?: boolean;
}
export interface CompanionConfig {
    persona: string;
    system: string;
    memoryInstructions: string;
    digestInstructions: string;
    morningInstructions: string;
    contextBudget: number;
    maxOutput: number;
    thinking: boolean;
    modelName: string;
    timezone: string;
    background: boolean;
}
export const DEFAULT_MEMORY_INSTRUCTIONS = '发现值得长期记住的明确事实、偏好、约定时，可在自然回复末尾附 <ling-memory>{"items":[{"text":"简短事实","kind":"core或episode或agreement或state","date":"约定日期YYYY-MM-DD，可省略","authority":"explicit或inferred"}],"artifact":{"type":"chat或letter或script","title":"本次内容标题"}}</ling-memory>。无新信息可省略。只记录有来源的内容，剧情不当现实，推断用inferred。更新已知记忆时可传id（records里的记忆ID），约定完成或取消时传status=done或cancelled，禁止把已完成/取消的约定继续当有效。不要在自然回复中复述这些格式说明。';
export const DEFAULT_DIGEST_INSTRUCTIONS = '整理本次新增聊天与喜欢标记，提取有来源的关系事实、偏好、共同经历、近期状态和约定。喜欢的优先检查，但不把喜欢等同认可所有内容。原文不改写。仅输出JSON：{"items":[{"text":"记忆","kind":"core或episode或agreement或state","date":"约定日期，可省略","source_ids":["原消息ID"],"authority":"explicit或inferred"}]}。更新已有记忆使用其id，约定完成/取消用status=done/cancelled；没有新事实可返回空数组。不编造，不把剧本当真实经历，不改写用户人设。';
export const DEFAULT_MORNING_INSTRUCTIONS = '依据已保存的近期相处、有效记忆与今天的约定，主动给对方发一条自然的情感早报。延续此前称呼、话题和情绪变化；没有约定就不编。不要展开工作任务、项目进度或催办。语气和篇幅遵守用户的人设及系统提示词。只输出要发的消息正文，不汇报内部记忆、调度或系统状态。';
export function dayInZone(now: Date, timezone = 'Asia/Shanghai', boundary = 5): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    const day = `${p.year}-${p.month}-${p.day}`;
    return Number(p.hour) < boundary ? new Date(Date.parse(day + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10) : day;
}
export const textTokens = (s: string) => Math.ceil([...s].reduce((n, c) => n + (/[\u2E80-\u9FFF]/u.test(c) ? .7 : .3), 0));
export function logicalMessages<T extends ChatMessage>(messages: T[]): T[] {
    const out: T[] = [];
    for (const m of messages.filter(m => !m.deleted && m.status !== 'failed' && m.status !== 'pending' && m.role !== 'system')) {
        const last = out[out.length - 1];
        if (last && m.role === 'assistant' && last.role === 'assistant' && m.turn_id && m.turn_id === last.turn_id)
            out[out.length - 1] = { ...last, content: last.content + '\n\n' + m.content };
        else
            out.push({ ...m });
    }
    return out;
}
export function carryRounds<T extends ChatMessage>(messages: T[], rounds = 5): T[] {
    const msgs = logicalMessages(messages.filter(m=>!m.incomplete)), pairs: T[][] = [];
    let pair: T[] = [];
    for (const m of msgs) {
        if (m.role === 'user') {
            if (pair.length > 1)
                pairs.push(pair);
            pair = [m];
        }
        else if (pair.length)
            pair.push(m);
    }
    if (pair.length > 1)
        pairs.push(pair);
    return pairs.slice(-rounds).flat();
}
export function budgetHistory(messages: ChatMessage[], budget: number) {
    const turns: ChatMessage[][] = [];
    let turn: ChatMessage[] = [];
    for (const m of logicalMessages(messages)) {
        if (m.role === 'user' && turn.length) {
            turns.push(turn);
            turn = [];
        }
        turn.push(m);
    }
    if (turn.length)
        turns.push(turn);
    const picked: ChatMessage[][] = [];
    let used = 0;
    for (const t of turns.reverse()) {
        const n = t.reduce((s, m) => s + textTokens(m.content), 0);
        if (picked.length && used + n > budget)
            break;
        picked.unshift(t);
        used += n;
    }
    return picked.flat().map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
}
export function parseCompanionReply(raw: string) {
    const match = raw.match(/<ling-memory>([\s\S]*?)<\/ling-memory>/);
    let meta: any = {};
    if (match) {
        try {
            meta = JSON.parse(match[1]);
        }
        catch { }
    }
    const text = raw.replace(/<ling-memory>[\s\S]*?(?:<\/ling-memory>|$)/g, '').trim();
    return { text, items: Array.isArray(meta.items) ? meta.items : [], artifact: meta.artifact };
}
export function parseDigest(raw: string) { try {
    const s = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const v = JSON.parse(s);
    return Array.isArray(v.items) ? v.items : [];
}
catch {
    throw new Error('记忆整理格式不正确，原文已保留，可重试');
} }
export function memoryContext(memories: Memory[], day: string, budget = 900) {
    const picked = memories.filter(m => m.status === 'active' && m.authority === 'explicit' && (m.pinned || m.kind === 'core' || m.kind === 'state' || (m.kind === 'agreement' && m.date === day))).sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.kind === 'agreement') - Number(a.kind === 'agreement'));
    let out = '';
    for (const m of picked) {
        const line = `[${m.kind} id=${m.id}${m.date ? ' ' + m.date : ''}] ${m.text}\n`;
        if (!m.pinned && textTokens(out + line) > budget)
            continue;
        out += line;
    }
    return out.trim();
}
export function queryTerms(query: string) { const text = query.toLowerCase(); const words = text.match(/[a-z0-9]{2,}|[\u4e00-\u9fff]+/g) ?? []; return [...new Set(words.flatMap(w => /[\u4e00-\u9fff]/.test(w) && w.length > 2 ? [w, ...Array.from({ length: w.length - 1 }, (_, i) => w.slice(i, i + 2))] : [w]))]; }
export function lexicalSources(sources: Source[], query: string, limit = 4) {
    let list = sources.filter(s => !s.deleted);
    if (/信/.test(query))
        list = list.filter(s => s.type === 'letter');
    if (/剧本|剧情/.test(query))
        list = list.filter(s => s.type === 'script');
    if (/收藏/.test(query))
        list = list.filter(s => s.favorite);
    if (/喜欢/.test(query))
        list = list.filter(s => s.liked);
    if (/第一|最早/.test(query))
        return list.sort((a, b) => (Date.parse(a.created_at) - Date.parse(b.created_at)) || a.id.localeCompare(b.id)).slice(0, 1);
    const terms = queryTerms(query);
    return list.map(s => ({ s, score: terms.reduce((n, t) => n + (s.title.toLowerCase().includes(t) ? 4 : 0) + (s.text.toLowerCase().includes(t) ? 1 : 0), 0) + (s.liked ? .1 : 0) })).filter(x => x.score >= 1).sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.s);
}
export function snippets(sources: Source[], query: string, budget = 800) { let left = budget; const terms = queryTerms(query); return sources.flatMap(s => { const paragraphs = s.text.split(/\n\s*\n/).flatMap(p => Array.from({ length: Math.ceil(p.length / 700) }, (_, i) => p.slice(i * 700, (i + 1) * 700))); const ranked = paragraphs.map((text, i) => ({ text, i, score: terms.filter(t => text.includes(t)).length })).sort((a, b) => b.score - a.score || a.i - b.i); let text = ''; for (const p of ranked) {
    if (left <= 0)
        break;
    const part = p.text.slice(0, Math.max(0, Math.floor(left)));
    text += part + '\n';
    left -= textTokens(part);
} return text ? [{ id: s.id, title: s.title, text: text.trim(), notion_url: s.notion_url }] : []; }); }
export function chunks(text: string, size = 700) { const parts: string[] = []; let current = ''; for (const p of text.split('\n')) {
    if (current && current.length + p.length > size) {
        parts.push(current);
        current = '';
    }
    for (let i = 0; i < p.length; i += size) {
        const bit = p.slice(i, i + size);
        if (current.length + bit.length > size) {
            parts.push(current);
            current = '';
        }
        current += (current ? '\n' : '') + bit;
    }
} if (current)
    parts.push(current); return parts; }
export function sourceId(m: ChatMessage) { return `reply:${m.turn_id ?? m.id}`; }
export function memoryIdentifier(text:string){let a=2166136261,b=2246822519;for(const c of text){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b^c.charCodeAt(0),3266489917);}return `memory:${(a>>>0).toString(16)}${(b>>>0).toString(16)}`;}
export function planMemories(items:any[],existing:Memory[],sources:ChatMessage[]):Memory[]{const blocked=new Set(existing.filter(m=>m.status==='forgotten').flatMap(m=>m.source_ids));const allowed=new Map(sources.filter(m=>!m.deleted&&!blocked.has(m.id)).map(m=>[m.id,m]));const result:Memory[]=[];for(const item of items.slice(0,40)){if(!item)continue;const target=typeof item.id==='string'?existing.find(m=>m.id===item.id):undefined;const text=typeof item.text==='string'?item.text.trim():target?.text;const kind=item.kind??target?.kind;if(!text||!['core','episode','agreement','state'].includes(kind))continue;const ids=(Array.isArray(item.source_ids)?item.source_ids:sources.slice(-2).map(m=>m.id)).filter((id:string)=>allowed.has(id));if(!ids.length)continue;const explicit=item.authority!=='inferred'&&ids.some((id:string)=>allowed.get(id)?.role==='user');const old=target??existing.find(m=>m.text===text);if(old?.status==='forgotten')continue;if(old?.pinned&&(old.text!==text||ids.every((id:string)=>Date.parse(allowed.get(id)!.created_at)<Date.parse(old.updated_at))))continue;if(old?.authority==='explicit'&&!explicit)continue;const status=['done','cancelled'].includes(item.status)&&explicit?item.status:old?.status??'active';const row:Memory={...old,id:old?.id??memoryIdentifier(kind+text),text,kind,source_ids:[...new Set<string>([...(old?.source_ids??[]),...ids])],pinned:old?.pinned??false,authority:explicit?'explicit':'inferred',status,date:/^\d{4}-\d{2}-\d{2}$/.test(item.date??'')?item.date:old?.date,updated_at:new Date().toISOString()};const same=result.findIndex(m=>m.id===row.id);if(same<0)result.push(row);else result[same]=row;}return result;}

export function retrievalSources(sources:Source[],favorites:any[],forgotten:string[]=[]):Source[]{const snapshots=favorites.filter(f=>!f.deleted).map(f=>({...f,favorite:true}));const blocked=new Set(forgotten);return [...snapshots,...sources.filter(s=>!snapshots.some(f=>f.source_id===s.id&&f.text===s.text))].filter(s=>!(s.message_ids??[]).some((id:string)=>blocked.has(id)));}
export function overlayMemories(existing:Memory[],updates:Memory[]):Memory[]{const byId=new Map(existing.map(m=>[m.id,m]));for(const m of updates)byId.set(m.id,m);return [...byId.values()];}
