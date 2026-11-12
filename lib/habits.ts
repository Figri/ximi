import { db, uuid } from './localdb';
import { completionDay, dateKey, dateOf } from './habitDays';
import type { Action, Card, Completion } from '../types';

const chains = new Map<string,Promise<unknown>>();
function serial<T>(key: string, job: ()=>Promise<T>): Promise<T> {
  const pending = (chains.get(key) ?? Promise.resolve()).catch(()=>{}).then(job);
  chains.set(key,pending);
  return pending.finally(()=>{ if(chains.get(key)===pending) chains.delete(key); });
}
/** Keeps legacy rows. Cancelling only marks this day's records undone. */
export function setHabitDay(action: Action, card: Card, day: string, checked: boolean, hour=5, options?: { notes?: string; selectedCats?: string[] }): Promise<void> {
  return serial(`${action.id}:${day}`,async()=>{
    dateOf(day);
    const now = new Date(); const today = new Date(now); today.setHours(today.getHours()-hour);
    if(day>dateKey(today)) throw new Error('还没到这一天，到了再记');
    const {data,error}=await db.from('completions').select('*').eq('action_id',action.id).eq('undone',false);
    if(error) throw new Error(error.message);
    const rows=(data??[] as Completion[]).filter((r:Completion)=>completionDay(r,hour)===day) as Completion[];
    if(!checked){
      if(rows.length){
        const batches=rows.map(r=>r.habit_batch_id).filter(Boolean);
        const primary=await db.from('completions').update({undone:true}).in('id',rows.map(r=>r.id));
        if(primary.error)throw new Error(primary.error.message);
        if(batches.length){const linked=await db.from('completions').update({undone:true}).in('habit_batch_id',batches);if(linked.error)throw new Error(linked.error.message);}
      }
      return;
    }
    if(rows.length){
      if(options?.notes!==undefined){const result=await db.from('completions').update({notes:options.notes.trim()||null}).in('id',rows.map(r=>r.id));if(result.error)throw new Error(result.error.message);}
      return;
    }
    const targets=[action.id,...(action.linked_action_ids??[])];
    const linked=await db.from('actions').select('id,card_id').in('id',targets);
    if(linked.error)throw new Error(linked.error.message);
    const batch=uuid();
    const backfilled=day!==dateKey(today);
    const result=await db.from('completions').insert(targets.map(id=>({
      action_id:id,card_id:id===action.id?card.id:(linked.data??[]).find((a:any)=>a.id===id)?.card_id,
      completed_at:(backfilled?dateOf(day):now).toISOString(),recorded_at:now.toISOString(),record_date:day,backfilled,habit_batch_id:batch,
      notes:options?.notes?.trim()||null,selected_cats:options?.selectedCats??null,undone:false,
    })));
    if(result.error)throw new Error(result.error.message);
  });
}
export async function setHabitNote(id:string,notes:string):Promise<void>{
  const {error}=await db.from('completions').update({notes:notes.trim()||null}).eq('id',id);
  if(error)throw new Error(error.message);
}
export function setPeriodDay(day:string,checked:boolean,note?:string):Promise<void>{
  return serial(`period:${day}`,async()=>{
    dateOf(day);
    if(day>dateKey(new Date()))throw new Error('还没到这一天，到了再记');
    const id=`period-day:${day}`;
    const {data:old}=await db.from('body_records').select('*').eq('id',id).maybeSingle();
    const {error}=await db.from('body_records').upsert({id,kind:'period_day',date:day,end_date:day,value:null,checked,note:note===undefined?(old?.note??null):note.trim()||null,created_at:old?.created_at??new Date().toISOString()});
    if(error)throw new Error(error.message);
  });
}
export function periodOn(day:string,rows:any[]):boolean{
  const explicit=rows.find(r=>r.kind==='period_day'&&r.date===day);
  if(explicit)return !!explicit.checked;
  return rows.some(r=>r.kind==='period'&&r.date<=day&&(r.end_date?day<=r.end_date:day<=shiftEnd(r.date)));
}
function shiftEnd(day:string):string{const d=dateOf(day);d.setDate(d.getDate()+13);return dateKey(d);}
