process.env.TZ='Asia/Shanghai';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),root=resolve(dirname(new URL(import.meta.url).pathname),'..');
const memory=new Map(),cache=new Map();
const storage={getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>{memory.set(k,v);},getMany:async ks=>Object.fromEntries(ks.map(k=>[k,memory.get(k)??null])),setMany:async entries=>{Object.entries(entries).forEach(([k,v])=>memory.set(k,v));},removeMany:async ks=>{ks.forEach(k=>memory.delete(k));}};
function load(path){
 const abs=resolve(root,path);if(cache.has(abs))return cache.get(abs).exports;
 const module={exports:{}};cache.set(abs,module);
 const code=ts.transpileModule(readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>name==='@react-native-async-storage/async-storage'?{__esModule:true,default:storage}:name.startsWith('.')?load(resolve(dirname(abs),name+'.ts')):require(name),module,module.exports);return module.exports;
}
const {db,readTable,resetLocalDbCache}=load('lib/localdb.ts');
const D=load('lib/habitDays.ts'),H=load('lib/habits.ts');
const now=new Date(),business=new Date(now);business.setHours(business.getHours()-5);
const today=D.dateKey(business),yesterday=D.shiftDay(today,-1);
const action={id:'a',card_id:'c',linked_action_ids:['b']},card={id:'c'};
await db.from('actions').insert([{id:'a',card_id:'c'},{id:'b',card_id:'linked'}]);
await db.from('completions').insert({id:'old',action_id:'a',card_id:'c',completed_at:D.dateOf(yesterday).toISOString(),notes:'旧记录',undone:false});
await H.setHabitDay(action,card,today,true,5,{selectedCats:['cat']});
await H.setHabitDay(action,card,today,false);
assert.equal((await readTable('completions')).find(r=>r.id==='old').undone,false);
assert.ok((await readTable('completions')).filter(r=>r.record_date===today).every(r=>r.undone));
console.log('✓ 当天勾选/取消保留旧日记录，联动仅撤销同批');
await Promise.all(Array.from({length:10},()=>H.setHabitDay(action,card,today,true)));
let rows=(await readTable('completions')).filter(r=>r.action_id==='a'&&!r.undone&&D.completionDay(r)===today);
assert.equal(rows.length,1);
console.log('✓ 快速并发勾选不会重复创建当天记录');
const note='第一行\n第二行\n'+ '完整描述。'.repeat(1000);
await H.setHabitNote(rows[0].id,note);
resetLocalDbCache();
assert.equal((await readTable('completions')).find(r=>r.id===rows[0].id).notes,note);
console.log('✓ 长描述多行原样保存，重新读取仍在');
await H.setHabitDay(action,card,D.shiftDay(today,-8),true,5,{notes:'补打卡'});
rows=(await readTable('completions')).filter(r=>r.action_id==='a'&&!r.undone);
const back=rows.find(r=>r.record_date===D.shiftDay(today,-8));
assert.equal(back.backfilled,true);assert.ok(back.recorded_at);assert.equal(D.completionDay(back),D.shiftDay(today,-8));
assert.equal(rows.filter(r=>D.completionDay(r)===today).length,1);
console.log('✓ 补记按所选日期归档，另存实际补记时间，不改变今天完成状态');
await assert.rejects(H.setHabitDay(action,card,D.shiftDay(today,1),true),/还没到/);
await assert.rejects(H.setHabitDay(action,card,'2026-02-30',true),/日期无效/);
assert.equal(D.completionDay({completed_at:'2026-11-12T03:00:00+08:00'}),'2026-11-11');
assert.equal(D.monthDays('2028-02').filter(Boolean).length,29);assert.equal(D.shiftMonth('2026-12',1),'2027-01');
console.log('✓ 凌晨日界、闰年、跨月和未来日期边界');
const original={id:'old-period',kind:'period',date:yesterday,end_date:today,created_at:now.toISOString()};
await db.from('body_records').insert(original);
assert.equal(H.periodOn(today,await readTable('body_records')),true);
await H.setPeriodDay(today,false);
assert.equal(H.periodOn(today,await readTable('body_records')),false);
assert.equal(H.periodOn(yesterday,await readTable('body_records')),true);
await H.setPeriodDay(today,true,'今天的描述');
const bodies=await readTable('body_records');
assert.deepEqual(bodies.find(r=>r.id==='old-period'),original);
assert.equal(bodies.filter(r=>r.kind==='period_day').length,1);
assert.equal(bodies.find(r=>r.kind==='period_day').note,'今天的描述');
console.log('✓ 生理期直接勾选、取消和描述保存，原有周期记录不被改写');

assert.deepEqual(D.weekDays('2026-01-01'), ['2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-03','2026-01-04']);
assert.equal(D.weekDays('2026-11-15')[0], '2026-11-09');
console.log('✓ 周视图周一开始，周日与跨年仍连续七天');

const schedule=load('lib/habitSchedule.ts').habitSchedule;
const habit={card:{id:'weekly',created_at:'2026-11-12T08:00:00Z'},action:{id:'weekly',frequency_type:'fixed_day',fixed_days:[7]}};
assert.equal(schedule([])(habit,'2026-11-12'),false);
assert.equal(schedule([])(habit,'2026-11-15'),true);
assert.equal(schedule([])(habit,'2026-11-08'),true); // 仍支持补过去的打卡
const legacyDone={action_id:'weekly',record_date:'2026-11-12',completed_at:'2026-11-12T08:00:00Z',undone:false};
assert.equal(schedule([legacyDone])(habit,'2026-11-12'),true);
assert.equal(schedule([{...legacyDone,undone:true}])(habit,'2026-11-12'),false);
const interval={card:{id:'gap'},action:{id:'gap',frequency_type:'interval',suggested_interval:3}};
const done=[{action_id:'gap',completed_at:'2026-11-11T02:00:00+08:00',undone:false}]; // 凌晨归到10日
assert.equal(schedule(done)(interval,'2026-11-12'),false);
assert.equal(schedule(done)(interval,'2026-11-13'),true);
assert.equal(schedule(done)(interval,'2026-11-10'),true);
assert.equal(schedule([...done,{action_id:'gap',record_date:'2026-11-20',completed_at:'2026-11-20T08:00:00Z',undone:false}])(interval,'2026-11-13'),true);
assert.equal(schedule([])(interval,'2026-11-12'),true);
assert.equal(schedule([])({...habit,action:{id:'manual',frequency_type:'manual'}},'2026-11-12'),true);
console.log('✓ 当天安排：仅周日、间隔周期、凌晨日界、补记、改周期后旧完成和撤销、未来完成不影响过去');

const P=load('lib/habitPresentation.ts');
const presentationItems=[
 {card:{id:'weekly',time_of_day:'morning'},action:{frequency_type:'fixed_day',fixed_days:[7]}},
 {card:{id:'daily',time_of_day:'morning'},action:{frequency_type:'interval',interval_days:1}},
 {card:{id:'twice',time_of_day:'morning'},action:{frequency_type:'fixed_day',fixed_days:[1,5]}},
 {card:{id:'afternoon',time_of_day:'day'},action:{frequency_type:'interval',interval_days:1}},
];
assert.deepEqual(P.orderHabits(presentationItems,[]).map(i=>i.card.id),['daily','afternoon','twice','weekly']);
assert.deepEqual(P.orderHabits(presentationItems,['weekly','daily','twice','afternoon']).map(i=>i.card.id),['weekly','daily','twice','afternoon']);
assert.deepEqual(presentationItems.map(i=>i.card.id),['weekly','daily','twice','afternoon']);
const colorCards=Array.from({length:24},(_,i)=>({id:`color-${i}`,created_at:`2026-11-${String(i+1).padStart(2,'0')}T08:00:00Z`}));
const tones=P.habitTones(colorCards),reverse=P.habitTones([...colorCards].reverse());
assert.equal(new Set(Object.values(tones).map(t=>t.solid)).size,25);
for(const c of colorCards)assert.deepEqual(tones[c.id],reverse[c.id]);
const expanded=P.habitTones([...colorCards,{id:'new',created_at:'2026-12-01T08:00:00Z'}]);
for(const c of colorCards)assert.deepEqual(tones[c.id],expanded[c.id]);
function contrastWhite(hex){const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return 1.05/(0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2]+0.05);}
for(const t of Object.values(tones).filter(t=>t.solid.startsWith('#')))assert.ok(contrastWhite(t.solid)>=4.5,t.solid);
console.log('✓ 三视图共用频率默认顺序与手动排序，24种习惯颜色不重复且稳定，勾选白字对比度合格');
