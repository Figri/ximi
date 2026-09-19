import * as SecureStore from 'expo-secure-store';
import type { AIModel } from './ai';

// AI provider 的 key 全部存在设备本地的安全存储里（iOS Keychain / Android Keystore），
// 不进 .env、不进 Supabase、不进 git。在 app 里「设置」页填了立刻生效，换手机要重新填。

const KEY_PREFIX = 'ximi_ai_key_';
const SELECTED_MODEL_KEY = 'ximi_selected_model';

export async function getApiKey(model: AIModel): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_PREFIX + model);
}

export async function setApiKey(model: AIModel, key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await SecureStore.deleteItemAsync(KEY_PREFIX + model);
    return;
  }
  await SecureStore.setItemAsync(KEY_PREFIX + model, trimmed);
}

export async function getSelectedModel(): Promise<AIModel | null> {
  const value = await SecureStore.getItemAsync(SELECTED_MODEL_KEY);
  return (value as AIModel | null) ?? null;
}

export async function setSelectedModel(model: AIModel): Promise<void> {
  await SecureStore.setItemAsync(SELECTED_MODEL_KEY, model);
}

/** 掩码展示，比如 sk-ant-abc123xyz -> sk-a******xyz，用于设置页显示"已设置" */
export function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}${'*'.repeat(6)}${key.slice(-4)}`;
}
