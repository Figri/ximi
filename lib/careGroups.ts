import { db } from './localdb';
import type { Card } from '../types';

// 「该照顾的」分类：习惯卡片的第一个标签（🐱猫、🧹区域……）。没标签的按名字猜一下猫 / 打扫，猜不出放「其他」。
// 分类的先后顺序存在 tags 表的 sort_order 里，在「分类管理」里拖。改名、删掉会同步改到用了它的卡片上。

const CAT_WORDS = /猫|铲屎|猫砂|喂|水碗|梳毛|剪指甲|艾琪|小黄|皮蛋|粥粥|兔狲|兔轩/;
const CLEAN_WORDS = /扫|拖|擦|洗|倒垃圾|收拾|整理|客厅|厨房|卫生间|厕所|浴室|床|桌/;
export const OTHER_GROUP = '其他';

export function groupOf(card: Card): string {
  const first = (card.tags ?? []).find((t) => !!t && !!t.trim());
  if (first) return first;
  if (CAT_WORDS.test(card.name)) return '🐱猫';
  if (CLEAN_WORDS.test(card.name)) return '🧹打扫';
  return OTHER_GROUP;
}

interface TagRow {
  id: string;
  name: string;
  emoji: string | null;
  sort_order: number;
}

async function tagRows(): Promise<TagRow[]> {
  const { data } = await db.from('tags').select('*').order('sort_order');
  return (data ?? []) as TagRow[];
}

/** 分类管理里排好的顺序（只有名字） */
export async function loadGroupOrder(): Promise<string[]> {
  return (await tagRows()).map((t) => t.name);
}

/** 按排好的顺序排：排过的在前，没排过的按原来的顺序跟在后面，「其他」永远最后 */
export function sortGroupNames(names: string[], order: string[]): string[] {
  const rank = new Map(order.map((n, i) => [n, i]));
  return names
    .map((n, i) => ({ n, i }))
    .sort((a, b) => {
      if (a.n === OTHER_GROUP) return 1;
      if (b.n === OTHER_GROUP) return -1;
      const ra = rank.get(a.n) ?? 10000 + a.i;
      const rb = rank.get(b.n) ?? 10000 + b.i;
      return ra - rb;
    })
    .map((x) => x.n);
}

/** 存新顺序：没有的分类补一行，有的改 sort_order */
export async function saveGroupOrder(names: string[]): Promise<void> {
  const rows = await tagRows();
  const byName = new Map(rows.map((r) => [r.name, r]));
  let i = 0;
  for (const name of names) {
    if (name === OTHER_GROUP) continue;
    i++;
    const row = byName.get(name);
    if (row) {
      if (row.sort_order !== i) await db.from('tags').update({ sort_order: i }).eq('id', row.id);
    } else {
      await db.from('tags').insert({ name, emoji: null, sort_order: i });
    }
  }
}

async function habitCards(): Promise<Card[]> {
  const { data } = await db.from('cards').select('*').eq('archived', false);
  return (data ?? []) as Card[];
}

/** 改名：tags 表那行改名（新名字已经有了就并过去），卡片上的标签一起换 */
export async function renameGroup(from: string, to: string): Promise<void> {
  const name = to.trim();
  if (!name || name === from) return;
  const rows = await tagRows();
  const old = rows.find((r) => r.name === from);
  const exists = rows.find((r) => r.name === name);
  if (old && exists) await db.from('tags').delete().eq('id', old.id);
  else if (old) await db.from('tags').update({ name }).eq('id', old.id);
  else if (!exists) await db.from('tags').insert({ name, emoji: null, sort_order: rows.length + 1 });
  for (const card of await habitCards()) {
    const tags = card.tags ?? [];
    if (tags.includes(from)) {
      const next = Array.from(new Set(tags.map((t) => (t === from ? name : t))));
      await db.from('cards').update({ tags: next, updated_at: new Date().toISOString() }).eq('id', card.id);
    } else if (!tags.length && from !== OTHER_GROUP && groupOf(card) === from) {
      // 原来是按名字猜的分类：改名就是给它们正式贴上新名字
      await db.from('cards').update({ tags: [name], updated_at: new Date().toISOString() }).eq('id', card.id);
    }
  }
}

export interface GroupSnapshot {
  tag: TagRow | null;
  cards: { id: string; tags: string[] }[];
}

/** 删掉一个分类：用它的卡片去掉这个标签（落到猜的分类或「其他」），返回删之前的样子，撤销时原样放回 */
export async function deleteGroup(name: string): Promise<GroupSnapshot> {
  const rows = await tagRows();
  const tag = rows.find((r) => r.name === name) ?? null;
  const touched: { id: string; tags: string[] }[] = [];
  for (const card of await habitCards()) {
    const tags = card.tags ?? [];
    if (!tags.includes(name)) continue;
    touched.push({ id: card.id, tags: [...tags] });
    await db.from('cards').update({ tags: tags.filter((t) => t !== name), updated_at: new Date().toISOString() }).eq('id', card.id);
  }
  if (tag) await db.from('tags').delete().eq('id', tag.id);
  return { tag, cards: touched };
}

export async function restoreGroup(s: GroupSnapshot): Promise<void> {
  if (s.tag) {
    const { data } = await db.from('tags').select('id').eq('name', s.tag.name).maybeSingle();
    if (!data) await db.from('tags').insert({ ...s.tag });
  }
  for (const c of s.cards) await db.from('cards').update({ tags: c.tags }).eq('id', c.id);
}

export async function addGroup(name: string): Promise<void> {
  const n = name.trim();
  if (!n || n === OTHER_GROUP) return;
  const rows = await tagRows();
  if (rows.some((r) => r.name === n)) return;
  await db.from('tags').insert({ name: n, emoji: null, sort_order: rows.length + 1 });
}
