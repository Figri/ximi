import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { colors, fontSize, lh, radius, spacing } from '../../constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Action, Card, TimeOfDay } from '../../types';

export type HabitItem = { card: Card; action: Action; period?: boolean };
export const SLOTS = [{key:'morning',label:'上午'},{key:'day',label:'下午'},{key:'evening',label:'晚上'}] as const;
export const habitSlot = (card: Card): TimeOfDay => card.time_of_day === 'day' || card.time_of_day === 'evening' ? card.time_of_day : 'morning';
export type HabitDraft = {name:string;emoji:string;slot:TimeOfDay;frequency:'daily'|'interval'|'fixed_day'|'manual';days:number;weekdays:number[];selection:boolean;remindAt:string|null;note:string};
type HabitTemplate = Omit<HabitDraft, 'name' | 'emoji'>;
const TEMPLATE_KEY = 'habit_editor_clipboard_v1';
export function HabitEditorModal({ target, day, checked, note, onClose, onSave, onDelete, onDeleteRecord, onHistory }: {
  target: HabitItem | 'new' | null; day: string; checked: boolean; note: string;
  onClose:()=>void; onSave:(draft:HabitDraft)=>Promise<void>; onDelete:()=>Promise<void>;
  onDeleteRecord:()=>Promise<void>; onHistory:()=>void;
}) {
  const it = target && target !== 'new' ? target : null;
  const [name,setName]=useState(''),[emoji,setEmoji]=useState('⭐');
  const [slot,setSlot]=useState<TimeOfDay>('morning');
  const [frequency,setFrequency]=useState<HabitDraft['frequency']>('daily');
  const [days,setDays]=useState('3'),[weekdays,setWeekdays]=useState<number[]>([]),[selection,setSelection]=useState(false);
  const [remind,setRemind]=useState(false),[remindAt,setRemindAt]=useState('20:00');
  const [draftNote,setDraftNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const working=useRef(false);
  const [clipboard,setClipboard]=useState<HabitTemplate|null>(null),[copied,setCopied]=useState(false);
  const copyVersion=useRef(0);
  useEffect(()=>{let active=true;AsyncStorage.getItem(TEMPLATE_KEY).then(raw=>{
    if(active&&copyVersion.current===0&&raw){const t=JSON.parse(raw);if(t&&Array.isArray(t.weekdays)&&typeof t.frequency==='string')setClipboard(t);}
  }).catch(()=>{});return()=>{active=false;};},[]);
  function template():HabitTemplate{return {slot,frequency,days:Number(days),weekdays:[...weekdays],selection,remindAt:remind?remindAt:null,note:draftNote};}
  async function copy(){
    const value=template();copyVersion.current++;
    try{await AsyncStorage.setItem(TEMPLATE_KEY,JSON.stringify(value));setClipboard(value);setCopied(true);setError('');}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  function paste(){
    if(!clipboard)return;
    setSlot(clipboard.slot);setFrequency(clipboard.frequency);setDays(String(clipboard.days));setWeekdays([...clipboard.weekdays]);
    setSelection(clipboard.selection);setRemind(!!clipboard.remindAt);setRemindAt(clipboard.remindAt??'20:00');setDraftNote(clipboard.note);setError('');
  }
  useEffect(()=>{
    if(!target)return;
    setCopied(false);
    const i=target==='new'?null:target;
    setName(i?.card.name??'');setEmoji(i?.card.emoji??'⭐');setSlot(i?habitSlot(i.card):'morning');
    const a=i?.action,n=a?.suggested_interval??a?.interval_days??1;
    setFrequency(a?.frequency_type==='fixed_day'?'fixed_day':a?.frequency_type==='manual'?'manual':n===1?'daily':'interval');
    setDays(String(n));setWeekdays(a?.fixed_days??[1,2,3,4,5,6,7]);setSelection(a?.requires_selection??false);
    setRemind(!!a?.remind_at);setRemindAt(a?.remind_at??'20:00');setDraftNote(note);setError('');
  },[target,day,note]);
  async function act(kind:'save'|'delete'|'record'){
    if(working.current)return;
    if(kind==='save'&&!it?.period){
      if(!name.trim()){setError('请填写习惯名称');return;}
      if(frequency==='interval'&&(!/^\d+$/.test(days)||Number(days)<1)){setError('间隔天数至少为 1');return;}
      if(remind&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(remindAt)){setError('提醒时间请填写为 20:00 这样的格式');return;}
      if(frequency==='fixed_day'&&!weekdays.length){setError('请选择重复的星期');return;}
    }
    working.current=true;setBusy(true);setError('');
    try{
      if(kind==='delete')await onDelete();
      else if(kind==='record')await onDeleteRecord();
      else await onSave({name:name.trim(),emoji:emoji.trim()||'⭐',slot,frequency,days:Number(days),weekdays,selection,remindAt:remind?remindAt:null,note:draftNote});
      onClose();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{working.current=false;setBusy(false);}
  }
  return <Modal visible={!!target} transparent animationType="fade" onRequestClose={()=>!busy&&onClose()}>
    <KeyboardAvoidingView behavior="padding" style={s.backdrop}><View style={s.sheet} testID="habit-editor">
      <View style={s.between}><Text style={s.title}>{target==='new'?'新习惯':`编辑${it?.period?'生理期':'习惯'}`}</Text>
        <View style={s.row}><Pressable accessibilityRole="button" testID="habit-copy" disabled={busy} onPress={copy}><Text style={s.link}>{copied?'已复制':'复制'}</Text></Pressable><Pressable accessibilityRole="button" testID="habit-paste" disabled={!clipboard||busy} onPress={paste}><Text style={[s.link,!clipboard&&{opacity:0.35}]}>粘贴</Text></Pressable></View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.form}>
        {!it?.period?<View style={s.row}><TextInput testID="habit-emoji" style={[s.input,s.emoji]} value={emoji} onChangeText={setEmoji}/><TextInput testID="habit-name" style={[s.input,s.flex]} value={name} onChangeText={setName} placeholder="习惯名称"/></View>:null}
        <Text style={s.label}>时间</Text><View style={s.row}>{SLOTS.map(v=><Pressable key={v.key} testID={`habit-slot-${v.key}`} onPress={()=>setSlot(v.key)} style={[s.chip,slot===v.key&&s.on]}><Text style={[s.label,slot===v.key&&s.white]}>{v.label}</Text></Pressable>)}</View>
        {!it?.period?<>
          <Text style={s.label}>重复</Text><View style={[s.row,s.wrap]}>{([{key:'daily',label:'每天'},{key:'fixed_day',label:'每周'},{key:'interval',label:'间隔天数'},{key:'manual',label:'不定期'}] as const).map(v=><Pressable key={v.key} testID={`habit-frequency-${v.key}`} onPress={()=>setFrequency(v.key)} style={[s.chip,frequency===v.key&&s.on]}><Text style={[s.label,frequency===v.key&&s.white]}>{v.label}</Text></Pressable>)}</View>
          {frequency==='fixed_day'?<View style={[s.row,s.wrap]}>{['一','二','三','四','五','六','日'].map((v,i)=><Pressable key={v} testID={`habit-weekday-${i+1}`} onPress={()=>setWeekdays(a=>a.includes(i+1)?a.filter(n=>n!==i+1):[...a,i+1].sort())} style={[s.day,weekdays.includes(i+1)&&s.on]}><Text style={[s.label,weekdays.includes(i+1)&&s.white]}>{v}</Text></Pressable>)}</View>:null}
          {frequency==='interval'?<TextInput testID="habit-interval" style={s.input} value={days} onChangeText={setDays} keyboardType="numeric" accessibilityLabel="间隔天数"/>:null}
          <View style={s.between}><Text style={s.label}>提醒</Text><Switch testID="habit-remind" value={remind} onValueChange={setRemind}/></View>
          {remind?<TextInput testID="habit-remind-at" style={s.input} value={remindAt} onChangeText={setRemindAt} keyboardType="numbers-and-punctuation" placeholder="20:00"/>:null}
          <View style={s.between}><Text style={s.label}>完成时选猫</Text><Switch testID="habit-cats" value={selection} onValueChange={setSelection}/></View>
        </>:null}
        <><Text style={s.label}>{checked?`${day} · 完成记录`:'描述'}</Text><TextInput testID="habit-note-input" style={[s.input,s.note]} multiline value={draftNote} onChangeText={setDraftNote} placeholder="描述" textAlignVertical="top"/></>
        {it&&!it.period?<Pressable accessibilityRole="button" testID="habit-history" disabled={busy} onPress={onHistory}><Text style={s.link}>历史记录 ›</Text></Pressable>:null}
        {error?<Text testID="habit-editor-error" style={s.error}>{error}</Text>:null}
      </ScrollView>
      <View style={s.between}>
        <View style={s.deleteActions}>
          {it?<Pressable accessibilityRole="button" testID="habit-delete" disabled={busy} onPress={()=>act('delete')}><Text style={s.error}>删除{it.period?'记录项':'习惯'}</Text></Pressable>:null}
          {checked?<Pressable accessibilityRole="button" testID="habit-delete-record" disabled={busy} onPress={()=>act('record')}><Text style={s.error}>删除当天记录</Text></Pressable>:null}
        </View>
        <View style={s.row}><Pressable accessibilityRole="button" testID="habit-cancel" disabled={busy} onPress={onClose}><Text style={s.link}>取消</Text></Pressable><Pressable accessibilityRole="button" testID="habit-save" disabled={busy} onPress={()=>act('save')}><Text style={s.link}>{busy?'保存中…':'保存'}</Text></Pressable></View>
      </View>
    </View></KeyboardAvoidingView>
  </Modal>;
}
const s=StyleSheet.create({
  backdrop:{flex:1,justifyContent:'center',backgroundColor:'rgba(61,53,84,0.3)',padding:spacing.lg},sheet:{backgroundColor:colors.card,borderRadius:radius.card,padding:20,gap:20,maxHeight:'88%',width:'100%',maxWidth:600,alignSelf:'center'},
  title:{fontSize:fontSize.cardName,fontWeight:'600',color:colors.textPrimary},form:{gap:14},label:{fontSize:fontSize.secondary,color:colors.textSecondary},row:{flexDirection:'row',alignItems:'center',gap:10},wrap:{flexWrap:'wrap'},between:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},flex:{flex:1},
  input:{padding:12,borderRadius:radius.widget,backgroundColor:colors.background,color:colors.textPrimary,fontSize:fontSize.body},emoji:{width:60,textAlign:'center'},note:{minHeight:100,lineHeight:lh(24)},chip:{paddingVertical:8,paddingHorizontal:12,borderRadius:18,backgroundColor:colors.background},day:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:colors.background},on:{backgroundColor:colors.purpleDark},white:{color:'#fff'},link:{color:colors.purpleDark,fontSize:fontSize.body},error:{color:colors.redDark,fontSize:fontSize.secondary},deleteActions:{gap:12,flexShrink:1},
});
