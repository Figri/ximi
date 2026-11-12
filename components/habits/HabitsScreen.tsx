import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { colors, radius, spacing } from '../../constants/theme';
import { db } from '../../lib/localdb';
import { archiveCard, createCard, updateAction, updateCard } from '../../lib/cards';
import { useCardStore } from '../../lib/store';
import { useDataBus } from '../../lib/dataBus';
import { lingDayKey, useLingSettings } from '../../lib/ling/settings';
import { completionDay, monthDays, shiftDay, shiftMonth, weekDays } from '../../lib/habitDays';
import { periodOn, setHabitDay, setPeriodDay } from '../../lib/habits';
import { rescheduleAll } from '../../lib/ling/proactive';
import { HabitEditorModal, habitSlot, SLOTS, type HabitDraft, type HabitItem } from './HabitEditorModal';
import { HabitHistorySheet } from '../today/HabitHistorySheet';
import { CatPickerModal } from '../common/CatPickerModal';
import type { Card, Completion, TimeOfDay } from '../../types';

type Row = { key: string; slot: TimeOfDay; item?: HabitItem };
const PERIOD_ID='__period__';
const WEEK=['一','二','三','四','五','六','日'];
export default function HabitsScreen(){
  const {cards,actions,cats,fetchAll}=useCardStore();
  const hour=useLingSettings(s=>s.settings.dayStartHour),loadSettings=useLingSettings(s=>s.load);
  const version=useDataBus(s=>s.version);
  const [now,setNow]=useState(()=>new Date());
  const today=lingDayKey(now,hour);
  const [selected,setSelected]=useState<string|null>(null),date=selected??today;
  const [mode,setMode]=useState<'day'|'week'|'month'>('day');
  const [records,setRecords]=useState<Completion[]>([]),[periods,setPeriods]=useState<any[]>([]);
  const [order,setOrder]=useState<string[]>([]),[periodSlot,setPeriodSlot]=useState<TimeOfDay>('evening'),[periodHidden,setPeriodHidden]=useState(false);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const working=useRef(false);
  const [edit,setEdit]=useState<{item:HabitItem|'new';day:string}|null>(null);
  const [history,setHistory]=useState<HabitItem|null>(null);
  const [picker,setPicker]=useState<{item:HabitItem;day:string}|null>(null);
  useEffect(()=>{loadSettings();const t=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(t);},[loadSettings]);
  const load=useCallback(async()=>{
    const [r,p,o]=await Promise.all([
      db.from('completions').select('*').eq('undone',false),
      db.from('body_records').select('*').in('kind',['period','period_day']),
      db.from('settings').select('*').in('key',['habit_order_v1','habit_period_slot','habit_period_hidden']),
    ]);
    if(r.error||p.error||o.error)throw new Error(r.error?.message||p.error?.message||o.error?.message);
    setRecords(r.data??[]);setPeriods(p.data??[]);
    const values=Object.fromEntries((o.data??[]).map((v:any)=>[v.key,v.value]));
    setOrder(Array.isArray(values.habit_order_v1)?values.habit_order_v1:[]);
    setPeriodSlot(['morning','day','evening'].includes(values.habit_period_slot)?values.habit_period_slot:'evening');
    setPeriodHidden(values.habit_period_hidden===true);
  },[]);
  useFocusEffect(useCallback(()=>{setNow(new Date());fetchAll();load().catch(e=>setError(e.message));},[load,fetchAll]));
  useEffect(()=>{load().catch(e=>setError(e.message));},[load,version]);
  const items=useMemo(()=>{
    const all:HabitItem[]=cards.filter(c=>!c.archived&&c.display_type==='habit').flatMap(card=>{
      const action=actions.find(a=>a.card_id===card.id&&a.is_primary);return action?[{card,action}]:[];
    });
    if(!periodHidden)all.push({period:true,card:{id:PERIOD_ID,name:'生理期',emoji:'🌸',time_of_day:periodSlot} as Card,action:{id:PERIOD_ID} as HabitItem['action']});
    return all.sort((a,b)=>(order.includes(a.card.id)?order.indexOf(a.card.id):100000)-(order.includes(b.card.id)?order.indexOf(b.card.id):100000));
  },[cards,actions,periodSlot,periodHidden,order]);
  const rows:Row[]=SLOTS.flatMap(s=>[{key:`header-${s.key}`,slot:s.key},...items.filter(i=>habitSlot(i.card)===s.key).map(item=>({key:item.card.id,slot:s.key,item}))]);
  // 每个动作/日期只取一条，兼容旧库中同一天曾重复打卡的记录。
  const byDay=useMemo(()=>{
    const m=new Map<string,Completion>();
    for(const r of records)m.set(`${r.action_id}:${completionDay(r,hour)}`,r);
    return m;
  },[records,hour]);
  const entry=(it:HabitItem,day:string)=>byDay.get(`${it.action.id}:${day}`);
  const checked=(it:HabitItem,day:string)=>it.period?periodOn(day,periods):!!entry(it,day);
  const note=(it:HabitItem,day:string)=>it.period?periods.find(r=>r.kind==='period_day'&&r.date===day)?.note??'':entry(it,day)?.notes??'';
  async function run(fn:()=>Promise<void>,propagate=false){
    if(working.current){if(propagate)throw new Error('正在保存，请稍后');return;}
    working.current=true;setBusy(true);setError('');
    try{await fn();await load();await fetchAll();useDataBus.getState().bump();}
    catch(e){setError(e instanceof Error?e.message:String(e));if(propagate)throw e;}
    finally{working.current=false;setBusy(false);}
  }
  async function setting(key:string,value:unknown){const {error}=await db.from('settings').upsert({key,value},{onConflict:'key'});if(error)throw new Error(error.message);}
  function toggle(it:HabitItem,day:string,selectedCats?:string[]){
    if(day>today||working.current)return;
    if(!checked(it,day)&&it.action.requires_selection&&cats.length&&!selectedCats){setPicker({item:it,day});return;}
    run(()=>it.period?setPeriodDay(day,!checked(it,day)):setHabitDay(it.action,it.card,day,!checked(it,day),hour,{selectedCats}));
  }
  async function save(d:HabitDraft){
    const target=edit;if(!target)return;
    await run(async()=>{
      if(target.item!=='new'&&target.item.period){
        await setting('habit_period_slot',d.slot);
        if(checked(target.item,target.day))await setPeriodDay(target.day,true,d.note);
        return;
      }
      const days=d.frequency==='daily'?1:d.days;
      const frequency={frequency_type:d.frequency==='daily'?'interval' as const:d.frequency,
        interval_days:d.frequency==='fixed_day'||d.frequency==='manual'?null:days,
        suggested_interval:d.frequency==='fixed_day'||d.frequency==='manual'?null:days,
        max_delay:d.frequency==='fixed_day'||d.frequency==='manual'?null:Math.ceil(days*1.5),
        fixed_days:d.frequency==='fixed_day'?d.weekdays:null,requires_selection:d.selection,remind_at:d.remindAt};
      if(target.item==='new'){
        await createCard({name:d.name,type:'habit',display_type:'habit',tags:[],notes:null,emoji:d.emoji,time_of_day:d.slot},[{name:'完成',is_primary:true,...frequency}]);
      }else{
        const it=target.item;
        await updateCard(it.card.id,{name:d.name,emoji:d.emoji,time_of_day:d.slot});
        await updateAction(it.action.id,frequency);
        if(checked(it,target.day))await setHabitDay(it.action,it.card,target.day,true,hour,{notes:d.note});
      }
      rescheduleAll().catch(()=>[]);
    },true);
  }
  async function deleteHabit(){
    if(!edit||edit.item==='new')return;
    const it=edit.item;
    await run(async()=>{if(it.period)await setting('habit_period_hidden',true);else await archiveCard(it.card.id);rescheduleAll().catch(()=>[]);},true);
  }
  async function deleteRecord(){
    if(!edit||edit.item==='new')return;
    const {item:it,day}=edit;
    await run(()=>it.period?setPeriodDay(day,false):setHabitDay(it.action,it.card,day,false,hour),true);
  }
  async function reorder(data:Row[],from:number,to:number){
    if(from===to||from<0||to<0||!data[to]?.item)return;
    let slot:TimeOfDay='morning';const moved=data[to]?.item;
    for(let i=0;i<=to;i++)if(!data[i].item)slot=data[i].slot;
    const next=data.flatMap(r=>r.item?[r.item.card.id]:[]);
    setOrder(next);
    await run(async()=>{
      if(moved&&habitSlot(moved.card)!==slot){
        if(moved.period)await setting('habit_period_slot',slot);else await updateCard(moved.card.id,{time_of_day:slot});
      }
      await setting('habit_order_v1',next);
    });
  }
  function open(it:HabitItem,day=date){if(!busy)setEdit({item:it,day});}
  function renderDay({item:r,drag,isActive}:RenderItemParams<Row>){
    if(!r.item)return <Text style={s.group} testID={r.key}>{SLOTS.find(v=>v.key===r.slot)?.label}</Text>;
    const it=r.item,done=checked(it,date),description=note(it,date);
    return <ScaleDecorator><View style={[s.dayRow,isActive&&s.active]} testID={`habit-row-${it.card.id}`}>
      <Check checked={done} disabled={busy||date>today} onPress={()=>toggle(it,date)} onLongPress={()=>open(it)} id={`habit-check-${it.card.id}`} label={it.card.name} emoji={it.card.emoji??'⭐'}/>
      <Pressable style={s.dayContent} testID={`habit-edit-${it.card.id}`} onLongPress={()=>open(it)} delayLongPress={400}>
        <Text style={[s.name,done&&s.nameDone]}>{it.card.name}</Text>
        {description?<Text style={s.description} numberOfLines={3}>{description}</Text>:null}
      </Pressable>
      <Pressable testID={`habit-drag-${it.card.id}`} disabled={busy} onLongPress={drag} delayLongPress={150} accessibilityRole="button" accessibilityLabel={`调整${it.card.name}顺序`} hitSlop={5} style={[s.handle,Platform.OS==='web'&&({touchAction:'none',userSelect:'none'} as any)]}><Text style={s.handleText}>⠿</Text></Pressable>
    </View></ScaleDecorator>;
  }
  const days=weekDays(date),month=date.slice(0,7),calendar=monthDays(month);
  const change=(delta:number)=>{
    if(mode==='month')setSelected(`${shiftMonth(month,delta)}-01`);
    else setSelected(shiftDay(date,delta*(mode==='week'?7:1)));
  };
  const editItem=edit?.item&&edit.item!=='new'?edit.item:null;
  return <SafeAreaView style={s.page} edges={['top']} testID="habits-screen">
    <View style={s.header}><Text style={s.title}>习惯</Text><Pressable testID="habit-create" disabled={busy} onPress={()=>setEdit({item:'new',day:date})} style={s.add}><Text style={s.addText}>＋</Text></Pressable></View>
    <View style={s.toolbar}>{(['day','week','month'] as const).map((v,i)=><Pressable key={v} testID={`habits-${v}`} accessibilityRole="tab" aria-selected={mode===v} onPress={()=>setMode(v)} style={[s.tab,mode===v&&s.tabOn]}><Text style={[s.tabText,mode===v&&s.tabTextOn]}>{['日','周','月'][i]}</Text></Pressable>)}</View>
    <View style={s.navigation}>
      <Pressable testID="habits-prev" onPress={()=>change(-1)} style={s.arrow}><Text style={s.link}>‹</Text></Pressable>
      <Text style={s.date}>{mode==='month'?`${Number(month.slice(0,4))}年${Number(month.slice(5))}月`:mode==='week'?`${days[0].slice(5).replace('-','/')} — ${days[6].slice(5).replace('-','/')}`:`${date.replaceAll('-','/')} ${date===today?'· 今天':''}`}</Text>
      <Pressable testID="habits-next" onPress={()=>change(1)} style={s.arrow}><Text style={s.link}>›</Text></Pressable>
      {date!==today?<Pressable testID="habits-today" onPress={()=>setSelected(null)}><Text style={s.smallLink}>今天</Text></Pressable>:null}
    </View>
    {error?<Text testID="habit-error" style={s.error}>{error}</Text>:null}
    {mode==='day'?<DraggableFlatList
      key={items.map(i=>`${i.card.id}:${habitSlot(i.card)}`).sort().join('|')}
      data={rows} keyExtractor={r=>r.key} renderItem={renderDay} onDragEnd={({data,from,to})=>reorder(data,from,to)}
      containerStyle={s.flex} contentContainerStyle={s.list} activationDistance={8}
      dragItemOverflow={false} autoscrollThreshold={60} windowSize={7}
    />:<ScrollView style={s.flex} contentContainerStyle={s.list}>
      {mode==='week'?<View style={s.weekHeader}><View style={s.weekName}/>{days.map((d,i)=><Pressable key={d} style={s.weekCell} onPress={()=>{setSelected(d);setMode('day');}} testID={`habit-week-date-${d}`}><Text style={s.weekday}>{WEEK[i]}</Text><Text style={[s.weekNumber,d===today&&s.todayText]}>{Number(d.slice(-2))}</Text></Pressable>)}</View>:null}
      {rows.map(r=>{
        if(!r.item)return <Text key={r.key} style={s.group}>{SLOTS.find(v=>v.key===r.slot)?.label}</Text>;
        const it=r.item;
        return mode==='week'?<View key={r.key} style={s.weekRow} testID={`habit-week-row-${it.card.id}`}>
          <Pressable style={s.weekName} onLongPress={()=>open(it)} delayLongPress={400} testID={`habit-edit-${it.card.id}`}><Text style={s.weekHabit}>{it.card.name}</Text></Pressable>
          {days.map(d=><View key={d} style={s.weekCell}><Check compact checked={checked(it,d)} disabled={busy||d>today} onPress={()=>toggle(it,d)} onLongPress={()=>open(it,d)} id={`habit-week-${it.card.id}-${d}`} label={`${it.card.name} ${d}`}/></View>)}
        </View>:<Pressable key={r.key} style={s.monthCard} onLongPress={()=>open(it)} delayLongPress={400} testID={`habit-month-card-${it.card.id}`}>
          <View style={s.cardHead}><Text style={s.name}>{it.card.emoji} {it.card.name}</Text><Text style={s.total}>{calendar.filter(d=>d&&checked(it,d)).length} 天</Text></View>
          <View style={s.calendar}>{WEEK.map(w=><Text key={w} style={s.calendarWeek}>{w}</Text>)}
            {calendar.map((d,i)=>d?<View key={d} style={s.calendarCell}><Check monthDay={Number(d.slice(-2))} checked={checked(it,d)} disabled={busy||d>today} onPress={()=>toggle(it,d)} onLongPress={()=>open(it,d)} id={`habit-month-${it.card.id}-${d}`} label={`${it.card.name} ${d}`} isToday={d===today}/></View>:<View key={`blank-${i}`} style={s.calendarCell}/>)}
          </View>
        </Pressable>;
      })}
    </ScrollView>}
    <HabitEditorModal target={edit?.item??null} day={edit?.day??date} checked={!!editItem&&checked(editItem,edit?.day??date)} note={editItem?note(editItem,edit?.day??date):''}
      onClose={()=>setEdit(null)} onSave={save} onDelete={deleteHabit} onDeleteRecord={deleteRecord}
      onHistory={()=>{setEdit(null);setHistory(editItem);}}/>
    <HabitHistorySheet target={history} cats={cats} dayStartHour={hour} onClose={()=>setHistory(null)}
      onEdit={()=>{const it=history;setHistory(null);if(it)open(it);}}
      onEditEntry={r=>{const it=history;setHistory(null);if(it)open(it,completionDay(r,hour));}}/>
    <CatPickerModal visible={!!picker} cats={cats} title={picker?.item.card.name??''} onCancel={()=>setPicker(null)} onConfirm={ids=>{const p=picker;setPicker(null);if(p)toggle(p.item,p.day,ids);}}/>
  </SafeAreaView>;
}
function Check({checked,disabled,onPress,onLongPress,id,label,emoji,compact,monthDay,isToday}:{checked:boolean;disabled:boolean;onPress:()=>void;onLongPress:()=>void;id:string;label:string;emoji?:string;compact?:boolean;monthDay?:number;isToday?:boolean}){
  const scale=useRef(new Animated.Value(1)).current,last=useRef(checked);
  useEffect(()=>{if(last.current===checked)return;last.current=checked;scale.setValue(checked?0.8:1.12);Animated.spring(scale,{toValue:1,useNativeDriver:true,speed:22,bounciness:8}).start();},[checked,scale]);
  // 未来日期禁用打卡，习惯名称仍可长按编辑。
  return <Pressable disabled={disabled} testID={id} accessibilityRole="checkbox" accessibilityLabel={label} aria-checked={checked} aria-disabled={disabled} accessibilityState={{checked,disabled}}
    onPress={()=>!disabled&&onPress()} onLongPress={onLongPress} delayLongPress={400} style={[s.checkHit,compact&&s.compactHit]}>
    <Animated.View style={[s.circle,compact&&s.compact,monthDay!==undefined&&s.monthCircle,checked&&s.checked,isToday&&!checked&&s.todayCircle,disabled&&!checked&&s.future,{transform:[{scale}]}]}>
      <Text style={[s.checkText,compact&&s.compactText,monthDay!==undefined&&s.monthText,checked&&s.white]}>{monthDay!==undefined?monthDay:checked?'✓':compact?'':emoji}</Text>
    </Animated.View>
  </Pressable>;
}
const s=StyleSheet.create({
  page:{flex:1,backgroundColor:colors.background},flex:{flex:1},header:{paddingHorizontal:20,paddingTop:16,paddingBottom:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},title:{fontSize:25,fontWeight:'700',color:colors.textPrimary},add:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:colors.purpleDark},addText:{fontSize:27,lineHeight:29,color:'#fff'},
  toolbar:{flexDirection:'row',backgroundColor:colors.card,borderRadius:18,padding:4,marginHorizontal:20,gap:4},tab:{flex:1,padding:8,borderRadius:14,alignItems:'center'},tabOn:{backgroundColor:colors.purpleLight},tabText:{fontSize:15,color:colors.textMuted},tabTextOn:{color:colors.purpleDark,fontWeight:'600'},navigation:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12,paddingVertical:12,paddingHorizontal:20},date:{fontSize:15,color:colors.textPrimary},arrow:{paddingHorizontal:12,paddingVertical:4},link:{fontSize:26,color:colors.purpleDark},smallLink:{fontSize:13,color:colors.purpleDark},
  list:{paddingHorizontal:16,paddingBottom:40},group:{fontSize:14,color:colors.textSecondary,fontWeight:'500',paddingTop:18,paddingBottom:10,paddingHorizontal:4},dayRow:{flexDirection:'row',alignItems:'center',backgroundColor:colors.card,borderRadius:radius.widget,paddingVertical:10,paddingHorizontal:12,marginBottom:8,minHeight:72,gap:12},active:{backgroundColor:colors.purpleLight},dayContent:{flex:1,paddingVertical:5,gap:4},name:{fontSize:16,fontWeight:'500',color:colors.textPrimary,lineHeight:23},nameDone:{color:colors.purpleDark},description:{fontSize:13,color:colors.textMuted,lineHeight:19},handle:{paddingVertical:12,paddingHorizontal:5},handleText:{fontSize:22,color:colors.textMuted},
  checkHit:{alignItems:'center',justifyContent:'center',minWidth:40,minHeight:40},circle:{width:44,height:44,borderRadius:22,backgroundColor:colors.purpleLight,alignItems:'center',justifyContent:'center'},checked:{backgroundColor:colors.purpleDark},checkText:{fontSize:24,color:colors.purpleDark},white:{color:'#fff'},compactHit:{minWidth:0,width:'100%',minHeight:40},compact:{width:29,height:29,borderRadius:15},compactText:{fontSize:18},future:{opacity:0.35},
  weekHeader:{flexDirection:'row',paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.purpleLight},weekRow:{flexDirection:'row',alignItems:'center',paddingVertical:12},weekName:{width:'28%',paddingRight:6,justifyContent:'center'},weekCell:{width:'10.2857%',alignItems:'center',justifyContent:'center',gap:5},weekday:{fontSize:11,color:colors.textMuted},weekNumber:{fontSize:16,fontWeight:'600',color:colors.textPrimary},todayText:{color:colors.purpleDark},weekHabit:{fontSize:14,color:colors.textPrimary,lineHeight:21},
  monthCard:{backgroundColor:colors.card,borderRadius:radius.card,padding:16,marginBottom:12,gap:14},cardHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},total:{fontSize:12,color:colors.textMuted},calendar:{flexDirection:'row',flexWrap:'wrap'},calendarWeek:{width:'14.2857%',textAlign:'center',fontSize:12,color:colors.textMuted,paddingBottom:8},calendarCell:{width:'14.2857%',height:40,alignItems:'center',justifyContent:'center'},monthCircle:{width:32,height:32,borderRadius:10},monthText:{fontSize:13},todayCircle:{borderWidth:1,borderColor:colors.purpleDark},error:{fontSize:13,color:colors.redDark,paddingHorizontal:20},
});
