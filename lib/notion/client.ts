import { secureStore } from '../aiSettings';

// Notion 官方接口的最小客户端（直接 fetch，不加依赖）。
// - 密钥存在手机安全存储里（notion_token）。
// - 接口限速平均每秒 3 次：所有请求排队，间隔至少 350ms；遇到 429 按 Retry-After 等一下再试。
// - 用 2022-06-28 这个接口版本：西米的库都是单数据源，老版本接口最稳。

const BASE = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const K_TOKEN = 'notion_token';
const MIN_GAP_MS = 350;

export class NotionError extends Error {
  constructor(message: string, public status: number, public code: string | null) {
    super(message);
  }
}

export async function getNotionToken(): Promise<string | null> {
  return secureStore.get(K_TOKEN);
}

export async function setNotionToken(token: string | null): Promise<void> {
  if (!token?.trim()) await secureStore.delete(K_TOKEN);
  else await secureStore.set(K_TOKEN, token.trim());
}

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

/** 测试时可以换掉网络层 */
let fetchImpl: typeof fetch = (...args) => fetch(...args);
export function setNotionFetch(impl: typeof fetch): void {
  fetchImpl = impl;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function notionRequest<T = any>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const token = init.token ?? (await getNotionToken());
  if (!token) throw new NotionError('还没连 Notion', 0, 'no_token');
  const run = async (): Promise<T> => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const wait = lastAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastAt = Date.now();
      const res = await fetchImpl(`${BASE}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': VERSION,
          'Content-Type': 'application/json',
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after') ?? '1');
        await sleep(Math.min(10, Math.max(1, retry)) * 1000);
        continue;
      }
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        throw new NotionError(data?.message ?? `Notion 返回 ${res.status}`, res.status, data?.code ?? null);
      }
      return data as T;
    }
    throw new NotionError('Notion 一直说太忙，晚点再试', 429, 'rate_limited');
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

// ---- 常用接口 ----

export function plainText(rich: any[] | undefined | null): string {
  return (rich ?? []).map((r) => r?.plain_text ?? r?.text?.content ?? '').join('');
}

export function titleOf(obj: any): string {
  if (!obj) return '';
  if (obj.object === 'database') return plainText(obj.title);
  const props = obj.properties ?? {};
  for (const v of Object.values<any>(props)) if (v?.type === 'title') return plainText(v.title);
  return '';
}

export async function searchAll(query: string, kind: 'page' | 'database'): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const res = await notionRequest<any>('/search', {
      method: 'POST',
      body: { query, filter: { property: 'object', value: kind }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
    });
    out.push(...(res.results ?? []));
    if (!res.has_more) break;
    cursor = res.next_cursor;
  }
  return out;
}

export async function queryDatabase(databaseId: string, body: Record<string, unknown> = {}, maxPages = 5): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const res = await notionRequest<any>(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: { page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) },
    });
    out.push(...(res.results ?? []));
    if (!res.has_more) break;
    cursor = res.next_cursor;
  }
  return out;
}

export async function getChildren(blockId: string, maxPages = 10): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const res = await notionRequest<any>(`/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    out.push(...(res.results ?? []));
    if (!res.has_more) break;
    cursor = res.next_cursor;
  }
  return out;
}

/** 追加子块：一次最多 100 个，超过的分批 */
export async function appendChildren(blockId: string, children: any[]): Promise<void> {
  for (let i = 0; i < children.length; i += 100) {
    await notionRequest(`/blocks/${blockId}/children`, { method: 'PATCH', body: { children: children.slice(i, i + 100) } });
  }
}

export async function deleteBlock(blockId: string): Promise<void> {
  await notionRequest(`/blocks/${blockId}`, { method: 'DELETE' });
}

// ---- 块 ↔ 文本 ----

const TEXT_TYPES = ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'bulleted_list_item', 'numbered_list_item', 'to_do', 'quote', 'callout', 'toggle'];

function blockLine(b: any, depth: number, index: number): string | null {
  const t = b.type;
  const indent = '  '.repeat(depth);
  if (t === 'child_page' || t === 'child_database') return null; // 子页面不展开（比如系统规则下面的 GPT·人设，灵不读）
  if (t === 'divider') return '';
  if (t === 'code') return plainText(b.code?.rich_text);
  if (t === 'table' || t === 'table_row') return null;
  if (!TEXT_TYPES.includes(t)) return null;
  const text = plainText(b[t]?.rich_text);
  switch (t) {
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
      return `${indent}${text}`;
    case 'bulleted_list_item':
    case 'toggle':
      return `${indent}- ${text}`;
    case 'numbered_list_item':
      return `${indent}${index + 1}. ${text}`;
    case 'to_do':
      return `${indent}- [${b.to_do?.checked ? 'x' : ' '}] ${text}`;
    default:
      return `${indent}${text}`;
  }
}

/** 把一个页面的正文转成纯文本（嵌套最多读两层），给灵当提示词用 */
export async function pageToText(pageId: string, maxDepth = 2): Promise<string> {
  const lines: string[] = [];
  async function walk(id: string, depth: number) {
    const blocks = await getChildren(id);
    let numbered = 0;
    for (const b of blocks) {
      numbered = b.type === 'numbered_list_item' ? numbered + 1 : 0;
      const line = blockLine(b, depth, Math.max(0, numbered - 1));
      if (line == null) continue;
      lines.push(line);
      if (b.has_children && depth + 1 < maxDepth && b.type !== 'child_page' && b.type !== 'child_database') {
        await walk(b.id, depth + 1);
      }
    }
  }
  await walk(pageId, 0);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 一段文字 → rich_text（单段最多 2000 字） */
export function richText(text: string): any[] {
  const out: any[] = [];
  for (let i = 0; i < text.length; i += 1900) out.push({ type: 'text', text: { content: text.slice(i, i + 1900) } });
  return out.length ? out : [{ type: 'text', text: { content: '' } }];
}

/** 纯文本 → 块：空行分段，「- 」开头的行变成列表 */
export function textToBlocks(text: string): any[] {
  const blocks: any[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const bullet = line.match(/^\s*[-·•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.、]\s*(.*)$/);
    if (bullet) blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText(bullet[1]) } });
    else if (numbered) blocks.push({ object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: richText(numbered[1]) } });
    else blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: richText(line) } });
  }
  return blocks;
}
