import type { AIAction, AIReply, ChatMessage } from '../types';
import { imageUrlToBase64 } from './chatImages';

// 支持的模型（可在聊天页 ⋯ 设置里切换、填各家的 key）
export type AIModel = 'claude-sonnet' | 'gpt-4o' | 'gemini-flash' | 'deepseek-chat';

export const AI_MODELS: { id: AIModel; label: string; keyHint: string; supportsImages: boolean }[] = [
  { id: 'claude-sonnet', label: 'Claude', keyHint: 'sk-ant-...（console.anthropic.com）', supportsImages: true },
  { id: 'gpt-4o', label: 'GPT-4o', keyHint: 'sk-...（platform.openai.com）', supportsImages: true },
  { id: 'gemini-flash', label: 'Gemini', keyHint: 'AIza...（aistudio.google.com/apikey）', supportsImages: true },
  { id: 'deepseek-chat', label: 'DeepSeek', keyHint: 'sk-...（platform.deepseek.com）', supportsImages: false },
];

const SYSTEM_PROMPT_SUFFIX = `

## 你的能力
- 用户说做了什么事（铲屎、洗头、称体重等），你要在回复末尾返回结构化指令来更新卡片数据。
- 用户说"帮我加个每周X的提醒"之类的话，你要新建卡片。
- 用户说烦恼、心情不好，就正常聊天安慰，不需要返回指令。
- 用户记录事件（比如"我刚才色色了半小时"、"体重60.5"），你要帮她写入时间轴记录。
- 用户发了图片，你能直接看到图片内容，可以描述、评价或者根据图片内容聊天。

如果有可执行的操作，在回复最后追加一个 JSON 代码块（没有可执行操作就不要输出这个代码块）：

\`\`\`json
{"actions": [
  {"type": "complete", "card_name": "铲屎"},
  {"type": "timeline", "description": "色色", "category": "intimate", "duration_min": 30, "hp_change": -5, "mp_change": -3},
  {"type": "create_card", "card_name": "掏耳朵", "action_name": "掏了", "frequency_type": "interval", "interval_days": 14, "card_tags": ["🐱猫"]}
]}
\`\`\`

字段说明：
- complete: card_name 必须跟下面"卡片状态"里的名字完全一样（一个字都不能改，不要编不存在的卡片名），action_name 选填（不填默认完成主动作）
- timeline: description 是这件事的简单描述；category 从这些里选一个：body/sleep/eat/work/play/cat/exercise/emotion/plan/dream/intimate/diary/other；duration_min、hp_change、mp_change 都选填；用户报自己的体重时，description 写成"体重: 62.5kg"这种格式（方便自动识别），category 用 body
- create_card: 新建一张习惯卡片，frequency_type 是 interval（按周期）就填 interval_days，是 fixed_day（固定星期几，1=周一...7=周日）就填 fixed_days 数组`;

export function buildSystemPrompt(contextSummary: string): string {
  return `你是「灵」，西米的私人AI助手，住在她的西米OS APP里。你阳光、有活力、有主见，说话用中文，语气温暖亲近像认识很久的朋友，可以多用emoji，不是冷冰冰的工具。

${contextSummary}${SYSTEM_PROMPT_SUFFIX}`;
}

function parseActions(raw: string): { text: string; actions: AIAction[] } {
  const match = raw.match(/```json\s*([\s\S]*?)```/);
  if (!match) return { text: raw.trim(), actions: [] };

  const text = raw.replace(match[0], '').trim();
  try {
    const parsed = JSON.parse(match[1]);
    return { text, actions: parsed.actions ?? [] };
  } catch {
    return { text, actions: [] };
  }
}

async function callAnthropic(messages: ChatMessage[], system: string, apiKey: string): Promise<string> {
  const mapped = await Promise.all(
    messages.map(async (m) => {
      if (!m.image_url) return { role: m.role, content: m.content };
      const { base64, mimeType } = await imageUrlToBase64(m.image_url);
      const parts: unknown[] = [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
      ];
      if (m.content) parts.push({ type: 'text', text: m.content });
      return { role: m.role, content: parts };
    })
  );

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system,
      messages: mapped,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API 错误: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

/** OpenAI 和 DeepSeek 用的都是 chat/completions 这套格式，公用一个实现 */
async function callOpenAICompatible(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  system: string,
  apiKey: string,
  errorLabel: string,
  supportsImages: boolean
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

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...mapped],
    }),
  });
  if (!res.ok) throw new Error(`${errorLabel} API 错误: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(messages: ChatMessage[], system: string, apiKey: string): Promise<string> {
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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API 错误: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callModel(
  model: AIModel,
  messages: ChatMessage[],
  system: string,
  apiKey: string
): Promise<string> {
  switch (model) {
    case 'gpt-4o':
      return callOpenAICompatible('https://api.openai.com/v1', 'gpt-4o', messages, system, apiKey, 'OpenAI', true);
    case 'deepseek-chat':
      return callOpenAICompatible(
        'https://api.deepseek.com',
        'deepseek-chat',
        messages,
        system,
        apiKey,
        'DeepSeek',
        false
      );
    case 'gemini-flash':
      return callGemini(messages, system, apiKey);
    case 'claude-sonnet':
    default:
      return callAnthropic(messages, system, apiKey);
  }
}

export async function sendChatMessage(
  messages: ChatMessage[],
  contextSummary: string,
  model: AIModel,
  apiKey: string | null
): Promise<AIReply> {
  if (!apiKey) {
    const label = AI_MODELS.find((m) => m.id === model)?.label ?? model;
    throw new Error(`还没有设置 ${label} 的 API Key，去聊天页右上角 ⋯ → 设置里填一下`);
  }

  const system = buildSystemPrompt(contextSummary);
  const raw = await callModel(model, messages, system, apiKey);
  const { text, actions } = parseActions(raw);
  return { text, actions };
}

/**
 * 通用的一次性 AI 调用：给一段系统提示 + 一段用户内容，拿纯文本回复。
 * 给"每日总结"这种不是聊天、但也要调用 AI 的场景用。
 */
export async function callAIOnce(
  systemPrompt: string,
  userPrompt: string,
  model: AIModel,
  apiKey: string | null
): Promise<string> {
  if (!apiKey) {
    const label = AI_MODELS.find((m) => m.id === model)?.label ?? model;
    throw new Error(`还没有设置 ${label} 的 API Key`);
  }
  const fakeMessage: ChatMessage = {
    id: 'once',
    role: 'user',
    content: userPrompt,
    model: null,
    created_at: new Date().toISOString(),
  };
  return callModel(model, [fakeMessage], systemPrompt, apiKey);
}
