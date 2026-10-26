import type { AIAction } from '../types';
import { imageUrlToBase64 } from './chatImages';
import { getModelOption, setModelOption } from './aiSettings';

// 支持的模型（灵的设定 / 其他页的设置里切换、填各家的 key）
// 2.0 起默认用国内能直连的 DeepSeek（需求文档 D3=C），豆包备选；Claude/GPT/Gemini 要开代理，只当备选。
export type AIModel = 'deepseek-chat' | 'doubao' | 'claude-sonnet' | 'gpt-4o' | 'gemini-flash';

export const DEFAULT_MODEL: AIModel = 'deepseek-chat';

export const AI_MODELS: { id: AIModel; label: string; keyHint: string; supportsImages: boolean; needsProxy: boolean }[] = [
  { id: 'deepseek-chat', label: 'DeepSeek', keyHint: 'sk-...（platform.deepseek.com）', supportsImages: false, needsProxy: false },
  { id: 'doubao', label: '豆包', keyHint: '火山方舟的 API Key（console.volcengine.com/ark）', supportsImages: false, needsProxy: false },
  { id: 'claude-sonnet', label: 'Claude', keyHint: 'sk-ant-...（console.anthropic.com，要代理）', supportsImages: true, needsProxy: true },
  { id: 'gpt-4o', label: 'GPT', keyHint: 'sk-...（platform.openai.com，要代理）', supportsImages: true, needsProxy: true },
  { id: 'gemini-flash', label: 'Gemini', keyHint: 'AIza...（aistudio.google.com/apikey，要代理）', supportsImages: true, needsProxy: true },
];

export function modelLabel(model: AIModel): string {
  return AI_MODELS.find((m) => m.id === model)?.label ?? model;
}

/** DeepSeek 官方在调整模型名（价格页现在列的是 deepseek-flash / deepseek-v4-pro），
 * 这里先用 deepseek-chat，报"模型不存在"就依次换下一个，并记住能用的那个 */
const DEEPSEEK_MODEL_CANDIDATES = ['deepseek-chat', 'deepseek-flash', 'deepseek-v4-flash'];


/** 把回复里的 ```json {...} ``` 指令块拆出来；extra 里是 actions 以外的字段（比如 suggest） */
export function parseActions(raw: string): { text: string; actions: AIAction[]; extra: Record<string, unknown> } {
  const match = raw.match(/```json\s*([\s\S]*?)```/);
  if (!match) return { text: raw.trim(), actions: [], extra: {} };

  const text = raw.replace(match[0], '').trim();
  try {
    const parsed = JSON.parse(match[1]);
    const { actions, ...extra } = parsed ?? {};
    return { text, actions: Array.isArray(actions) ? actions : [], extra };
  } catch {
    return { text, actions: [], extra: {} };
  }
}

const REQUEST_TIMEOUT_MS = 60000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw new Error('网络太慢，等了一分钟没回');
    throw err;
  } finally {
    clearTimeout(t);
  }
}

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: string;
  image_url?: string | null;
}

async function callAnthropic(messages: ModelMessage[], system: string, apiKey: string, maxTokens: number): Promise<string> {
  const mapped = await Promise.all(
    messages.map(async (m) => {
      if (!m.image_url) return { role: m.role, content: m.content };
      const { base64, mimeType } = await imageUrlToBase64(m.image_url);
      const parts: unknown[] = [{ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }];
      if (m.content) parts.push({ type: 'text', text: m.content });
      return { role: m.role, content: parts };
    })
  );

  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages: mapped }),
  });
  if (!res.ok) throw new Error(`Claude 接口错误: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

/** OpenAI、DeepSeek、豆包（火山方舟）用的都是 chat/completions 这套格式，公用一个实现 */
async function callOpenAICompatible(
  baseUrl: string,
  model: string,
  messages: ModelMessage[],
  system: string,
  apiKey: string,
  errorLabel: string,
  supportsImages: boolean,
  maxTokens: number
): Promise<string> {
  const mapped = await Promise.all(
    messages.map(async (m) => {
      if (!m.image_url || !supportsImages) return { role: m.role, content: m.content };
      const { base64, mimeType } = await imageUrlToBase64(m.image_url);
      const parts: unknown[] = [{ type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }];
      if (m.content) parts.push({ type: 'text', text: m.content });
      return { role: m.role, content: parts };
    })
  );

  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...mapped] }),
  });
  if (!res.ok) throw new ModelHttpError(`${errorLabel} 接口错误: ${res.status} ${await res.text()}`, res.status);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

class ModelHttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function callDeepSeek(messages: ModelMessage[], system: string, apiKey: string, maxTokens: number): Promise<string> {
  const saved = await getModelOption('deepseek');
  const order = saved ? [saved, ...DEEPSEEK_MODEL_CANDIDATES.filter((m) => m !== saved)] : DEEPSEEK_MODEL_CANDIDATES;
  let lastError: unknown = null;
  for (const name of order) {
    try {
      const out = await callOpenAICompatible('https://api.deepseek.com', name, messages, system, apiKey, 'DeepSeek', false, maxTokens);
      if (name !== saved) await setModelOption('deepseek', name);
      return out;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const modelMissing = err instanceof ModelHttpError && err.status === 400 && /model/i.test(msg);
      if (!modelMissing) throw err;
    }
  }
  throw lastError ?? new Error('DeepSeek 没有可用的模型');
}

async function callDoubao(messages: ModelMessage[], system: string, apiKey: string, maxTokens: number): Promise<string> {
  const model = (await getModelOption('doubao'))?.trim();
  if (!model) throw new Error('豆包还没填模型名：在灵的设定 → 大脑里填火山方舟的模型名或接入点 ID（ep- 开头）');
  return callOpenAICompatible('https://ark.cn-beijing.volces.com/api/v3', model, messages, system, apiKey, '豆包', false, maxTokens);
}

async function callGemini(messages: ModelMessage[], system: string, apiKey: string): Promise<string> {
  const contents = await Promise.all(
    messages.map(async (m) => {
      const parts: unknown[] = [];
      if (m.image_url) {
        const { base64, mimeType } = await imageUrlToBase64(m.image_url);
        parts.push({ inline_data: { mime_type: mimeType, data: base64 } });
      }
      if (m.content) parts.push({ text: m.content });
      if (parts.length === 0) parts.push({ text: '' });
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    })
  );

  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
    }
  );
  if (!res.ok) throw new Error(`Gemini 接口错误: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/** 调一次模型，拿纯文本回复 */
export async function callModel(
  model: AIModel,
  messages: ModelMessage[],
  system: string,
  apiKey: string,
  maxTokens = 1024
): Promise<string> {
  switch (model) {
    case 'deepseek-chat':
      return callDeepSeek(messages, system, apiKey, maxTokens);
    case 'doubao':
      return callDoubao(messages, system, apiKey, maxTokens);
    case 'gpt-4o':
      return callOpenAICompatible('https://api.openai.com/v1', 'gpt-4o', messages, system, apiKey, 'OpenAI', true, maxTokens);
    case 'gemini-flash':
      return callGemini(messages, system, apiKey);
    case 'claude-sonnet':
    default:
      return callAnthropic(messages, system, apiKey, maxTokens);
  }
}

function missingKeyError(model: AIModel): Error {
  return new Error(`还没有设置 ${modelLabel(model)} 的 API Key，去灵的设定 → 大脑里填一下`);
}

/**
 * 通用的一次性 AI 调用：给一段系统提示 + 一段用户内容，拿纯文本回复。
 * 给"每日总结"、主动消息预写这种不是聊天、但也要调用 AI 的场景用。
 */
export async function callAIOnce(
  systemPrompt: string,
  userPrompt: string,
  model: AIModel,
  apiKey: string | null,
  maxTokens = 1024
): Promise<string> {
  if (!apiKey) throw missingKeyError(model);
  return callModel(model, [{ role: 'user', content: userPrompt }], systemPrompt, apiKey, maxTokens);
}
