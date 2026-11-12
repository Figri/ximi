import type { Action, Card } from '../types';
type Habit = {card:Card;action:Action;period?:boolean};
export function habitSlotKey(card:Card):string{return card.time_of_day==='day'||card.time_of_day==='evening'?card.time_of_day:'morning';}
export function weeklyFrequency(it:Habit):number{
  if(it.period)return -1;
  if(it.action.frequency_type==='manual')return 0;
  if(it.action.frequency_type==='fixed_day'&&it.action.fixed_days?.length)return new Set(it.action.fixed_days).size;
  return 7/Math.max(1,it.action.suggested_interval??it.action.interval_days??1);
}
/** 三种视图使用同一份列表：默认高频在前；用户手动调整后保留其顺序。 */
export function orderHabits<T extends Habit>(items:T[],manual:string[],legacy:string[]=[]):T[]{
  const rank=(id:string)=>legacy.includes(id)?legacy.indexOf(id):100000;
  const frequency=(a:T,b:T)=>weeklyFrequency(b)-weeklyFrequency(a)||rank(a.card.id)-rank(b.card.id);
  if(!manual.length)return [...items].sort(frequency);
  const known=items.filter(i=>manual.includes(i.card.id)).sort((a,b)=>manual.indexOf(a.card.id)-manual.indexOf(b.card.id));
  for(const it of items.filter(i=>!manual.includes(i.card.id)).sort(frequency)){
    const at=known.findIndex(k=>weeklyFrequency(k)<weeklyFrequency(it));
    known.splice(at<0?known.length:at,0,it);
  }
  return known;
}
const PALETTE=['#287C75','#B15946','#416AA5','#86567F','#747236','#A3632E','#48744D','#62569D','#37758F','#875C42','#596D83','#9C4961'];
export type HabitTone={solid:string;wash:string;border:string};
export function habitTones(cards:Pick<Card,'id'|'created_at'>[]):Record<string,HabitTone>{
  const result:Record<string,HabitTone>={};
  [...cards].sort((a,b)=>(a.created_at??'').localeCompare(b.created_at??'')||a.id.localeCompare(b.id)).forEach((c,i)=>{
    const hue=Math.round((i*137.508)%360);
    const solid=PALETTE[i]??`hsl(${hue}, 46%, 36%)`;
    result[c.id]={solid,wash:i<PALETTE.length?`${solid}15`:`hsla(${hue}, 46%, 36%, 0.08)`,border:i<PALETTE.length?`${solid}80`:`hsla(${hue}, 46%, 36%, 0.5)`};
  });
  result.__period__={solid:'#A54B65',wash:'#A54B6515',border:'#A54B6580'};
  return result;
}
export const FALLBACK_TONE:HabitTone={solid:PALETTE[0],wash:'#287C7515',border:'#287C7580'};
