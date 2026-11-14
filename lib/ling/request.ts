import { fetch as streamFetch } from 'expo/fetch';
import { callModel, type AIModel } from '../ai';
import type { CompanionConfig } from './core';
export interface Usage {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
}
export async function requestCompanion(model: AIModel, key: string, c: CompanionConfig, messages: {
    role: 'user' | 'assistant';
    content: string;
}[], system: string, options: {
    signal?: AbortSignal;
    onText?: (s: string) => void;
} = {}) {
    if (model !== 'deepseek-chat') {
        if (options.signal?.aborted)
            throw new Error('已停止');
        const text = await callModel(model, messages, system, key, c.maxOutput);
        if (options.signal?.aborted)
            throw new Error('已停止');
        options.onText?.(text);
        return { text, usage: {} as Usage };
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort);
    if (options.signal?.aborted)
        abort();
    const timeout = setTimeout(abort, 120000);
    let text = '', usage: Usage = {},complete=false,truncated=false;
    try {
        const res = await streamFetch('https://api.deepseek.com/chat/completions', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: c.modelName, thinking: { type: c.thinking ? 'enabled' : 'disabled' }, max_tokens: c.maxOutput, stream: true, stream_options: { include_usage: true }, messages: [{ role: 'system', content: system }, ...messages] }) });
        if (!res.ok)
            throw new Error(`DeepSeek请求失败（${res.status}），请检查模型和密钥`);
        const reader = res.body?.getReader();
        if (!reader) {
            const data = await res.json();
            text = data.choices?.[0]?.message?.content ?? '';
            options.onText?.(text);
            return { text, usage: data.usage ?? {} };
        }
        const decoder = new TextDecoder();
        let buffer = '';
        const consume = (line: string) => { if (!line.startsWith('data:'))
            return; const s = line.slice(5).trim(); if(s==='[DONE]'){complete=true;return;}if(!s)return; let data: any; try {
            data = JSON.parse(s);
        }
        catch {
            throw new Error('回复数据中断，请重试');
        } if (data.error)
            throw new Error('模型生成失败，请重试'); if (data.usage)
            usage = data.usage;if(data.choices?.[0]?.finish_reason){complete=true;truncated=data.choices[0].finish_reason==='length';} const part = data.choices?.[0]?.delta?.content; if (part) {
            text += part;
            options.onText?.(text.split('<ling-')[0]);
        } };
        while (true) {
            const result = await reader.read();
            if (result.done)
                break;
            buffer += decoder.decode(result.value, { stream: true });
            let i;
            while ((i = buffer.indexOf('\n')) >= 0) {
                consume(buffer.slice(0, i).replace(/\r$/, ''));
                buffer = buffer.slice(i + 1);
            }
        }
        buffer += decoder.decode();
        if (buffer.trim())
            consume(buffer.trim());
        if(!complete)throw new Error('回复连接中断，可重试；你的消息已保留');
        if (!text.trim())
            throw new Error('没有收到回复，可以重试');
        return { text, usage,truncated };
    }
    catch (e) {
        if (options.signal?.aborted)
            return { text: text.split('<ling-')[0], usage, stopped: true };
        if (controller.signal.aborted)
            throw new Error('模型响应超时，已保留你的消息，可重试');
        throw e;
    }
    finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', abort);
    }
}
