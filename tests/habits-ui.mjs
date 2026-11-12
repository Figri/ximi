import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdtempSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const root=resolve('dist'),shots=mkdtempSync(resolve(tmpdir(),'ximi-habits-ui-'));
const server=createServer((req,res)=>{let f=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+'/')||!existsSync(f)||!extname(f))f=resolve(root,'index.html');res.setHeader('Content-Type',extname(f)==='.js'?'text/javascript':extname(f)==='.html'?'text/html':'application/octet-stream');res.end(readFileSync(f));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let page;
try{
 page=await browser.newPage({viewport:{width:412,height:915},timezoneId:'Asia/Shanghai'});
 await page.clock.install({time:new Date('2026-11-12T12:00:00+08:00')});
 const cards=['洗漱','八段锦'].map((name,i)=>({id:`c${i+1}`,name,type:'habit',display_type:'habit',tags:['生活'],emoji:i?'🌿':'🫧',archived:false,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}));
 const actions=cards.map((c,i)=>({id:`a${i+1}`,card_id:c.id,name:'完成',is_primary:true,frequency_type:i?'fixed_day':'interval',interval_days:1,suggested_interval:1,fixed_days:i?[1,3,5]:null,requires_selection:false,linked_action_ids:null}));
 const completions=[{id:'legacy',card_id:'c1',action_id:'a1',completed_at:'2026-11-11T10:00:00+08:00',notes:'旧记录',undone:false}];
 const periods=[{id:'legacy-period',kind:'period',date:'2026-11-10',end_date:'2026-11-11',note:null}];
 const todo={id:'old-todo',content:'旧事项',date:'2026-11-10',repeat_type:'none',done:false,category_id:null,important:false,reminder_enabled:false,created_at:'2026-11-10T00:00:00Z',sort_order:0};
 await page.addInitScript(({cards,actions,completions,periods,todo})=>{
   if(localStorage.getItem('__habits_fixture'))return;
   for(const [name,rows] of Object.entries({cards,actions,completions,body_records:periods})){
     localStorage.setItem(`ldb_v1_${name}_meta`,JSON.stringify({chunks:1}));localStorage.setItem(`ldb_v1_${name}_0`,JSON.stringify(rows));
   }
   localStorage.setItem('todo_items_v1',JSON.stringify([todo]));localStorage.setItem('__habits_fixture','1');
 },{cards,actions,completions,periods,todo});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const checked=async(id,value)=>{await expect(page.getByTestId(id)).toHaveAttribute('aria-checked',String(value));await expect(page.getByTestId(id)).toBeEnabled();};
 await page.goto(origin);await page.getByTestId('habits-section').waitFor();
 await expect(page.getByText('历史事项 1 件')).toBeVisible();await expect(page.getByTestId('agenda-旧事项')).toBeVisible();
 assert.equal(await page.getByTestId('habit-date-2026-11-12').count(),0);
 await checked('habit-check-c1',false);await page.getByTestId('habit-check-c1').click();await checked('habit-check-c1',true);
 await page.getByTestId('habit-note-c1').click();await page.getByTestId('habit-note-input').fill('完成洗漱\n今天慢慢来');await page.getByTestId('habit-note-save').click();
 await page.getByTestId('habit-note-input').waitFor({state:'detached'});
 await page.reload();await checked('habit-check-c1',true);await expect(page.getByTestId('habit-note-c1')).toContainText('今天慢慢来');
 await page.getByTestId('habit-check-c1').click();await checked('habit-check-c1',false);
 console.log('✓ 默认日视图、直接勾选/取消、描述保存及重开保留；历史事项默认展开');
 await page.getByTestId('habits-month').click();await page.getByTestId('habit-date-2026-11-11').click();await checked('habit-check-c1',true);
 await page.getByTestId('habits-prev').click();await page.getByTestId('habit-date-2026-10-31').click();
 await page.getByTestId('habit-check-c2').click();await checked('habit-check-c2',true);
 await page.getByTestId('habit-history-c2').click();await expect(page.getByTestId('history-row')).toContainText('10/31');await expect(page.getByTestId('history-row')).toContainText('补记');await page.getByTestId('history-close').click();
 await page.getByTestId('habits-next').click();await page.getByTestId('habit-date-2026-11-12').click();await checked('habit-check-c2',false);
 await page.getByTestId('habit-date-2026-11-13').click();await expect(page.getByTestId('habit-check-c2')).toBeDisabled();
 await page.getByTestId('habit-date-2026-11-12').click();
 console.log('✓ 月历跨月补记、历史可见、旧日完成保留，未来日期不允许误打卡');
 await page.getByTestId('habit-period').click();await checked('habit-period',true);await page.getByTestId('period-note').click();await page.getByTestId('habit-note-input').fill('第一天');await page.getByTestId('habit-note-save').click();await page.getByTestId('habit-note-input').waitFor({state:'detached'});
 await page.getByTestId('habit-date-2026-11-11').click();await checked('habit-period',true);await page.getByTestId('habit-period').click();await checked('habit-period',false);
 await page.getByTestId('habit-date-2026-11-12').click();await checked('habit-period',true);await expect(page.getByTestId('period-note')).toContainText('第一天');
 console.log('✓ 生理期按天勾选、取消与描述，兼容旧周期且不影响其他日期');
 await page.getByTestId('habit-sort').click();await page.getByTestId('habit-up-c2').click();
 await expect(page.getByTestId('habit-check-c2')).toBeEnabled();await page.reload();await page.getByTestId('habits-section').waitFor();
 const ids=await page.locator('[data-testid^="habit-check-"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-testid')));assert.equal(ids[0],'habit-check-c2');
 await page.getByTestId('habit-create').click();await page.getByTestId('habit-name').fill('读书');await page.getByTestId('habit-new-group').fill('学习');await page.getByText('加上',{exact:true}).click();await page.getByTestId('habit-save').click();
 await page.getByTestId('habits-section').waitFor();
 const newCard=await page.evaluate(()=>JSON.parse(localStorage.getItem('ldb_v1_cards_0')).find(r=>r.name==='读书'));
 assert.equal(newCard.tags[0],'学习');
 const newAction=await page.evaluate(id=>JSON.parse(localStorage.getItem('ldb_v1_actions_0')).find(r=>r.card_id===id),newCard.id);
 assert.equal(newAction.interval_days,1);assert.equal(newAction.frequency_type,'interval');
 await page.getByTestId(`habit-history-${newCard.id}`).click();await page.getByTestId('history-edit').click();await page.getByTestId('habit-name').fill('读十页书');await page.getByTestId('habit-save').click();await expect(page.getByTestId(`habit-check-${newCard.id}`)).toContainText('读十页书');
 console.log('✓ 原有习惯复用、习惯排序持久化、新建默认每天、自定义分类和编辑');
 await expect(page.getByTestId('history-edit')).toHaveCount(0);
 await page.getByTestId('habits-section').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(shots,'day.png')});
 await page.getByTestId('habits-month').click();await page.getByTestId('habits-month').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(shots,'month.png')});
 await page.goto(`${origin}/other`);assert.equal(await page.getByTestId('open-os-connect').count(),0);
 await page.goto(`${origin}/os-connect`);await page.getByTestId('cloud-back-today').waitFor();assert.equal(await page.getByTestId('cloud-email').count(),0);await page.getByTestId('cloud-back-today').click();await page.getByTestId('habits-section').waitFor();
 assert.deepEqual(errors,[]);console.log('✓ 邮件入口已撤下，无需登录可使用；没有页面异常');console.log(`Screenshots: ${shots}`);
}catch(e){if(page){console.error((await page.locator('body').innerText()).slice(-3200));await page.screenshot({path:resolve(shots,'failure.png')});console.error(shots);}throw e;}
finally{await browser.close();server.close();}
