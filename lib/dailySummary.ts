import { supabase } from './supabase';
import { callAIOnce, type AIModel } from './ai';
import { fetchTimelineForDate } from './timeline';
import { fetchWorries } from './worries';
import type { DailySummary } from '../types';

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function fetchDailySummary(date: Date): Promise<DailySummary | null> {
  const { data, error } = await supabase
    .from('daily_summaries')
    .select('*')
    .eq('date', toDateKey(date))
    .maybeSingle();
  if (error) throw error;
  return data;
}

const SUMMARY_SYSTEM_PROMPT = `你是西米OS里帮西米整理每日总结的助手。
根据给你的当天时间轴记录和烦恼列表，输出一段 JSON（只要 JSON，不要别的文字，不要 markdown 代码块），字段：
{
  "body_summary": "身体状况一句话总结，没有相关记录就写'今天没记身体相关的'",
  "sleep_summary": "睡眠情况一句话",
  "food_summary": "饮食情况一句话",
  "emotion_summary": "情绪状态一句话，语气温暖体贴",
  "worry_summary": "烦恼情况一句话，没有就写'今天没什么烦恼'",
  "plan_summary": "计划完成情况一句话",
  "hp": 0到100之间的整数，代表今天的身体/日常状态,
  "mp": 0到100之间的整数，代表今天的情绪/精神状态
}`;

export async function generateDailySummary(date: Date, model: AIModel, apiKey: string | null): Promise<DailySummary> {
  const [entries, worries] = await Promise.all([fetchTimelineForDate(date), fetchWorries()]);

  const entriesText = entries.length
    ? entries
        .map((e) => `${new Date(e.start_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} [${e.category}] ${e.description ?? ''}`)
        .join('\n')
    : '（这天没有时间轴记录）';

  const activeWorries = worries.filter((w) => w.status === 'active');
  const worriesText = activeWorries.length
    ? activeWorries.map((w) => `- ${w.content}`).join('\n')
    : '（暂无进行中的烦恼）';

  const userPrompt = `日期：${toDateKey(date)}\n\n时间轴：\n${entriesText}\n\n进行中的烦恼：\n${worriesText}`;

  const raw = await callAIOnce(SUMMARY_SYSTEM_PROMPT, userPrompt, model, apiKey);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 没有返回能解析的总结');
  const parsed = JSON.parse(jsonMatch[0]);

  const { data, error } = await supabase
    .from('daily_summaries')
    .upsert(
      {
        date: toDateKey(date),
        body_summary: parsed.body_summary ?? null,
        sleep_summary: parsed.sleep_summary ?? null,
        food_summary: parsed.food_summary ?? null,
        emotion_summary: parsed.emotion_summary ?? null,
        worry_summary: parsed.worry_summary ?? null,
        plan_summary: parsed.plan_summary ?? null,
        hp: typeof parsed.hp === 'number' ? parsed.hp : null,
        mp: typeof parsed.mp === 'number' ? parsed.mp : null,
      },
      { onConflict: 'date' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
