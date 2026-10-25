import AsyncStorage from '@react-native-async-storage/async-storage';

// 以前这里把本地的时间、事项、日程、底栏改动排队上传到 Supabase。
// 西米OS 2.0 起不再用 Supabase（数据只在手机本地，云端备份改走 Notion，见 lib/notion），
// 这两个函数保留同样的签名，调用方不用改；排队直接丢弃。
// 老版本攒下的上传队列（库暂停期间一直传不上去，越积越多）在第一次 flush 时清掉。

const K_SYNC_QUEUE = 'timelog_sync_queue_v1';
let cleared = false;

export async function enqueueSync(_item: { table: string; op: 'upsert' | 'delete'; row: any }): Promise<void> {
  // 不再上云
}

export async function flushSync(): Promise<void> {
  if (cleared) return;
  cleared = true;
  try {
    await AsyncStorage.removeItem(K_SYNC_QUEUE);
  } catch {}
}
