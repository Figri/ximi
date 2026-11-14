import AsyncStorage from '@react-native-async-storage/async-storage';
import { readTable } from '../localdb';
import { getApiKey } from '../aiSettings';
import { loadLingSettings, useLingSettings } from './settings';
import { loadCompanionConfig, composePrompt } from './config';
import { budgetHistory, dayInZone, lexicalSources, memoryContext, snippets, parseCompanionReply, parseDigest, type ChatMessage, retrievalSources, type Source } from './core';
import { acceptMemories, addChatMessage, indexReply, memories, modelMessages, put, rotateLocal, currentThread, type Thread } from './repository';
import { requestCompanion } from './request';
import { backend } from './cloud';
export async function prepareChat(thread: Thread, search?: string, override?: import('./core').CompanionConfig) { const config = override ?? await loadCompanionConfig(); const forgotten=new Set((await readTable('ling_memories')).filter(m=>m.status==='forgotten').flatMap(m=>m.source_ids??[]));const all = (await modelMessages(thread, 200)).filter(m=>!forgotten.has(m.id)); const query = search ?? [...all].reverse().find(m => m.role === 'user')?.content ?? ''; const sources = retrievalSources(await readTable('ling_sources') as Source[],await readTable('ling_favorites'),[...forgotten] as string[]);  let hits = /记得|以前|信|剧本|第一|之前|那次|收藏|约定|上次|当时|原文/.test(query) ? lexicalSources(sources, query) : []; if (config.background && /记得|以前|信|剧本|第一|之前|那次|收藏|上次|原文/.test(query)) {
    try {
        const result = await backend('search', { query }, 10000);
        if (result.results?.length)
            hits = result.results;
    }
    catch { }
} const relevant = snippets(hits, query, 800); const fullSource = /原文|全文|整封|整篇|重读/.test(query) && !/改写|重写|润色|续写/.test(query) && (hits.length === 1 || (/第一|最早/.test(query))) ? hits[0] : undefined; const memory = memoryContext(await memories(), dayInZone(new Date(), config.timezone,0)); return { config, all, fullSource, hits: relevant, system: composePrompt(config, ['当前日期：'+dayInZone(new Date(),config.timezone,0)+'；时区：'+config.timezone,memory, relevant.length ? '相关原文片段：\n' + JSON.stringify(relevant) : ''].filter(Boolean).join('\n')), history: budgetHistory(all, config.contextBudget) }; }
export async function sendToLing(thread: Thread, options: {
    signal?: AbortSignal;
    onText?: (s: string) => void;
    assistantId: string;
    replaceId?: string;
}) { await loadLingSettings(); const model = useLingSettings.getState().model; const key = await getApiKey(model); if (!key)
    throw new Error('还没填写模型密钥：灵 → 设定 → 模型'); const p = await prepareChat(thread); if (p.fullSource) {
    const m = await addChatMessage({ id: options.assistantId, thread_id: thread.id, turn_id: options.assistantId, role: 'assistant', content: p.fullSource.text });
    options.onText?.(m.content);
    return m;
} const result = await requestCompanion(model, key, p.config, options.replaceId ? budgetHistory(p.all.filter(m => m.id !== options.replaceId), p.config.contextBudget) : p.history, p.system, options); const parsed = parseCompanionReply(result.text); if (!parsed.text.trim())
    throw new Error(result.stopped ? '已停止，未生成内容' : '没有收到正文，可重试'); const m = await addChatMessage({ id: options.assistantId, thread_id: thread.id, turn_id: options.assistantId, role: 'assistant', content: parsed.text,incomplete:!!(result.stopped||result.truncated) }); if (options.replaceId) {
    const old = p.all.find(r => r.id === options.replaceId);
    if (old)
        {await put('ling_messages', { ...old, deleted: true, replaced_by: m.id });const oldSource=(await readTable('ling_sources')).find(s=>s.message_ids?.includes(old.id));if(oldSource)await put('ling_sources',{...oldSource,deleted:true});}
} await indexReply(m, parsed.artifact); if (!result.stopped)
    await acceptMemories(parsed.items, [...p.all, m]); await put('ling_usage', { id: options.assistantId, created_at: new Date().toISOString(), model: p.config.modelName, kind: 'chat', ...result.usage, stopped: !!result.stopped }); return m; }
export async function summarizeLocal() { await loadLingSettings(); const model = useLingSettings.getState().model; const key = await getApiKey(model); if (!key)
    throw new Error('请先在灵的设定中填写模型密钥'); const config = await loadCompanionConfig(); const since = await AsyncStorage.getItem('ling_digest_cursor_v1'); const raw = (await readTable('ling_messages')).sort((a,b)=>(a.updated_at??a.created_at).localeCompare(b.updated_at??b.created_at)).filter(m => !m.deleted && m.role !== 'system' && m.kind !== 'morning' && m.status !== 'failed' && (!since || (m.updated_at ?? m.created_at) > since)) as ChatMessage[]; const liked = (await readTable('ling_sources')).filter(s => s.liked); if (!raw.length && !liked.length)
    return '没有新的内容需要整理'; let count = 0; for (let i = 0; i < raw.length; i += 60) {
    const batch = raw.slice(i, i + 60);
    const system = composePrompt(config, '当前记忆：' + JSON.stringify(await memories()), 'digest');
    const result = await requestCompanion(model, key, { ...config, thinking: false, maxOutput: 4096 }, [{ role: 'user', content: JSON.stringify({ messages: batch, liked: liked.filter(s => s.message_ids.some((id: string) => batch.some(m => m.id === id))) }) }], system);
    const items = parseDigest(result.text);
    await acceptMemories(items, batch);
    count += items.length;
    await put('ling_usage', { id: `digest:${Date.now()}:${i}`, created_at: new Date().toISOString(), kind: 'digest', ...result.usage });
    if (batch.length)
        await AsyncStorage.setItem('ling_digest_cursor_v1', batch.map(m => (m as any).updated_at ?? m.created_at).sort().at(-1));
} return `已整理${count}条记忆`; }
;
