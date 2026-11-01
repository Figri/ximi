// 今天页「事项」在一个时段里怎么排（纯计算，进了 npm test）。
// 11/2 西米：倒序，刚写的在最上面。设了钟点的还是按钟点先后排在前面；收藏（★）不挪位置。

export interface AgendaOrderable {
  /** 'HH:MM'，没设是 null */
  time: string | null;
  /** 写下的时间（ISO）；拿不到的当最早 */
  createdAt: string | null;
}

function ts(iso: string | null): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export function sortAgenda<T extends AgendaOrderable>(rows: T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.time ?? '99').localeCompare(b.r.time ?? '99') || ts(b.r.createdAt) - ts(a.r.createdAt) || a.i - b.i)
    .map((x) => x.r);
}
