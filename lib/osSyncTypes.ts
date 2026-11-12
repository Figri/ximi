export type RecordKind = 'fragment' | 'review' | 'context';
export interface CloudRecord {
  id: string; record_date: string | null; payload: Record<string, any>;
  version: number; revision: number; deleted: boolean; source: 'os' | 'chatgpt'; updated_at: string;
}
export interface SyncItem { kind: RecordKind; id: string; date: string | null; payload: Record<string, any>; deleted: boolean }
export function canonical(value: any): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export function fingerprint(item: Pick<SyncItem, 'payload' | 'date' | 'deleted'>): string {
  return canonical(item);
}
