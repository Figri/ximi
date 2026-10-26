// 纯逻辑的自动测试：随手记一句话怎么归类（lib/captureParse.ts）、习惯到日子提醒和文案（lib/decay.ts）。
// 不用装新依赖：用项目自带的 typescript 把这两个文件转成 CommonJS 放到临时目录再跑。
// 跑法：npm test（有一条不对就以非 0 退出）。时间都按东八区算。
process.env.TZ = 'Asia/Shanghai';

import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'ximi-logic-'));

function load(rel) {
  const src = readFileSync(join(root, rel), 'utf8');
  const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const file = join(outDir, rel.replace(/[\\/]/g, '_').replace(/\.ts$/, '.cjs'));
  writeFileSync(file, outputText);
  return require(file);
}

const { parseCapture, describeParsed } = load('lib/captureParse.ts');
const { nextHabitReminder, describeFrequency, habitSubLabel } = load('lib/decay.ts');

let failed = 0;
let total = 0;
function report(ok, line) {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${line}`);
}

// ---------- 随手记：一句话归到哪一类 ----------
const STATE_WORDS = ['开心', '一般', '难过', '烦躁', '焦虑', '疲惫', '平静', '低动力', '内耗'];
// 2026-10-25 是周日
const ctxAt = (iso) => ({ now: new Date(iso), dayStartHour: 5, catNames: ['艾琪', '小黄', '皮蛋', '粥粥', '兔狲（兔轩）'], categoryNames: ['工作', '睡觉', '玩', '吃饭', '家务'], stateWords: STATE_WORDS });
const fmt = (d) => d && `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
// [现在, 输入, 应该归到哪类, 再细查一下(p) => true]
const captureCases = [
  ['2026-10-25T11:00:00+08:00', '14:00-16:00 写简历', 'timeblock', (p) => fmt(p.start) === '10/25 14:00' && fmt(p.end) === '10/25 16:00' && p.text === '写简历'],
  ['2026-10-25T11:00:00+08:00', '下午2点到4点 工作', 'timeblock', (p) => fmt(p.start) === '10/25 14:00' && fmt(p.end) === '10/25 16:00' && p.categoryName === '工作' && p.text === ''],
  ['2026-10-25T11:00:00+08:00', '14:00-16:00 工作 写简历', 'timeblock', (p) => p.categoryName === '工作' && p.text === '写简历'],
  ['2026-10-25T11:00:00+08:00', '周五带兔狲去复查', 'todo', (p) => p.cats.join() === '兔狲（兔轩）' && p.date === '2026-10-30'],
  ['2026-10-25T11:00:00+08:00', '兔轩今天吐了', 'fragment', (p) => p.cats.join() === '兔狲（兔轩）'],
  ['2026-10-25T11:00:00+08:00', '23:30-01:00 打游戏', 'timeblock', (p) => fmt(p.start) === '10/25 23:30' && fmt(p.end) === '10/26 01:00'],
  ['2026-10-26T01:30:00+08:00', '23:00-00:30 刷手机', 'timeblock', (p) => fmt(p.start) === '10/25 23:00' && fmt(p.end) === '10/26 00:30'],
  ['2026-10-25T11:00:00+08:00', '昨天 9:00~10:30 吃饭', 'timeblock', (p) => fmt(p.start) === '10/24 09:00' && p.categoryName === '吃饭'],
  ['2026-10-25T11:00:00+08:00', '周三带皮蛋打疫苗', 'todo', (p) => p.date === '2026-10-28' && p.text === '带皮蛋打疫苗' && p.cats.join() === '皮蛋'],
  ['2026-10-25T11:00:00+08:00', '下周三下午3点带皮蛋打疫苗', 'todo', (p) => p.date === '2026-10-28' && p.time === '15:00' && p.text === '带皮蛋打疫苗'],
  ['2026-10-25T11:00:00+08:00', '周日 交房租', 'todo', (p) => p.date === '2026-10-25'],
  ['2026-10-25T11:00:00+08:00', '明天早上8点半 取快递', 'todo', (p) => p.date === '2026-10-26' && p.time === '08:30' && p.text === '取快递'],
  ['2026-10-25T11:00:00+08:00', '今晚8点给妈打电话', 'todo', (p) => p.date === '2026-10-25' && p.time === '20:00' && p.text === '给妈打电话'],
  ['2026-10-25T11:00:00+08:00', '3点开会', 'todo', (p) => p.time === '15:00' && p.date === '2026-10-25'],
  ['2026-10-25T11:00:00+08:00', '11月3日 体检', 'todo', (p) => p.date === '2026-11-03' && p.text === '体检'],
  ['2026-10-25T11:00:00+08:00', '11/3 体检', 'todo', (p) => p.date === '2026-11-03'],
  ['2026-10-25T11:00:00+08:00', '28号还信用卡', 'todo', (p) => p.date === '2026-10-28' && p.text === '还信用卡'],
  ['2026-10-25T11:00:00+08:00', '5号交水费', 'todo', (p) => p.date === '2026-11-05'],
  ['2026-10-25T11:00:00+08:00', '买猫砂', 'todo', (p) => p.date === '2026-10-25' && p.time === null],
  ['2026-10-26T01:30:00+08:00', '买猫砂', 'todo', (p) => p.date === '2026-10-25'],
  ['2026-10-25T11:00:00+08:00', '想做个人短剧', 'idea', (p) => p.text === '想做个人短剧'],
  ['2026-10-25T11:00:00+08:00', '想法：做一个猫咪日历', 'idea', (p) => p.text === '做一个猫咪日历'],
  ['2026-10-25T11:00:00+08:00', '有点内耗', 'state', (p) => p.state === '内耗'],
  ['2026-10-25T11:00:00+08:00', '好累啊', 'state', (p) => p.state === '疲惫'],
  ['2026-10-25T11:00:00+08:00', '焦虑', 'state', (p) => p.state === '焦虑'],
  ['2026-10-25T11:00:00+08:00', '今天开会被老板说了好焦虑', 'fragment', () => true],
  ['2026-10-25T11:00:00+08:00', '每天23:00断电', 'routine', (p) => p.repeat.type === 'daily' && p.time === '23:00' && p.text === '断电'],
  ['2026-10-25T11:00:00+08:00', '每周一三五 健身', 'routine', (p) => p.repeat.type === 'weekly' && p.repeat.days.join() === '1,3,5' && p.text === '健身'],
  ['2026-10-25T11:00:00+08:00', '每隔3天换猫砂', 'routine', (p) => p.repeat.type === 'interval' && p.repeat.days === 3 && p.text === '换猫砂'],
  ['2026-10-25T11:00:00+08:00', '每两天给艾琪梳毛', 'routine', (p) => p.repeat.type === 'interval' && p.repeat.days === 2 && p.cats.join() === '艾琪'],
  ['2026-10-25T11:00:00+08:00', '每月15号交房租', 'routine', (p) => p.repeat.type === 'monthly' && p.repeat.day === 15 && p.text === '交房租'],
  ['2026-10-25T11:00:00+08:00', '每月最后一天 对账', 'routine', (p) => p.repeat.type === 'monthly' && p.repeat.day === 0],
  ['2026-10-25T13:00:00+08:00', '12:40 麻辣烫', 'fragment', (p) => fmt(p.at) === '10/25 12:40' && p.text === '麻辣烫'],
  ['2026-10-25T11:00:00+08:00', '12:40 麻辣烫', 'todo', (p) => p.time === '12:40'],
  ['2026-10-25T16:00:00+08:00', '3点开会', 'fragment', (p) => fmt(p.at) === '10/25 15:00'],
  ['2026-10-25T16:00:00+08:00', '3点取快递', 'todo', (p) => p.time === '15:00'],
  ['2026-10-25T11:00:00+08:00', '11点到1点 吃饭', 'timeblock', (p) => fmt(p.start) === '10/25 11:00' && fmt(p.end) === '10/25 13:00'],
  ['2026-10-25T11:00:00+08:00', '23点到1点 打游戏', 'timeblock', (p) => fmt(p.start) === '10/25 23:00' && fmt(p.end) === '10/26 01:00'],
  ['2026-10-25T11:00:00+08:00', '今晚吃火锅', 'fragment', () => true],
  ['2026-10-25T11:00:00+08:00', '明晚吃火锅', 'todo', (p) => p.date === '2026-10-26'],
  ['2026-10-25T11:00:00+08:00', '今天取快递', 'todo', (p) => p.date === '2026-10-25' && p.text === '取快递'],
  ['2026-10-25T11:00:00+08:00', '麻辣烫真好吃', 'fragment', () => true],
  ['2026-10-25T11:00:00+08:00', '', 'fragment', () => true],
  ['2026-10-25T11:00:00+08:00', '１４：００－１６：００ 写简历', 'timeblock', (p) => fmt(p.start) === '10/25 14:00'],
  ['2026-10-25T11:00:00+08:00', '25:00-26:00 乱写', 'fragment', () => true],
  ['2026-10-25T11:00:00+08:00', '今天一般', 'state', (p) => p.state === '一般'],
  ['2026-10-25T11:00:00+08:00', '这个电影一般', 'fragment', () => true],
  // 过一会儿提醒（替原来的倒计时）：从「现在」算，记成带提醒的事项
  ['2026-10-25T20:07:00+08:00', '20分钟后 关火', 'todo', (p) => p.date === '2026-10-25' && p.time === '20:27' && p.text === '关火' && p.fromNow === 20],
  ['2026-10-25T20:07:00+08:00', '半小时后叫我', 'todo', (p) => p.time === '20:37' && p.text === '半小时到了'],
  ['2026-10-25T20:07:00+08:00', '一个半小时后提醒我收衣服', 'todo', (p) => p.time === '21:37' && p.text === '收衣服'],
  ['2026-10-25T20:07:00+08:00', '过20分钟提醒我吃药', 'todo', (p) => p.time === '20:27' && p.text === '吃药'],
  ['2026-10-25T20:07:00+08:00', '2小时后 吃药', 'todo', (p) => p.time === '22:07' && p.text === '吃药'],
  ['2026-10-25T20:07:00+08:00', '1小时20分钟后出门', 'todo', (p) => p.time === '21:27' && p.text === '出门'],
  ['2026-10-25T20:07:00+08:00', '十五分钟后叫我起来', 'todo', (p) => p.time === '20:22' && p.text === '起来'],
  ['2026-10-25T20:07:00+08:00', '一刻钟后 关火', 'todo', (p) => p.time === '20:22' && p.text === '关火'],
  ['2026-10-25T20:07:00+08:00', '20分钟后', 'todo', (p) => p.time === '20:27' && p.text === '20分钟到了'],
  ['2026-10-25T20:07:40+08:00', '1分钟后 看锅', 'todo', (p) => p.time === '20:09' && p.text === '看锅'],
  ['2026-10-25T20:07:00+08:00', '收衣服 半小时后提醒我', 'todo', (p) => p.time === '20:37' && p.text === '收衣服'],
  ['2026-10-25T23:50:00+08:00', '20分钟后睡觉', 'todo', (p) => p.date === '2026-10-26' && p.time === '00:10' && p.text === '睡觉'],
  ['2026-10-25T11:00:00+08:00', '3点20分后去买菜', 'todo', (p) => p.fromNow === undefined && p.time === '15:20' && p.text === '去买菜'],
  ['2026-10-25T11:00:00+08:00', '晚上八点十五 吃药', 'todo', (p) => p.time === '20:15' && p.text === '吃药'],
  ['2026-10-25T11:00:00+08:00', '两点三刻 开会', 'todo', (p) => p.time === '14:45'],
  ['2026-10-25T11:00:00+08:00', '三点二十分后去买菜', 'todo', (p) => p.fromNow === undefined && p.time === '15:20'],
  ['2026-10-25T11:00:00+08:00', '过了20分钟他才回我', 'fragment', (p) => p.fromNow === undefined],
  ['2026-10-25T11:00:00+08:00', '三刻钟后出门', 'fragment', (p) => p.fromNow === undefined],

];
for (const [now, input, kind, check] of captureCases) {
  const ctx = ctxAt(now);
  const p = parseCapture(input, ctx);
  let ok = p.kind === kind;
  let why = '';
  try {
    if (ok) ok = check(p) === true;
  } catch (e) {
    ok = false;
    why = e.message;
  }
  report(ok, `[${now.slice(5, 16)}] ${JSON.stringify(input)} → ${p.kind} | ${describeParsed(p, ctx.now, 5)} | text=${JSON.stringify(p.text)} date=${p.date ?? ''} time=${p.time ?? ''} ${why}`);
}

// ---------- 习惯：到日子那天提醒一次 + 各种文案 ----------
const A = (o) => ({ id: 'a', card_id: 'c', name: '做了', is_primary: true, frequency_type: 'interval', interval_days: 3, fixed_days: null, fixed_dates: null, suggested_interval: 3, max_delay: 5, linked_action_ids: null, requires_selection: false, active_hours_start: null, active_hours_end: null, created_at: '', remind_at: '20:00', ...o });
const d = (s) => new Date(s);
const habitCases = [
  // 洗头：做完隔 3 天。周一计划但周三才洗 → 下次从周三数：周六 20:00
  ['隔3天·周三洗→周六', nextHabitReminder(A({}), d('2026-10-21T22:00:00+08:00'), d('2026-10-22T09:00:00+08:00')), '10/24 20:00'],
  // 到日子那天已经过了 20:00 → 不再提醒（不催）
  ['到日子但时间已过', nextHabitReminder(A({}), d('2026-10-21T22:00:00+08:00'), d('2026-10-24T21:00:00+08:00')), null],
  // 已经过期好几天 → 不提醒
  ['过期了不追着提醒', nextHabitReminder(A({}), d('2026-10-10T10:00:00+08:00'), d('2026-10-25T09:00:00+08:00')), null],
  // 没做过 → 不提醒
  ['没做过不提醒', nextHabitReminder(A({}), null, d('2026-10-25T09:00:00+08:00')), null],
  // 没开提醒
  ['没开提醒', nextHabitReminder(A({ remind_at: null }), d('2026-10-24T10:00:00+08:00'), d('2026-10-25T09:00:00+08:00')), null],
  // 每天：今天做了 → 明天 20:00；今天没做（昨天做的）→ 今天 20:00
  ['每天·今天做了', nextHabitReminder(A({ suggested_interval: 1, interval_days: 1 }), d('2026-10-25T08:00:00+08:00'), d('2026-10-25T09:00:00+08:00')), '10/26 20:00'],
  ['每天·昨天做的', nextHabitReminder(A({ suggested_interval: 1, interval_days: 1 }), d('2026-10-24T08:00:00+08:00'), d('2026-10-25T09:00:00+08:00')), '10/25 20:00'],
  // 每周一三五：今天周日 → 周一 20:00
  ['每周一三五·周日', nextHabitReminder(A({ frequency_type: 'fixed_day', fixed_days: [1, 3, 5], suggested_interval: null }), d('2026-10-23T10:00:00+08:00'), d('2026-10-25T09:00:00+08:00')), '10/26 20:00'],
  // 每周一三五：今天周一且已经做了 → 周三
  ['每周一三五·周一做了', nextHabitReminder(A({ frequency_type: 'fixed_day', fixed_days: [1, 3, 5], suggested_interval: null }), d('2026-10-26T10:00:00+08:00'), d('2026-10-26T11:00:00+08:00')), '10/28 20:00'],
  // 每周一三五：今天周一还没做、20:00 还没到 → 今天
  ['每周一三五·周一没做', nextHabitReminder(A({ frequency_type: 'fixed_day', fixed_days: [1, 3, 5], suggested_interval: null }), d('2026-10-23T10:00:00+08:00'), d('2026-10-26T11:00:00+08:00')), '10/26 20:00'],
  // 时间写成 9:05
  ['9:05', nextHabitReminder(A({ remind_at: '9:05' }), d('2026-10-22T22:00:00+08:00'), d('2026-10-24T09:00:00+08:00')), '10/25 09:05'],
  // 跨月
  ['跨月', nextHabitReminder(A({ suggested_interval: 7 }), d('2026-10-28T10:00:00+08:00'), d('2026-10-29T09:00:00+08:00')), '11/4 20:00'],
  // 想做就做
  ['想做就做', nextHabitReminder(A({ frequency_type: 'manual' }), d('2026-10-24T10:00:00+08:00'), d('2026-10-25T09:00:00+08:00')), null],
];
for (const [name, got, want] of habitCases) report(fmt(got) === want, `${name}: ${fmt(got)}${fmt(got) === want ? '' : `（应该是 ${want}）`}`);
const texts = [
  [describeFrequency(A({})), '做完隔 3 天 · 到日子 20:00 提醒'],
  [describeFrequency(A({ remind_at: null, suggested_interval: 1 })), '每天'],
  [describeFrequency(A({ frequency_type: 'fixed_day', fixed_days: [5, 1, 3], remind_at: null })), '每周一三五'],
  [describeFrequency(A({ frequency_type: 'manual' })), '想做就做'],
  [habitSubLabel(A({}), null, false, d('2026-10-25T20:00:00+08:00')), '还没做过'],
  [habitSubLabel(A({}), d('2026-10-25T08:00:00+08:00'), true, d('2026-10-25T20:00:00+08:00')), '今天做了'],
  [habitSubLabel(A({ suggested_interval: 7, max_delay: 11 }), d('2026-10-24T08:00:00+08:00'), false, d('2026-10-25T20:00:00+08:00')), '昨天做的'],
  [habitSubLabel(A({ suggested_interval: 7, max_delay: 11 }), d('2026-10-20T08:00:00+08:00'), false, d('2026-10-25T20:00:00+08:00')), '5 天前做的'],
  [habitSubLabel(A({ frequency_type: 'manual' }), d('2026-10-20T08:00:00+08:00'), false, d('2026-10-25T20:00:00+08:00')), '5 天前做的'],
];
for (const [got, want] of texts) report(got === want, `文案: ${got}${got === want ? '' : `（应该是 ${want}）`}`);

console.log(`\n${total - failed}/${total} 通过`);
process.exit(failed ? 1 : 0);
