import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, radius, spacing } from '../../constants/theme';
import { db } from '../../lib/localdb';
import { useCardStore } from '../../lib/store';
import { useDataBus } from '../../lib/dataBus';
import { useLingSettings } from '../../lib/ling/settings';
import { completionDay, dateKey, monthDays, shiftDay, shiftMonth } from '../../lib/habitDays';
import { periodOn, setHabitDay, setHabitNote, setPeriodDay } from '../../lib/habits';
import { groupOf, loadGroupOrder, sortGroupNames } from '../../lib/careGroups';
import { describeFrequency } from '../../lib/decay';
import { HabitHistorySheet } from './HabitHistorySheet';
import { CatPickerModal } from '../common/CatPickerModal';
import type { Action, Card, Completion } from '../../types';

type Item={card:Card;action:Action};
export function HabitsSection({date,today,onDateChange}:{date:string;today:string;onDateChange:(date:string)=>void}){
  const {cards,actions,cats,fetchAll}=useCardStore();
  const hour=useLingSettings(s=>s.settings.dayStartHour);
  const version=useDataBus(s=>s.version);
  const [mode,setMode]=useState<'day'|'month'>('day');
  const [month,setMonth]=useState(date.slice(0,7));
  const [records,setRecords]=useState<Completion[]>([]);
  const [periods,setPeriods]=useState<any[]>([]);
  const [groupsOrder,setGroupsOrder]=useState<string[]>([]);
  const [order,setOrder]=useState<string[]>([]);
  const [editingOrder,setEditingOrder]=useState(false);
  const [error,setError]=useState('');
  const [history,setHistory]=useState<Item|null>(null);
  const [note,setNote]=useState<{id:string;name:string;date:string;text:string;period?:boolean}|null>(null);
  const [draft,setDraft]=useState('');
  const [picker,setPicker]=useState<Item|null>(null);
  const [busy,setBusy]=useState<string|null>(null);
  const working=useRef(false);
  useEffect(()=>{setMonth(date.slice(0,7));},[date]);
  const load=useCallback(async()=>{
    const [r,p,g,o]=await Promise.all([
      db.from('completions').select('*').eq('undone',false),
      db.from('body_records').select('*').in('kind',['period','period_day']),
      loadGroupOrder(),db.from('settings').select('value').eq('key','habit_order_v1').maybeSingle(),
    ]);
    if(r.error||p.error||o.error)throw new Error(r.error?.message||p.error?.message||o.error?.message);
    setRecords(r.data??[]);setPeriods(p.data??[]);setGroupsOrder(g);
    setOrder(Array.isArray(o.data?.value)?o.data.value:[]);
  },[]);
  useFocusEffect(useCallback(()=>{fetchAll();load().catch(e=>setError(e.message));},[load,fetchAll]));
  useEffect(()=>{load().catch(e=>setError(e.message));},[load,version]);
  const items=useMemo(()=>cards.filter(c=>!c.archived&&c.display_type==='habit').flatMap(card=>{
    const action=actions.find(a=>a.card_id===card.id&&a.is_primary);return action?[{card,action}]:[];
  }).sort((a,b)=>{
    const rank=(id:string)=>order.includes(id)?order.indexOf(id):100000;
    return rank(a.card.id)-rank(b.card.id);
  }),[cards,actions,order]);
  const groups=sortGroupNames([...new Set(items.map(i=>groupOf(i.card)))],groupsOrder);
  const entry=(id:string,key=date)=>records.find(r=>r.action_id===id&&completionDay(r,hour)===key);
  async function run(id:string,fn:()=>Promise<void>){
    if(working.current)return;working.current=true;setBusy(id);setError('');
    try{await fn();await load();await fetchAll();useDataBus.getState().bump();}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{working.current=false;setBusy(null);}
  }
  function toggle(it:Item,selectedCats?:string[]){
    if(date>today)return;
    const checked=!!entry(it.action.id);
    if(!checked&&it.action.requires_selection&&cats.length&&!selectedCats){setPicker(it);return;}
    run(it.card.id,()=>setHabitDay(it.action,it.card,date,!checked,hour,{selectedCats}));
  }
  function editNote(it:Item){
    const r=entry(it.action.id);if(!r)return;
    setDraft(r.notes??'');setNote({id:r.id,name:it.card.name,date,text:r.notes??''});
  }
  async function move(it:Item,delta:number){
    const peers=items.filter(i=>groupOf(i.card)===groupOf(it.card));
    const at=peers.findIndex(i=>i.card.id===it.card.id),to=at+delta;
    if(to<0||to>=peers.length)return;
    const next=items.map(i=>i.card.id),a=next.indexOf(it.card.id),b=next.indexOf(peers[to].card.id);
    [next[a],next[b]]=[next[b],next[a]];
    await run('order',async()=>{const {error}=await db.from('settings').upsert({key:'habit_order_v1',value:next},{onConflict:'key'});if(error)throw new Error(error.message);});
  }
  const periodChecked=periodOn(date,periods);
  const periodNote=periods.find(r=>r.kind==='period_day'&&r.date===date)?.note??'';
  return <View style={s.wrap} testID="habits-section">
    <View style={s.head}><Text style={s.title}>习惯</Text><View style={s.row}>
      {(['day','month'] as const).map(v=><Pressable key={v} testID={`habits-${v}`} onPress={()=>setMode(v)} style={[s.chip,mode===v&&s.chipOn]}><Text style={[s.chipText,mode===v&&s.white]}>{v==='day'?'日':'月'}</Text></Pressable>)}
      <Pressable testID="habit-create" onPress={()=>router.push('/habit/new')}><Text style={s.link}>＋ 新习惯</Text></Pressable>
    </View></View>
    <View style={s.head}>
      <Pressable testID="habits-prev" onPress={()=>mode==='month'?setMonth(shiftMonth(month,-1)):onDateChange(shiftDay(date,-1))}><Text style={s.link}>‹</Text></Pressable>
      <Text style={s.label}>{mode==='month'?month.replace('-','年')+'月':date+(date===today?' · 今天':'')}</Text>
      <Pressable testID="habits-next" onPress={()=>mode==='month'?setMonth(shiftMonth(month,1)):onDateChange(shiftDay(date,1))}><Text style={s.link}>›</Text></Pressable>
    </View>
    {mode==='month'?<View style={s.calendar}>
      {['一','二','三','四','五','六','日'].map(w=><Text key={w} style={s.week}>{w}</Text>)}
      {monthDays(month).map((d,i)=>d?<Pressable key={d} testID={`habit-date-${d}`} style={[s.day,d===date&&s.dayOn]} onPress={()=>onDateChange(d)}>
        <Text style={[s.dayNumber,d===date&&s.white]}>{Number(d.slice(-2))}</Text>
        <Text style={[s.count,d===date&&s.white]}>{items.filter(it=>entry(it.action.id,d)).length+(periodOn(d,periods)?1:0)||'·'}</Text>
      </Pressable>:<View key={`blank-${i}`} style={s.day}/>)}
    </View>:null}
    <View style={s.head}><Text style={s.muted}>{date>today?'这一天还没到':date!==today?'可以补记或取消这一天的记录':'点一下选中，再点一下取消'}</Text><View style={s.row}>
      <Pressable testID="habit-groups" onPress={()=>router.push('/care-groups')}><Text style={s.link}>分类</Text></Pressable>
      <Pressable testID="habit-sort" onPress={()=>setEditingOrder(v=>!v)}><Text style={s.link}>{editingOrder?'完成排序':'排序'}</Text></Pressable>
    </View></View>
    {!items.length?<Text style={s.muted}>原来的习惯会显示在这里，也可以点「新习惯」添加。</Text>:null}
    {groups.map(g=><View key={g} style={s.group}><Text style={s.label}>{g}</Text><View style={s.grid}>
      {items.filter(i=>groupOf(i.card)===g).map(it=>{
        const r=entry(it.action.id);return <View key={it.card.id} style={s.cell}>
          <CheckTile name={it.card.name} emoji={it.card.emoji||'⭐'} checked={!!r} disabled={busy!==null||date>today} onPress={()=>toggle(it)} onLongPress={()=>setHistory(it)} id={`habit-check-${it.card.id}`}/>
          <Text style={s.frequency}>{describeFrequency({...it.action,remind_at:null})}</Text>
          {r?<Pressable testID={`habit-note-${it.card.id}`} onPress={()=>editNote(it)}><Text numberOfLines={2} style={s.link}>{r.notes||'＋ 写一句'}</Text></Pressable>:null}
          <View style={s.row}><Pressable testID={`habit-history-${it.card.id}`} onPress={()=>setHistory(it)}><Text style={s.link}>记录</Text></Pressable>
          {editingOrder?<><Pressable testID={`habit-up-${it.card.id}`} onPress={()=>move(it,-1)}><Text style={s.link}>↑</Text></Pressable><Pressable onPress={()=>move(it,1)}><Text style={s.link}>↓</Text></Pressable></>:null}</View>
        </View>;
      })}
    </View></View>)}
    <View style={s.group}><Text style={s.label}>身体</Text><View style={s.grid}><View style={s.cell}>
      <CheckTile name="生理期" emoji="🌸" checked={periodChecked} disabled={busy!==null||date>today} id="habit-period" onPress={()=>run('period',()=>setPeriodDay(date,!periodChecked))}/>
      {periodChecked?<Pressable testID="period-note" onPress={()=>{setDraft(periodNote);setNote({id:'period',name:'生理期',date,text:periodNote,period:true});}}><Text style={s.link}>{periodNote||'＋ 写一句'}</Text></Pressable>:null}
    </View></View></View>
    {error?<Text testID="habit-error" style={s.error}>{error}</Text>:null}
    <HabitHistorySheet target={history} cats={cats} dayStartHour={hour} onClose={()=>setHistory(null)} onEdit={card=>{setHistory(null);router.push(`/habit/${card.id}`);}} onEditEntry={r=>{setHistory(null);setDraft(r.notes??'');setNote({id:r.id,name:history?.card.name??'习惯',date:completionDay(r,hour),text:r.notes??''});}}/>
    <CatPickerModal visible={!!picker} cats={cats} title={picker?.card.name??''} onCancel={()=>setPicker(null)} onConfirm={ids=>{const it=picker;setPicker(null);if(it)toggle(it,ids);}}/>
    <Modal visible={!!note} transparent animationType="fade" onRequestClose={()=>setNote(null)}><View style={s.backdrop}><View style={s.sheet}>
      <Text style={s.title}>{note?.name} · {note?.date}</Text>
      <TextInput testID="habit-note-input" value={draft} onChangeText={setDraft} multiline placeholder="这次想记点什么？可以留空" style={s.input}/>
      <View style={s.head}><Pressable onPress={()=>setNote(null)}><Text style={s.link}>取消</Text></Pressable><Pressable testID="habit-note-save" disabled={busy!==null} onPress={()=>{const n=note;if(n)run('note',async()=>{if(n.period)await setPeriodDay(n.date,true,draft);else await setHabitNote(n.id,draft);setNote(null);});}}><Text style={s.link}>保存</Text></Pressable></View>
    </View></View></Modal>
  </View>;
}
function CheckTile({name,emoji,checked,disabled,onPress,onLongPress,id}:{name:string;emoji:string;checked:boolean;disabled:boolean;onPress:()=>void;onLongPress?:()=>void;id:string}){
  const scale=useRef(new Animated.Value(1)).current;
  const last=useRef(checked);
  useEffect(()=>{if(last.current===checked)return;last.current=checked;scale.setValue(checked?0.82:1.12);Animated.spring(scale,{toValue:1,useNativeDriver:true,speed:22,bounciness:8}).start();},[checked,scale]);
  return <Pressable accessibilityRole="checkbox" accessibilityState={{checked,disabled}} aria-checked={checked} aria-disabled={disabled} testID={id} disabled={disabled} onPress={onPress} onLongPress={onLongPress} delayLongPress={400} style={s.tile}>
    <Animated.View style={[s.circle,checked&&s.circleOn,{transform:[{scale}]}]}><Text style={s.emoji}>{checked?'✓':emoji}</Text></Animated.View>
    <Text style={[s.name,checked&&s.nameOn]}>{name}</Text>
  </Pressable>;
}
const s=StyleSheet.create({
  wrap:{gap:12,marginTop:16,paddingTop:14,borderTopWidth:1,borderTopColor:colors.background},head:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},row:{flexDirection:'row',alignItems:'center',gap:14},
  title:{fontSize:17,fontWeight:'600',color:colors.textPrimary},label:{fontSize:14,color:colors.textSecondary},link:{fontSize:13,color:colors.purpleDark},muted:{fontSize:12,color:colors.textMuted,flexShrink:1},
  chip:{paddingVertical:5,paddingHorizontal:12,borderRadius:14,backgroundColor:colors.background},chipOn:{backgroundColor:colors.purpleDark},chipText:{fontSize:13,color:colors.purpleDark},white:{color:'#fff'},
  group:{gap:8},grid:{flexDirection:'row',flexWrap:'wrap'},cell:{width:'33.333%',padding:5,alignItems:'center',gap:7},tile:{alignItems:'center',gap:7,width:'100%'},
  circle:{width:54,height:54,borderRadius:27,borderWidth:2,borderColor:colors.purpleLight,backgroundColor:colors.background,justifyContent:'center',alignItems:'center'},circleOn:{backgroundColor:colors.purpleDark,borderColor:colors.purpleDark},emoji:{fontSize:25,color:'#fff'},name:{fontSize:14,color:colors.textPrimary,textAlign:'center'},nameOn:{color:colors.purpleDark,fontWeight:'600'},frequency:{fontSize:11,color:colors.textMuted,textAlign:'center'},
  calendar:{flexDirection:'row',flexWrap:'wrap',backgroundColor:colors.background,borderRadius:radius.widget,padding:4},week:{width:'14.2857%',textAlign:'center',fontSize:12,color:colors.textMuted,paddingVertical:6},day:{width:'14.2857%',height:48,alignItems:'center',justifyContent:'center',borderRadius:12},dayOn:{backgroundColor:colors.purpleDark},dayNumber:{fontSize:14,color:colors.textPrimary},count:{fontSize:10,color:colors.purpleDark},
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.25)',justifyContent:'center',padding:spacing.lg},sheet:{backgroundColor:colors.card,borderRadius:radius.card,padding:spacing.lg,gap:16},input:{minHeight:110,maxHeight:240,textAlignVertical:'top',backgroundColor:colors.background,borderRadius:radius.widget,padding:12,color:colors.textPrimary,fontSize:15},error:{color:colors.redDark,fontSize:13},
});
