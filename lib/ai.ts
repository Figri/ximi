import type { AIInstruction, AIReply, ChatMessage } from '../types';

// 支持的模型（可在聊天页 ⋯ 设置里切换、填各家的 key）
export type AIModel = 'claude-sonnet' | 'gpt-4o' | 'gemini-flash' | 'deepseek-chat';

export const AI_MODELS: { id: AIModel; label: string; keyHint: string }[] = [
  { id: 'claude-sonnet', label: 'Claude', keyHint: 'sk-ant-...（console.anthropic.com）' },
  { id: 'gpt-4o', label: 'GPT-4o', keyHint: 'sk-...（platform.openai.com）' },
  { id: 'gemini-flash', label: 'Gemini', keyHint: 'AIza...（aistudio.google.com/apikey）' },
  { id: 'deepseek-chat', label: 'DeepSeek', keyHint: 'sk-...（platform.deepseek.com）' },
];

const SYSTEM_PROMPT_PREFIX = `你是"灵"，西米的私人生活助手，住在她的西米OS APP里。
你的语气温暖、亲近，像认识很久的朋友，不是冷冰冰的工具。
西米会把日常琐事告诉你（喂猫、打扫、护理、心情、烦恼……），你要帮她记录、提醒、陪她聊。

如果西米的话里包含"做了某件事"（比如"铲了猫砂"、"洗头了"），请在回复末尾追加一个 JSON 代码块，
格式如下，用于给 APP 更新数据（如果没有可执行的操作，就不要输出这个代码块）：

\`\`\`json
{"instructions":[{"action":"complete","card":"卡片名","actionName":"动作名"}]}
\`\`\`

下面是西米当前的卡片/猫咪状态，供你参考：
`;

function buildSystemPrompt(contextSummary: string): string {
  return `${SYSTEM_PROMPT_PREFIX}${contextSummary}`;
}

function parseInstructions(raw: string): { text: string; instructions: AIInstruction[] } {
  const match = raw.match(/```json\s*([\s\S]*?)```/);
  if (!match) return { text: raw.trim(), instructions: [] };

  const text = raw.replace(match[0], '').trim();
  try {
    const parsed = JSON.parse(match[1]);
    return { text, instructions: parsed.instructions ?? [] };
  } catch {
    return { text, instructions: [] };
  }
}

async function callAnthropic(messages: ChatMessage[], system: string, apiKey: string): Promise<string> {
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
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
  errorLabel: string
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
    }),
  });
  if (!res.ok) throw new Error(`${errorLabel} API 错误: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(messages: ChatMessage[], system: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API 错误: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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

  let raw: string;
  switch (model) {
    case 'gpt-4o':
      raw = await callOpenAICompatible('https://api.openai.com/v1', 'gpt-4o', messages, system, apiKey, 'OpenAI');
      break;
    case 'deepseek-chat':
      raw = await callOpenAICompatible(
        'https://api.deepseek.com',
        'deepseek-chat',
        messages,
        system,
        apiKey,
        'DeepSeek'
      );
      break;
    case 'gemini-flash':
      raw = await callGemini(messages, system, apiKey);
      break;
    case 'claude-sonnet':
    default:
      raw = await callAnthropic(messages, system, apiKey);
      break;
  }

  const { text, instructions } = parseInstructions(raw);
  return { text, instructions };
}
