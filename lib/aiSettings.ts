import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AIModel } from './ai';

// AI provider 的 key 全部存在设备本地的安全存储里（iOS Keychain / Android Keystore），
// 不进 .env、不进 git。在 app 里设置页填了立刻生效，换手机要重新填。
// 网页预览没有安全存储，退回到浏览器本地存储（只用于开发时在浏览器里测）。

const KEY_PREFIX = 'ximi_ai_key_';
const SELECTED_MODEL_KEY = 'ximi_selected_model';
const MODEL_OPTION_PREFIX = 'ximi_model_option_';

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(`secure_${key}`);
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') return AsyncStorage.setItem(`secure_${key}`, value);
  await SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') return AsyncStorage.removeItem(`secure_${key}`);
  await SecureStore.deleteItemAsync(key);
}

export const secureStore = { get: secureGet, set: secureSet, delete: secureDelete };

export async function getApiKey(model: AIModel): Promise<string | null> {
  return secureGet(KEY_PREFIX + model);
}

export async function setApiKey(model: AIModel, key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await secureDelete(KEY_PREFIX + model);
    return;
  }
  await secureSet(KEY_PREFIX + model, trimmed);
}

export async function getSelectedModel(): Promise<AIModel | null> {
  const value = await secureGet(SELECTED_MODEL_KEY);
  return (value as AIModel | null) ?? null;
}

export async function setSelectedModel(model: AIModel): Promise<void> {
  await secureSet(SELECTED_MODEL_KEY, model);
}

/** 模型的附加选项：deepseek = 实际能用的模型名，doubao = 火山方舟的模型名或接入点 ID */
export async function getModelOption(name: 'deepseek' | 'doubao'): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(MODEL_OPTION_PREFIX + name);
  } catch {
    return null;
  }
}

export async function setModelOption(name: 'deepseek' | 'doubao', value: string): Promise<void> {
  await AsyncStorage.setItem(MODEL_OPTION_PREFIX + name, value.trim());
}

/** 掩码展示，比如 sk-ant-abc123xyz -> sk-a******xyz，用于设置页显示"已设置" */
export function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}${'*'.repeat(6)}${key.slice(-4)}`;
}
