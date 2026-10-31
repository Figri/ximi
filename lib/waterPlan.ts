// 喝水（纯计算，进了 npm test）：一天 4 杯，一杯 500ml；10、14、17、20 点各提醒一次。
// 第 i 个点（从 1 数）只在那会儿还没喝够 i 杯时才提醒：14 点前已经喝了两杯，14 点那次就不叫了。
// 一杯算在哪天：跟今天页一样早上 5 点换日（凌晨 1 点喝的算前一天）。

export const WATER_SLOTS = [10, 14, 17, 20];
export const CUP_ML = 500;

export interface WaterEntry {
  id: string;
  /** 喝的时间（ISO） */
  at: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 跟 lingDayKey 一样的换日规则 */
export function waterDayKey(date: Date, dayStartHour = 5): string {
  const d = new Date(date.getTime());
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 这一天喝了几杯 */
export function cupsOnDay(entries: WaterEntry[], dayKey: string, dayStartHour = 5): number {
  return entries.filter((e) => waterDayKey(new Date(e.at), dayStartHour) === dayKey).length;
}

export interface PlannedWater {
  at: Date;
  /** 第几个点（1–4，10 点是 1） */
  slot: number;
  /** 到时候该喝第几杯：今天按现在已经喝的杯数 + 1，以后的日子从第 1 杯算 */
  cup: number;
  dayKey: string;
}

/**
 * 从 now 往后 horizonHours 小时里要提醒的点。今天的点按今天已经喝的杯数跳过；明天及以后的都排上
 * （到时候打开 App 会按最新杯数重排）。
 */
export function plannedWaterReminders(now: Date, cupsToday: number, dayStartHour = 5, horizonHours = 36, slots = WATER_SLOTS): PlannedWater[] {
  const out: PlannedWater[] = [];
  const todayKey = waterDayKey(now, dayStartHour);
  const end = now.getTime() + horizonHours * 3600 * 1000;
  for (let dayOffset = -1; dayOffset <= Math.ceil(horizonHours / 24) + 1; dayOffset++) {
    slots.forEach((hour, i) => {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, 0, 0, 0);
      if (at.getTime() <= now.getTime() || at.getTime() > end) return;
      const dayKey = waterDayKey(at, dayStartHour);
      if (dayKey === todayKey && cupsToday >= i + 1) return;
      out.push({ at, slot: i + 1, cup: (dayKey === todayKey ? cupsToday : 0) + 1, dayKey });
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
