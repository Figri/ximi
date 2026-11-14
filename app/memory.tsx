import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, Clipboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { readTable, uuid } from '../lib/localdb';
import { memories, put } from '../lib/ling/repository';
import { summarizeLocal } from '../lib/ling/service';
import { syncCompanion } from '../lib/ling/cloud';
import { type Memory, type MemoryKind } from '../lib/ling/core';
import { useCompanionEvents } from '../lib/ling/events';
import { LingLockGate } from '../components/ling/LingLockGate';
import { Editor, Reader } from '../components/ling/Editor';
import { s } from './ling-settings';
const kinds:Record<MemoryKind,string>={core:'核心',episode:'经历',agreement:'约定',state:'近期状态'};
const statuses:Record<string,string>={active:'有效',done:'已完成',cancelled:'已取消',forgotten:'已忘记'};
export default function Screen(){return <LingLockGate><MemoryPage/></LingLockGate>;}
function MemoryPage(){
 const [items,setItems]=useState<Memory[]>([]),[query,setQuery]=useState(''),[editing,setEditing]=useState<Memory|'new'|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [kind,setKind]=useState<MemoryKind>('core'),[date,setDate]=useState(''),[status,setStatus]=useState('active');
 const [reader,setReader]=useState<{title:string;text:string;restore?:()=>Promise<void>}|null>(null),[history,setHistory]=useState<{memory:Memory;rows:any[]}|null>(null);
 const version=useCompanionEvents(v=>v.version);
 useEffect(()=>{memories().then(setItems);},[version]);
 function edit(m:Memory|'new'){setEditing(m);setKind(m==='new'?'core':m.kind);setDate(m==='new'?'':m.date??'');setStatus(m==='new'?'active':m.status);}
 async function save(row:Memory|any){await put('ling_memories',row);syncCompanion().catch(()=>{});}
 async function source(m:Memory){const rows=await readTable('ling_messages');setReader({title:'记忆来源',text:m.source_ids.map(id=>{const r=rows.find(r=>r.id===id);return r?`${r.created_at} · ${r.role==='user'?'我':'灵'}\n${r.content}`:`来源 ${id} 尚未下载`;}).join('\n\n')||'这是一条手动记忆。'});}
 return <SafeAreaView style={s.page} edges={['top','bottom']}><View style={s.header}><Pressable onPress={()=>router.back()}><Text style={s.link}>‹ 返回</Text></Pressable><Text style={s.title}>灵的记忆</Text><Pressable testID="ling-memory-new" onPress={()=>edit('new')}><Text style={s.link}>＋</Text></Pressable></View>
 <ScrollView contentContainerStyle={s.body}><TextInput testID="ling-memory-search" style={s.single} placeholder="搜索记忆" value={query} onChangeText={setQuery}/><Pressable testID="ling-memory-digest" disabled={busy} onPress={async()=>{setBusy(true);try{setNotice(await summarizeLocal());syncCompanion().catch(()=>{});}catch(e){setNotice(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}}><Text style={s.link}>{busy?'整理中…':'立即整理新增聊天'}</Text></Pressable>
 {notice?<Text style={s.notice}>{notice}</Text>:null}{items.filter(m=>m.text.includes(query)).map(m=><Pressable key={m.id} style={s.card} onLongPress={()=>edit(m)} testID={`memory-card-${m.id}`}><View style={s.row}><Text style={s.secondary}>{kinds[m.kind]}{m.date?' · '+m.date:''}{m.authority==='inferred'?' · 待核对':''}{m.status!=='active'?' · '+statuses[m.status]:''}</Text><Pressable accessibilityLabel={m.pinned?'取消固定':'固定记忆'} onPress={()=>save({...m,pinned:!m.pinned})}><Text style={s.link}>{m.pinned?'★':'☆'}</Text></Pressable></View><Text style={s.text}>{m.text}</Text><View style={s.wrap}><Pressable onPress={()=>Clipboard.setString(m.text)}><Text style={s.link}>复制</Text></Pressable><Pressable onPress={()=>source(m)}><Text style={s.link}>来源</Text></Pressable><Pressable testID={`memory-history-${m.id}`} onPress={async()=>setHistory({memory:m,rows:(await readTable('ling_memory_versions')).filter(v=>v.memory_id===m.id).sort((a,b)=>b.saved_at.localeCompare(a.saved_at))})}><Text style={s.link}>历史</Text></Pressable>{m.authority==='inferred'?<Pressable onPress={()=>save({...m,authority:'explicit'})}><Text style={s.link}>确认这条</Text></Pressable>:null}{m.kind==='agreement'?<Pressable onPress={()=>save({...m,status:m.status==='done'?'active':'done'})}><Text style={s.link}>{m.status==='done'?'恢复约定':'已完成'}</Text></Pressable>:null}</View></Pressable>)}{!items.length?<Text style={s.secondary}>可以手动添加，也可以让灵从新的聊天中整理。</Text>:null}</ScrollView>
 <Editor visible={!!editing} title={editing==='new'?'添加记忆':'编辑并纠正记忆'} value={editing&&editing!=='new'?editing.text:''} onClose={()=>setEditing(null)} onSave={async text=>{if(!text.trim())throw new Error('记忆内容不能为空');if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('日期请填 YYYY-MM-DD');await save({...editing==='new'?{id:uuid(),source_ids:[]}:editing,text,kind,date:date||undefined,status,pinned:true,authority:'explicit'});}} onDelete={editing&&editing!=='new'?()=>save({...editing,status:'forgotten'}):undefined}>
 <View style={s.wrap}>{(Object.keys(kinds) as MemoryKind[]).map(k=><Pressable key={k} onPress={()=>setKind(k)} style={[s.chip,kind===k&&s.chipOn]}><Text style={s.link}>{kinds[k]}</Text></Pressable>)}</View>{kind==='agreement'?<><TextInput testID="memory-date" style={s.single} placeholder="约定日期 YYYY-MM-DD" value={date} onChangeText={setDate}/><View style={s.wrap}>{['active','done','cancelled'].map(st=><Pressable key={st} onPress={()=>setStatus(st)} style={[s.chip,status===st&&s.chipOn]}><Text style={s.link}>{statuses[st]}</Text></Pressable>)}</View></>:null}</Editor>
 <Reader visible={!!reader} title={reader?.title??''} text={reader?.text??''} onClose={()=>setReader(null)} onRestore={reader?.restore}/>
 <Reader visible={!!history} title="记忆历史版本" text={history?.rows.length?'':'尚无历史版本'} onClose={()=>setHistory(null)}>{history?.rows.map(v=><Pressable key={v.id} style={s.card} onPress={()=>{const m=history.memory;setHistory(null);setReader({title:'历史版本',text:v.text,restore:()=>save({...v,id:m.id,authority:'explicit',pinned:true})});}}><Text style={s.secondary}>{v.saved_at} · {statuses[v.status]}</Text><Text numberOfLines={3} style={s.text}>{v.text}</Text></Pressable>)}</Reader>
 </SafeAreaView>;
}
