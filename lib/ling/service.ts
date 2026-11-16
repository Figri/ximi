import AsyncStorage from '@react-native-async-storage/async-storage';
import { readTable } from '../localdb';
import { getApiKey } from '../aiSettings';
import { loadLingSettings, useLingSettings } from './settings';
import { loadCompanionConfig, composePrompt } from './config';
import { budgetHistory,timedHistory,historyClocks,messageTime,digestStamp, dayInZone, lexicalSources, memoryContext, snippets, parseCompanionReply, parseDigest, type ChatMessage, retrievalSources, type Source } from './core';
import { acceptMemories, addChatMessage, indexReply, memories, modelMessages, put, rotateLocal, currentThread, archiveDigestedThreads,isGenerating,editChatMessage,type Thread } from './repository';
import { requestCompanion } from './request';
import { backend } from './cloud';
export async function prepareChat(thread: Thread, search?: string, override?: import('./core').CompanionConfig,untilId?:string) { const config = override ?? await loadCompanionConfig(); const forgotten=new Set((await readTable('ling_memories')).filter(m=>m.status==='forgotten').flatMap(m=>m.source_ids??[]));let all = (await modelMessages(thread, 200)).filter(m=>!forgotten.has(m.id));if(untilId){const index=all.findIndex(m=>m.id===untilId);if(index>=0)all=all.slice(0,index);} const query = search ?? [...all].reverse().find(m => m.role === 'user')?.content ?? ''; const sources = retrievalSources(await readTable('ling_sources') as Source[],await readTable('ling_favorites'),[...forgotten] as string[]);  let hits = lexicalSources(sources.filter(s=>s.type==='material'||/记得|以前|信|剧本|第一|之前|那次|收藏|约定|上次|当时|原文/.test(query)),query);if(/素材|参考内容/.test(query)&&!hits.some(s=>s.type==='material'))hits.push(...sources.filter(s=>s.type==='material'&&!s.deleted).slice(0,1)); if (config.background && /记得|以前|信|剧本|第一|之前|那次|收藏|上次|原文/.test(query)) {
    try {
        const result = await backend('search', { query }, 10000);
        if (result.results?.length)
            hits = result.results;
    }
    catch { }
} const relevant = snippets(hits, query, 800).map(r=>({...r,type:hits.find(s=>s.id===r.id)?.type})); const fullSource = /原文|全文|整封|整篇|重读/.test(query) && !/改写|重写|润色|续写/.test(query) && (hits.length === 1 || (/第一|最早/.test(query))) ? hits[0] : undefined; const memory = memoryContext(await memories(), dayInZone(new Date(), config.timezone,0)); return { config, all, fullSource, hits: relevant, system: composePrompt(config, ['当前时间：'+messageTime(new Date().toISOString(),config.timezone)+'；时区：'+config.timezone,'消息时间元数据（不属于消息正文）：'+JSON.stringify(historyClocks(all,config.contextBudget,config.timezone)),memory,hits.some(s=>s.type==='material')?'素材使用说明：'+config.materialInstructions:'', relevant.length ? '相关原文片段：\n' + JSON.stringify(relevant) : ''].filter(Boolean).join('\n')), history: timedHistory(all, config.contextBudget,config.timezone) }; }
export async function sendToLing(thread:Thread,options:{signal?:AbortSignal;onText?:(s:string)=>void;assistantId:string;replaceId?:string}){
 await loadLingSettings();const model=useLingSettings.getState().model,key=await getApiKey(model);if(!key)throw new Error('请先在灵的设定中填写模型密钥');
 const p=await prepareChat(thread,undefined,undefined,options.replaceId);const history=p.all;
 const result=p.fullSource?{text:p.fullSource.text,usage:{},stopped:false,truncated:false}:await requestCompanion(model,key,p.config,timedHistory(history,p.config.contextBudget,p.config.timezone),p.system,options);
 const parsed=parseCompanionReply(result.text);if(!parsed.text.trim())throw new Error('没有收到正文，可重试');
 const latest=(await readTable('ling_threads')).find(t=>t.id===thread.id);if(latest?.deleted)throw new Error('该对话已删除');
 let m:ChatMessage;
 if(options.replaceId){const old=(await readTable('ling_messages')).find(m=>m.id===options.replaceId&&!m.deleted);if(!old)throw new Error('这条消息已删除');await editChatMessage(old.id,parsed.text);m={...old,content:parsed.text} as ChatMessage;}
 else m=await addChatMessage({id:options.assistantId,thread_id:thread.id,turn_id:options.assistantId,role:'assistant',content:parsed.text,incomplete:!!(result.stopped||result.truncated)});
 await indexReply(m,parsed.artifact);if(!result.stopped)await acceptMemories(parsed.items,[...history,m]);await put('ling_usage',{id:options.replaceId?`retry:${Date.now()}:${options.assistantId}`:options.assistantId,created_at:new Date().toISOString(),model:p.config.modelName,kind:'chat',...result.usage});return m;
}
export async function summarizeLocal(){
 await loadLingSettings();const model=useLingSettings.getState().model,key=await getApiKey(model);if(!key)throw new Error('请先在灵的设定中填写模型密钥');const config=await loadCompanionConfig();
 const threads=(await readTable('ling_threads')).filter(t=>!t.deleted&&!t.archived&&!isGenerating(t.id));const ids=threads.map(t=>t.id);
 const raw=(await readTable('ling_messages')).filter(m=>ids.includes(m.thread_id)&&!m.deleted&&m.role!=='system'&&m.kind!=='morning'&&!m.incomplete&&m.status!=='failed'&&m.memory_digest_hash!==digestStamp(m)).sort((a,b)=>a.created_at.localeCompare(b.created_at)) as ChatMessage[];
 const liked=(await readTable('ling_sources')).filter(s=>s.liked&&!s.deleted);let count=0;
 for(let i=0;i<raw.length;i+=40){const batch=raw.slice(i,i+40),system=composePrompt(config,'当前时间：'+messageTime(new Date().toISOString(),config.timezone)+'；时区：'+config.timezone+'\n当前记忆：'+JSON.stringify(await memories()),'digest');const result=await requestCompanion(model,key,{...config,maxOutput:4096},[{role:'user',content:JSON.stringify({messages:batch,liked:liked.filter(s=>s.message_ids.some((id:string)=>batch.some(m=>m.id===id)))})}],system);const items=parseDigest(result.text);
 const stillHere=(await readTable('ling_messages')).filter(m=>batch.some(b=>b.id===m.id&&digestStamp(b)===digestStamp(m))&&!m.deleted);if(stillHere.length!==batch.length)continue;await acceptMemories(items,stillHere as ChatMessage[]);count+=items.length;
 for(const source of batch){const current=(await readTable('ling_messages')).find(m=>m.id===source.id&&!m.deleted);if(current&&digestStamp(current)===digestStamp(source))await put('ling_messages',{...current,memory_digest_hash:digestStamp(source)});}
 await put('ling_usage',{id:`digest:${Date.now()}:${i}`,created_at:new Date().toISOString(),kind:'digest',...result.usage});
 }
 await archiveDigestedThreads(ids);const pending=(await readTable('ling_threads')).some(t=>ids.includes(t.id)&&!t.deleted&&!t.archived);if(pending&&raw.length)return `已整理${count}条记忆，有新修改的对话保持未归档`;return raw.length?`已整理${count}条记忆，未归档对话已处理`:'没有新的内容需要整理';
}
