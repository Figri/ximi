import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { FlatList } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { colors, fontSize, lh, radius, spacing } from '../../constants/theme';
import { timeHeaderStyles as h } from '../../constants/timeHeader';
import { WeekDateStrip } from '../timetab/WeekDateStrip';
import { CaptureFab } from '../capture/CaptureFab';
import { FALLBACK_TONE, habitTones, orderHabits, type HabitTone } from '../../lib/habitPresentation';
import { habitSchedule } from '../../lib/habitSchedule';
import { db } from '../../lib/localdb';
import { archiveCard, createCard, updateAction, updateCard } from '../../lib/cards';
import { useCardStore } from '../../lib/store';
import { useDataBus } from '../../lib/dataBus';
import { lingDayKey, useLingSettings } from '../../lib/ling/settings';
import { completionDay, dateOf, dateKey, monthDays, shiftDay, shiftMonth, weekDays } from '../../lib/habitDays';
import { periodOn, setHabitDay, setPeriodDay } from '../../lib/habits';
import { rescheduleAll } from '../../lib/ling/proactive';
import { HabitEditorModal, habitSlot, SLOTS, type HabitDraft, type HabitItem } from './HabitEditorModal';
import { HabitHistorySheet } from '../today/HabitHistorySheet';
import { CatPickerModal } from '../common/CatPickerModal';
import type { Card, Completion, TimeOfDay } from '../../types';

type Row = { key: string; slot: TimeOfDay; item?: HabitItem };
const PERIOD_ID='__period__';
const WEEK=['一','二','三','四','五','六','日'];
const WEEK_EN=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
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
  const [ready,setReady]=useState(false),[legacyOrder,setLegacyOrder]=useState<string[]>([]);
  const [tones,setTones]=useState<Record<string,HabitTone>>({});
  const reorderQueue=useRef<Promise<void>>(Promise.resolve()),pendingReorders=useRef(0),reorderRevision=useRef(0);
  const listRef=useRef<FlatList<Row>>(null),scrollOffset=useRef(0);

  const [edit,setEdit]=useState<{item:HabitItem|'new';day:string}|null>(null);
  const [history,setHistory]=useState<HabitItem|null>(null);
  const [picker,setPicker]=useState<{item:HabitItem;day:string}|null>(null);
  useEffect(()=>{loadSettings();const t=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(t);},[loadSettings]);
  const load=useCallback(async()=>{
    const revision=reorderRevision.current;
    const [r,p,o,allCards]=await Promise.all([
      db.from('completions').select('*').eq('undone',false),
      db.from('body_records').select('*').in('kind',['period','period_day']),
      db.from('settings').select('*').in('key',['habit_order_v1','habit_order_v2','habit_order_v3','habit_period_slot','habit_period_hidden']),
      db.from('cards').select('id,created_at'),
    ]);
    if(r.error||p.error||o.error||allCards.error)throw new Error(r.error?.message||p.error?.message||o.error?.message||allCards.error?.message);
    setRecords(r.data??[]);setPeriods(p.data??[]);
    const values=Object.fromEntries((o.data??[]).map((v:any)=>[v.key,v.value]));
    if(!pendingReorders.current&&revision===reorderRevision.current){
      setOrder(Array.isArray(values.habit_order_v3)?values.habit_order_v3:[]);
      setLegacyOrder(Array.isArray(values.habit_order_v2)?values.habit_order_v2:Array.isArray(values.habit_order_v1)?values.habit_order_v1:[]);
      setPeriodSlot(['morning','day','evening'].includes(values.habit_period_slot)?values.habit_period_slot:'evening');
    }
    setTones(habitTones(allCards.data??[]));
    setPeriodHidden(values.habit_period_hidden===true);
  },[]);
  useFocusEffect(useCallback(()=>{let active=true;setNow(new Date());reorderQueue.current.then(()=>Promise.all([fetchAll(),load()])).then(()=>{if(active)setReady(true);}).catch(e=>setError(e.message));return()=>{active=false;};},[load,fetchAll]));
  useEffect(()=>{load().catch(e=>setError(e.message));},[load,version]);
  const items=useMemo(()=>{
    const all:HabitItem[]=cards.filter(c=>!c.archived&&c.display_type==='habit').flatMap(card=>{
      const action=actions.find(a=>a.card_id===card.id&&a.is_primary);return action?[{card,action}]:[];
    });
    if(!periodHidden)all.push({period:true,card:{id:PERIOD_ID,name:'生理期',emoji:'🌸',time_of_day:periodSlot} as Card,action:{id:PERIOD_ID} as HabitItem['action']});
    return orderHabits(all,order,legacyOrder);
  },[cards,actions,periodSlot,periodHidden,order,legacyOrder]);
  // 每个动作/日期只取一条，兼容旧库中同一天曾重复打卡的记录。
  const byDay=useMemo(()=>{
    const m=new Map<string,Completion>();
    for(const r of records)m.set(`${r.action_id}:${completionDay(r,hour)}`,r);
    return m;
  },[records,hour]);
  const entry=(it:HabitItem,day:string)=>byDay.get(`${it.action.id}:${day}`);
  const checked=(it:HabitItem,day:string)=>it.period?periodOn(day,periods):!!entry(it,day);
  const note=(it:HabitItem,day:string)=>it.period?periods.find(r=>r.kind==='period_day'&&r.date===day)?.note??'':entry(it,day)?entry(it,day)?.notes??'':it.card.notes??'';
  const scheduled=useMemo(()=>habitSchedule(records,hour),[records,hour]);
  const due=(it:HabitItem,day:string)=>it.period||scheduled(it,day);
  const dayItems=items.filter(it=>due(it,date));
  const rows:Row[]=dayItems.map(item=>({key:item.card.id,slot:habitSlot(item.card),item}));
  const countOn=(day:string)=>{const planned=items.filter(it=>due(it,day));return `${planned.filter(it=>checked(it,day)).length}/${planned.length}`;};
  async function run(fn:()=>Promise<void>,propagate=false){
    if(working.current){if(propagate)throw new Error('正在保存，请稍后');return;}
    working.current=true;setBusy(true);setError('');
    try{await reorderQueue.current;await fn();await load();await fetchAll();useDataBus.getState().bump();}
    catch(e){await load().catch(()=>{});await fetchAll().catch(()=>{});setError(e instanceof Error?e.message:String(e));if(propagate)throw e;}
    finally{working.current=false;setBusy(false);}
  }
  async function setting(key:string,value:unknown){const {error}=await db.from('settings').upsert({key,value},{onConflict:'key'});if(error)throw new Error(error.message);}
  function toggle(it:HabitItem,day:string,selectedCats?:string[]){
    if(day>today||working.current||!due(it,day))return;
    if(!checked(it,day)&&it.action.requires_selection&&cats.length&&!selectedCats){setPicker({item:it,day});return;}
    run(()=>it.period?setPeriodDay(day,!checked(it,day)):setHabitDay(it.action,it.card,day,!checked(it,day),hour,{selectedCats,notes:!checked(it,day)?it.card.notes??undefined:undefined}));
  }
  async function save(d:HabitDraft){
    const target=edit;if(!target)return;
    await run(async()=>{
      if(target.item!=='new'&&target.item.period){
        if(target.day>today&&d.note.trim())throw new Error('未来日期暂不能保存生理期记录');
        await setting('habit_period_slot',d.slot);
        if(target.day<=today)await setPeriodDay(target.day,checked(target.item,target.day),d.note);
        return;
      }
      const days=d.frequency==='daily'?1:d.days;
      const frequency={frequency_type:d.frequency==='daily'?'interval' as const:d.frequency,
        interval_days:d.frequency==='fixed_day'||d.frequency==='manual'?null:days,
        suggested_interval:d.frequency==='fixed_day'||d.frequency==='manual'?null:days,
        max_delay:d.frequency==='fixed_day'||d.frequency==='manual'?null:Math.ceil(days*1.5),
        fixed_days:d.frequency==='fixed_day'?d.weekdays:null,requires_selection:d.selection,remind_at:d.remindAt};
      if(target.item==='new'){
        await createCard({name:d.name,type:'habit',display_type:'habit',tags:[],notes:d.note||null,emoji:d.emoji,time_of_day:d.slot},[{name:'完成',is_primary:true,...frequency}]);
      }else{
        const it=target.item;
        await updateCard(it.card.id,{name:d.name,emoji:d.emoji,time_of_day:d.slot,...(!checked(it,target.day)?{notes:d.note||null}:{})});
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
    const offset=scrollOffset.current;
    const visible=data.flatMap(r=>r.item?[r.item.card.id]:[]),ids=new Set(visible);
    let at=0;const next=items.map(it=>ids.has(it.card.id)?visible[at++]:it.card.id);
    const revision=++reorderRevision.current;
    pendingReorders.current++;
    setOrder(next);setError('');
    requestAnimationFrame(()=>requestAnimationFrame(()=>listRef.current?.scrollToOffset({offset,animated:false})));
    // 原列表原地更新；保存串行进行，不置忙、不重读整页、不重建列表。
    reorderQueue.current=reorderQueue.current.catch(()=>{}).then(async()=>{
      await setting('habit_order_v3',next);
    }).catch(async e=>{
      setError(`顺序未保存：${e instanceof Error?e.message:String(e)}`);
      if(revision===reorderRevision.current&&pendingReorders.current===1){
        pendingReorders.current=0;await load().catch(()=>{});await fetchAll();
      }
    }).finally(()=>{pendingReorders.current=Math.max(0,pendingReorders.current-1);});
    await reorderQueue.current;
  }
  function open(it:HabitItem,day=date){if(!busy)setEdit({item:it,day});}
  function renderDay({item:r,drag,isActive}:RenderItemParams<Row>){
    if(!r.item)return <Text style={s.group} testID={r.key}>{SLOTS.find(v=>v.key===r.slot)?.label}</Text>;
    const it=r.item,done=checked(it,date),description=note(it,date);
    return <ScaleDecorator><View style={[s.dayRow,{borderLeftColor:(tones[it.card.id]??FALLBACK_TONE).solid},isActive&&s.active]} testID={`habit-row-${it.card.id}`}>
      <Check tone={tones[it.card.id]??FALLBACK_TONE} checked={done} disabled={busy||date>today} onPress={()=>toggle(it,date)} onLongPress={()=>open(it)} id={`habit-check-${it.card.id}`} label={it.card.name} emoji={it.card.emoji??'⭐'}/>
      <Pressable style={s.dayContent} testID={`habit-edit-${it.card.id}`} onLongPress={()=>open(it)} delayLongPress={400}>
        <View style={s.nameRow}><Text style={[s.name,s.grow,done&&s.nameDone]}>{it.card.name}</Text><Text style={s.slotBadge}>{SLOTS.find(t=>t.key===habitSlot(it.card))?.label}</Text></View>
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
    <View style={h.switchRow}><View style={h.switchBox}>{(['day','week','month'] as const).map((v,i)=><Pressable key={v} testID={`habits-${v}`} accessibilityRole="tab" aria-selected={mode===v} onPress={()=>setMode(v)} style={[h.switchItem,mode===v&&h.switchItemOn]}><Text style={[h.switchText,mode===v&&h.switchTextOn]}>{['日','周','月'][i]}</Text></Pressable>)}</View></View>
    <View style={h.headerRow} testID="habits-header">
      <View style={[h.dateBox,{gap:6}]}>
        {mode!=='day'?<Pressable testID="habits-prev" onPress={()=>change(-1)} hitSlop={6}><Text style={s.smallArrow}>‹</Text></Pressable>:null}
        <Text style={[h.dateText,mode!=='day'&&{fontSize:fontSize.pageTitle}]}>{mode==='month'?`${Number(month.slice(0,4))}年${Number(month.slice(5))}月`:`${Number(date.slice(5,7))}月${Number(date.slice(-2))}日`}</Text>
        {mode!=='day'?<Pressable testID="habits-next" onPress={()=>change(1)} hitSlop={6}><Text style={s.smallArrow}>›</Text></Pressable>:null}
        <Pressable style={h.todayButton} testID="habits-today" onPress={()=>setSelected(null)}><Text style={h.todayButtonText}>今</Text></Pressable>
      </View>

    </View>
    {mode==='day'?<WeekDateStrip date={dateOf(date)} today={dateOf(today)} hideDateRow onDateChange={d=>setSelected(dateKey(d))} testIDPrefix="habit-day-date" refreshKey={version+records.length+items.length+periods.length} fetchCounts={async dates=>Object.fromEntries(dates.map(d=>[dateKey(d),countOn(dateKey(d))]))}/>:null}
    {error?<Text testID="habit-error" style={s.error}>{error}</Text>:null}
    {mode==='day'?(ready?<DraggableFlatList
      ref={listRef} testID="habit-day-list" onScrollOffsetChange={offset=>{scrollOffset.current=offset;}}
      data={rows} keyExtractor={r=>r.key} renderItem={renderDay} onDragEnd={({data,from,to})=>reorder(data,from,to)}
      containerStyle={[s.flex,Platform.OS==='web'&&({overflowAnchor:'none'} as any)]} style={Platform.OS==='web'?({overflowAnchor:'none'} as any):undefined} contentContainerStyle={s.list} activationDistance={8}
      dragItemOverflow={false} autoscrollThreshold={60} windowSize={7}
    />:<View style={s.flex}/>):<ScrollView testID="habit-overview-list" style={s.flex} contentContainerStyle={s.list}>
      {mode==='week'?<View style={s.weekHeader}><View style={s.weekName}/>{days.map((d,i)=><Pressable key={d} style={s.weekCell} onPress={()=>setSelected(d)} testID={`habit-week-date-${d}`}><Text style={s.weekday}>{WEEK_EN[i]}</Text><View style={[s.weekDateCircle,d===date&&s.weekDateSelected]}><Text style={[s.weekNumber,d===date&&s.white]}>{Number(d.slice(-2))}</Text></View><Text testID={`habit-week-count-${d}`} style={s.weekCount}>{countOn(d)}</Text></Pressable>)}</View>:null}
      {items.map(it=>{
        return mode==='week'?<View key={it.card.id} style={s.weekRow} testID={`habit-week-row-${it.card.id}`}>
          <Pressable style={s.weekName} onLongPress={()=>open(it)} delayLongPress={400} testID={`habit-edit-${it.card.id}`}><Text style={[s.weekHabit,{color:(tones[it.card.id]??FALLBACK_TONE).solid}]}>{it.card.name}</Text></Pressable>
          {days.map(d=><View key={d} style={s.weekCell}><Check tone={tones[it.card.id]??FALLBACK_TONE} compact checked={checked(it,d)} disabled={busy||d>today||!due(it,d)} onPress={()=>toggle(it,d)} onLongPress={()=>open(it,d)} id={`habit-week-${it.card.id}-${d}`} label={`${it.card.name} ${d}`}/></View>)}
        </View>:<Pressable key={it.card.id} style={[s.monthCard,{borderTopColor:(tones[it.card.id]??FALLBACK_TONE).solid}]} onLongPress={()=>open(it)} delayLongPress={400} testID={`habit-month-card-${it.card.id}`}>
          <View style={s.cardHead}><Text style={[s.name,{color:(tones[it.card.id]??FALLBACK_TONE).solid}]}>{it.card.emoji} {it.card.name}</Text><Text style={s.total}>{calendar.filter(d=>d&&checked(it,d)).length} 天</Text></View>
          <View style={s.calendar}>{WEEK.map(w=><Text key={w} style={s.calendarWeek}>{w}</Text>)}
            {calendar.map((d,i)=>d?<View key={d} style={s.calendarCell}><Check tone={tones[it.card.id]??FALLBACK_TONE} monthDay={Number(d.slice(-2))} checked={checked(it,d)} disabled={busy||d>today||!due(it,d)} onPress={()=>toggle(it,d)} onLongPress={()=>open(it,d)} id={`habit-month-${it.card.id}-${d}`} label={`${it.card.name} ${d}`} isToday={d===today}/></View>:<View key={`blank-${i}`} style={s.calendarCell}/>)}
          </View>
        </Pressable>;
      })}
    </ScrollView>}
    <CaptureFab testID="habit-create" onPress={()=>{if(!busy)setEdit({item:'new',day:date});}}/>
    <HabitEditorModal target={edit?.item??null} day={edit?.day??date} checked={!!editItem&&checked(editItem,edit?.day??date)} note={editItem?note(editItem,edit?.day??date):''}
      onClose={()=>setEdit(null)} onSave={save} onDelete={deleteHabit} onDeleteRecord={deleteRecord}
      onHistory={()=>{setEdit(null);setHistory(editItem);}}/>
    <HabitHistorySheet target={history} cats={cats} dayStartHour={hour} onClose={()=>setHistory(null)}
      onEdit={()=>{const it=history;setHistory(null);if(it)open(it);}}
      onEditEntry={r=>{const it=history;setHistory(null);if(it)open(it,completionDay(r,hour));}}/>

    <CatPickerModal visible={!!picker} cats={cats} title={picker?.item.card.name??''} onCancel={()=>setPicker(null)} onConfirm={ids=>{const p=picker;setPicker(null);if(p)toggle(p.item,p.day,ids);}}/>
  </SafeAreaView>;
}
function Check({tone,checked,disabled,onPress,onLongPress,id,label,emoji,compact,monthDay,isToday}:{tone:HabitTone;checked:boolean;disabled:boolean;onPress:()=>void;onLongPress:()=>void;id:string;label:string;emoji?:string;compact?:boolean;monthDay?:number;isToday?:boolean}){
  const scale=useRef(new Animated.Value(1)).current,last=useRef(checked);
  useEffect(()=>{if(last.current===checked)return;last.current=checked;scale.setValue(checked?0.8:1.12);Animated.spring(scale,{toValue:1,useNativeDriver:true,speed:22,bounciness:8}).start();},[checked,scale]);
  // 未来日期禁用打卡，习惯名称仍可长按编辑。
  return <Pressable disabled={disabled} testID={id} accessibilityRole="checkbox" accessibilityLabel={label} aria-checked={checked} aria-disabled={disabled} accessibilityState={{checked,disabled}}
    onPress={()=>!disabled&&onPress()} onLongPress={onLongPress} delayLongPress={400} style={[s.checkHit,compact&&s.compactHit,monthDay!==undefined&&s.monthHit]}>
    <Animated.View style={[s.circle,compact&&s.compact,monthDay!==undefined&&s.monthCircle,{backgroundColor:checked?tone.solid:tone.wash,borderColor:checked?tone.solid:tone.border},isToday&&!checked&&{borderColor:tone.solid,borderWidth:2},disabled&&!checked&&s.future,{transform:[{scale}]}]}>
      <Text style={[s.checkText,{color:tone.solid},compact&&s.compactText,monthDay!==undefined&&s.monthText,checked&&s.white]}>{monthDay!==undefined?monthDay:checked?'✓':compact?'':emoji}</Text>
    </Animated.View>
  </Pressable>;
}
const s=StyleSheet.create({
  page:{flex:1,backgroundColor:colors.background},flex:{flex:1},smallArrow:{fontSize:22,color:colors.textMuted},
  list:{paddingHorizontal:spacing.lg,paddingBottom:100},group:{fontSize:fontSize.secondary,color:colors.textSecondary,fontWeight:'600',paddingTop:12,paddingBottom:8,paddingHorizontal:2},
  dayRow:{flexDirection:'row',alignItems:'center',backgroundColor:colors.card,borderRadius:radius.widget,borderLeftWidth:3,paddingVertical:7,paddingHorizontal:10,marginBottom:6,minHeight:58,gap:10},active:{backgroundColor:'#F0EDF5'},dayContent:{flex:1,paddingVertical:3,gap:3},nameRow:{flexDirection:'row',alignItems:'center',gap:8},grow:{flex:1},slotBadge:{fontSize:fontSize.tiny,color:colors.textSecondary,backgroundColor:colors.background,borderRadius:6,paddingHorizontal:6,paddingVertical:3},name:{fontSize:fontSize.body,fontWeight:'500',color:colors.textPrimary,lineHeight:lh(22)},nameDone:{color:colors.textSecondary},description:{fontSize:fontSize.secondary,color:colors.textSecondary,lineHeight:lh(19)},handle:{paddingVertical:10,paddingHorizontal:6},handleText:{fontSize:20,color:colors.textMuted},
  checkHit:{alignItems:'center',justifyContent:'center',minWidth:40,minHeight:40},circle:{width:36,height:36,borderRadius:18,borderWidth:1,alignItems:'center',justifyContent:'center'},checkText:{fontSize:20},white:{color:'#fff'},compactHit:{minWidth:0,width:'100%',minHeight:36},compact:{width:28,height:28,borderRadius:14},compactText:{fontSize:17},future:{opacity:0.55},
  weekDateCircle:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center'},weekDateSelected:{backgroundColor:colors.purpleDark},weekCount:{fontSize:fontSize.tiny,color:colors.blueDark},
  weekHeader:{flexDirection:'row',paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.purpleLight},weekRow:{flexDirection:'row',alignItems:'center',paddingVertical:10},weekName:{width:'28%',paddingRight:6,justifyContent:'center'},weekCell:{width:'10.2857%',alignItems:'center',justifyContent:'center',gap:5},weekday:{fontSize:11,color:colors.textSecondary},weekNumber:{fontSize:16,fontWeight:'600',color:colors.textPrimary},weekHabit:{fontSize:fontSize.body,lineHeight:lh(21)},
  monthCard:{backgroundColor:colors.card,borderRadius:radius.card,borderTopWidth:3,padding:12,marginBottom:10,gap:10},cardHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},total:{fontSize:fontSize.secondary,color:colors.textSecondary},calendar:{flexDirection:'row',flexWrap:'wrap'},calendarWeek:{width:'14.2857%',textAlign:'center',fontSize:11,color:colors.textSecondary,paddingBottom:6},calendarCell:{width:'14.2857%',height:34,alignItems:'center',justifyContent:'center'},monthHit:{minWidth:0,minHeight:34,height:34,width:'100%'},monthCircle:{width:28,height:28,borderRadius:8},monthText:{fontSize:12},error:{fontSize:fontSize.secondary,color:colors.redDark,paddingHorizontal:spacing.lg},
});
