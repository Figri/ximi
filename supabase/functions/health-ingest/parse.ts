// HC Webhook（mcnaveen/health-connect-webhook）发来的 JSON → health_records 的行。纯计算，没有依赖，方便本地测。
// 格式见 https://github.com/mcnaveen/health-connect-webhook/blob/main/docs/webhook.md
// 时间：带时区的 ISO（Z 或 +08:00）照原样认；没写时区的当北京时间（Asia/Shanghai，常年 +08:00）。

export interface HealthRow {
  type: string;
  start_time: string; // ISO（UTC）
  end_time: string;
  value: Record<string, unknown>;
  raw: unknown;
  source: string | null;
}

export interface ParseResult {
  rows: HealthRow[];
  /** 同一个 Health Connect 记录 id 先删旧行：改过时间的睡眠 / 运动，以及 deleted 里列的 */
  replaceIds: { type: string; id: string }[];
  counts: Record<string, number>;
  skipped: number;
}

/** HC Webhook 的键名 → 表里的 type（她要的叫法），其余原样 */
const TYPE_NAME: Record<string, string> = { skin_temperature: 'skin_temp' };
export const typeOf = (key: string) => TYPE_NAME[key] ?? key;

/** 有自己 id、会被改时间的「一段」类记录：存之前按 id 先删旧的 */
const SESSION_TYPES = new Set(['sleep', 'exercise', 'mindfulness', 'menstruation_period']);

/** Health Connect 睡眠阶段（SleepSessionRecord.STAGE_TYPE_*） */
export const SLEEP_STAGE: Record<string, string> = {
  '0': 'unknown',
  '1': 'awake',
  '2': 'sleeping',
  '3': 'out_of_bed',
  '4': 'light',
  '5': 'deep',
  '6': 'rem',
  '7': 'awake_in_bed',
};

/** Health Connect 运动类型（ExerciseSessionRecord.EXERCISE_TYPE_*）→ 中文 */
export const EXERCISE_ZH: Record<string, string> = {
  '0': '其他运动', '2': '羽毛球', '4': '棒球', '5': '篮球', '8': '骑行', '9': '动感单车', '10': '训练营',
  '11': '拳击', '13': '徒手训练', '14': '板球', '16': '跳舞', '25': '椭圆机', '26': '健身课', '27': '击剑',
  '28': '美式橄榄球', '29': '澳式橄榄球', '31': '飞盘', '32': '高尔夫', '33': '呼吸训练', '34': '体操',
  '35': '手球', '36': 'HIIT', '37': '徒步', '38': '冰球', '39': '滑冰', '44': '武术', '46': '划桨',
  '47': '滑翔伞', '48': '普拉提', '50': '壁球（美式）', '51': '攀岩', '52': '轮滑球', '53': '划船',
  '54': '划船机', '55': '橄榄球', '56': '跑步', '57': '跑步机', '58': '帆船', '59': '潜水', '60': '轮滑',
  '61': '滑雪', '62': '单板滑雪', '63': '雪鞋行走', '64': '足球', '65': '垒球', '66': '壁球',
  '68': '爬楼梯', '69': '爬楼机', '70': '力量训练', '71': '拉伸', '72': '冲浪', '73': '公开水域游泳',
  '74': '泳池游泳', '75': '乒乓球', '76': '网球', '78': '排球', '79': '步行', '80': '水球', '81': '举重',
  '82': '轮椅', '83': '瑜伽',
};

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** ISO 字符串 → UTC ISO；没写时区的按北京时间；认不出来返回 null */
export function toUtcIso(s: unknown): string | null {
  if (typeof s !== 'string' || !s.trim()) return null;
  const t = s.trim();
  const ms = Date.parse(HAS_ZONE.test(t) ? t : `${t}+08:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function sleepValue(rec: Record<string, any>, startIso: string, endIso: string) {
  const secs: Record<string, number> = { deep: 0, light: 0, rem: 0, awake: 0, sleeping: 0, unknown: 0 };
  const stages: { stage: string; start: string; end: string; minutes: number }[] = [];
  for (const st of Array.isArray(rec.stages) ? rec.stages : []) {
    const name = SLEEP_STAGE[String(st?.stage)] ?? String(st?.stage ?? 'unknown').toLowerCase();
    const s = toUtcIso(st?.start_time);
    const e = toUtcIso(st?.end_time);
    const d = num(st?.duration_seconds) ?? (s && e ? (Date.parse(e) - Date.parse(s)) / 1000 : 0);
    const bucket = name === 'awake_in_bed' || name === 'out_of_bed' ? 'awake' : name in secs ? name : 'unknown';
    secs[bucket] += Math.max(0, d);
    if (s && e) stages.push({ stage: name, start: s, end: e, minutes: Math.round(d / 60) });
  }
  const total = num(rec.duration_seconds) ?? (Date.parse(endIso) - Date.parse(startIso)) / 1000;
  const asleep = secs.deep + secs.light + secs.rem + secs.sleeping;
  const m = (x: number) => Math.round(x / 60);
  return {
    total_minutes: m(total),
    // 有阶段的按阶段算睡着了多久；没阶段的（只给了一整段）当整段都在睡
    asleep_minutes: stages.length ? m(asleep) : m(total),
    deep_minutes: m(secs.deep),
    light_minutes: m(secs.light),
    rem_minutes: m(secs.rem),
    awake_minutes: m(secs.awake),
    unspecified_minutes: m(secs.sleeping + secs.unknown),
    has_stages: stages.length > 0,
    stages,
  };
}

/** 一条记录 → 一行（拿不到时间的返回 null） */
export function recordToRow(key: string, rec: Record<string, any>): HealthRow | null {
  if (!rec || typeof rec !== 'object') return null;
  const type = typeOf(key);
  const source = typeof rec.metadata?.data_origin === 'string' ? rec.metadata.data_origin : null;
  let start: string | null;
  let end: string | null;

  if (key === 'sleep') {
    end = toUtcIso(rec.session_end_time ?? rec.end_time);
    const firstStage = Array.isArray(rec.stages) && rec.stages.length ? toUtcIso(rec.stages[0]?.start_time) : null;
    const dur = num(rec.duration_seconds);
    start = toUtcIso(rec.start_time) ?? (end && dur != null ? new Date(Date.parse(end) - dur * 1000).toISOString() : firstStage);
    if (!start || !end) return null;
    return { type, start_time: start, end_time: end, value: sleepValue(rec, start, end), raw: rec, source };
  }

  if (rec.start_time != null || rec.end_time != null) {
    start = toUtcIso(rec.start_time);
    end = toUtcIso(rec.end_time) ?? start;
  } else {
    start = toUtcIso(rec.time);
    end = start;
  }
  if (!start || !end) return null;

  const { metadata: _m, ...value } = rec;
  if (key === 'exercise') {
    const code = String(rec.type ?? '');
    (value as any).type_code = code;
    (value as any).type_name = EXERCISE_ZH[code] ?? (rec.title || `运动（${code}）`);
    delete (value as any).type;
    (value as any).duration_minutes = Math.round((num(rec.duration_seconds) ?? (Date.parse(end) - Date.parse(start)) / 1000) / 60);
  }
  return { type, start_time: start, end_time: end, value, raw: rec, source };
}

/** 整包 → 行（同一批 (type,start,end) 重复的留最后一条） */
export function parsePayload(payload: Record<string, any>, receivedAt = new Date()): ParseResult {
  const byKey = new Map<string, HealthRow>();
  const replace = new Map<string, { type: string; id: string }>();
  const counts: Record<string, number> = {};
  let skipped = 0;

  for (const [key, arr] of Object.entries(payload ?? {})) {
    if (key === 'deleted' || !Array.isArray(arr)) continue;
    for (const rec of arr) {
      const row = recordToRow(key, rec);
      if (!row) {
        skipped++;
        continue;
      }
      counts[row.type] = (counts[row.type] ?? 0) + 1;
      byKey.set(`${row.type}|${row.start_time}|${row.end_time}`, row);
      const id = rec?.metadata?.id;
      if (SESSION_TYPES.has(key) && typeof id === 'string' && id) replace.set(`${row.type}|${id}`, { type: row.type, id });
    }
  }
  for (const d of Array.isArray(payload?.deleted) ? payload.deleted : []) {
    if (d && typeof d.type === 'string' && typeof d.id === 'string' && SESSION_TYPES.has(d.type)) {
      replace.set(`${typeOf(d.type)}|${d.id}`, { type: typeOf(d.type), id: d.id });
    }
  }

  // 整包原样也存一行，方便看 HC Webhook 实际发来的格式
  const at = receivedAt.toISOString();
  const summary: Record<string, unknown> = {
    timestamp: payload?.timestamp ?? null,
    app_version: payload?.app_version ?? null,
    timezone: payload?.timezone ?? null,
    counts,
    deleted: Array.isArray(payload?.deleted) ? payload.deleted.length : 0,
    skipped,
  };
  byKey.set(`payload|${at}|${at}`, { type: 'payload', start_time: at, end_time: at, value: summary, raw: payload, source: 'hc-webhook' });

  return { rows: [...byKey.values()], replaceIds: [...replace.values()], counts, skipped };
}
