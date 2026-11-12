import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureStore } from './aiSettings';

let client: SupabaseClient | null = null;
export function osCloud(): SupabaseClient {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes('xxx.')) throw new Error('尚未配置西米OS云端项目');
  client = createClient(url, key, { auth: {
    storageKey: 'ximi_os_auth_v1',
    storage: { getItem: secureStore.get, setItem: secureStore.set, removeItem: secureStore.delete },
    autoRefreshToken: true, persistSession: true, detectSessionInUrl: false,
  } });
  return client;
}
