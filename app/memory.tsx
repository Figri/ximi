import {useEffect,useRef,useState} from 'react';
import {KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {readTable} from '../lib/localdb';
import {memories,saveMemoryDocument} from '../lib/ling/repository';
import {memoryDocument,MEMORY_KINDS,MEMORY_LABELS} from '../lib/ling/memoryDocuments';
import {summarizeLocal} from '../lib/ling/service';
import {syncCompanion} from '../lib/ling/cloud';
import {type Memory,type MemoryKind} from '../lib/ling/core';
import {useCompanionEvents} from '../lib/ling/events';
import {LingLockGate} from '../components/ling/LingLockGate';
import {Reader} from '../components/ling/Editor';
import {s} from './ling-settings';
export default function Screen(){return <LingLockGate><MemoryPage/></LingLockGate>;}
function MemoryGroup({kind,items,onSource,hidden}:{kind:MemoryKind;items:Memory[];hidden:boolean;onSource:(items:Memory[])=>void}){
 const [text,setText]=useState(()=>memoryDocument(items)),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const snapshot=useRef(items),value=useRef(text),dirty=useRef(false),running=useRef(false),queued=useRef(false);
 const signature=JSON.stringify(items);
 useEffect(()=>{if(!dirty.current){snapshot.current=items;value.current=memoryDocument(items);setText(value.current);}},[signature]);
 async function save(){if(running.current){queued.current=true;return;}if(!dirty.current)return;running.current=true;setSaving(true);const sent=value.current;let failed=false;
  try{const current=await saveMemoryDocument(kind,snapshot.current,sent);snapshot.current=current;dirty.current=value.current!==sent;if(!dirty.current){value.current=memoryDocument(current);setText(value.current);}setError('');syncCompanion().catch(()=>{});}
  catch(e){failed=true;setError(e instanceof Error?e.message:String(e));}
  finally{running.current=false;setSaving(false);if(queued.current){queued.current=false;if(!failed&&dirty.current)setTimeout(save,0);}}
 }
 return <View style={[s.card,hidden&&{display:'none'}]} testID={`memory-group-${kind}`}><View style={s.row}><Text style={s.label}>{MEMORY_LABELS[kind]}</Text><Pressable testID={`memory-save-${kind}`} disabled={saving} onPress={save}><Text style={s.link}>{saving?'保存中':'保存'}</Text></Pressable></View><TextInput testID={`memory-input-${kind}`} multiline value={text} onChangeText={v=>{value.current=v;dirty.current=true;setText(v);}} onBlur={save} placeholder={`写下要记住的${MEMORY_LABELS[kind]}`} textAlignVertical="top" style={[s.input,styles.document,{height:kind==='core'?240:154}]} scrollEnabled/><View style={s.row}><Pressable onPress={()=>onSource(items)}><Text style={s.secondary}>来源</Text></Pressable>{error?<Pressable testID={`memory-reload-${kind}`} onPress={async()=>{const current=(await memories()).filter(m=>m.kind===kind);snapshot.current=current;value.current=memoryDocument(current);dirty.current=false;setText(value.current);setError('');}}><Text style={s.link}>重新载入</Text></Pressable>:null}</View>{error?<Text style={s.notice}>{error}</Text>:null}</View>;
}
function MemoryPage(){const [items,setItems]=useState<Memory[]>([]),[query,setQuery]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[reader,setReader]=useState<{title:string;text:string}|null>(null);const version=useCompanionEvents(v=>v.version);useEffect(()=>{memories().then(setItems);},[version]);
 async function source(group:Memory[]){const rows=await readTable('ling_messages'),sources=await readTable('ling_sources');setReader({title:'记忆来源',text:group.map(m=>m.text+'\n'+(m.source_ids.map(id=>{const r=rows.find(r=>r.id===id&&!r.deleted),s=sources.find(s=>s.id===id&&!s.deleted);return s?`${s.title} · ${s.created_at}\n${s.text}`:r?`${r.created_at}\n${r.content}`:'原对话已删除，记忆独立保存';}).join('\n\n')||'手动记忆')).join('\n\n')||'尚未添加记忆'});}
 async function digest(){setBusy(true);try{setNotice(await summarizeLocal());syncCompanion().catch(()=>{});}catch(e){setNotice(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 return <SafeAreaView style={s.page} edges={['top','bottom']}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='web'?undefined:'padding'}><View style={s.header}><Pressable onPress={()=>router.back()}><Text style={s.link}>‹ 返回</Text></Pressable><Text style={s.title}>灵的记忆</Text><Pressable testID="ling-memory-digest" disabled={busy} onPress={digest}><Text style={s.link}>{busy?'整理中':'整理未归档'}</Text></Pressable></View><View style={styles.search}><TextInput testID="ling-memory-search" style={s.single} placeholder="搜索记忆" value={query} onChangeText={setQuery}/>{notice?<Text style={s.notice}>{notice}</Text>:null}</View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>{MEMORY_KINDS.map(kind=>{const group=items.filter(m=>m.kind===kind);return <MemoryGroup key={kind} kind={kind} items={group} onSource={source} hidden={!!query&&!MEMORY_LABELS[kind].includes(query)&&!group.some(m=>m.text.includes(query))}/>;})}</ScrollView></KeyboardAvoidingView><Reader visible={!!reader} title={reader?.title??''} text={reader?.text??''} onClose={()=>setReader(null)}/></SafeAreaView>;
}
const styles=StyleSheet.create({flex:{flex:1},document:{minHeight:120},search:{paddingHorizontal:16,paddingTop:4,paddingBottom:8}});
