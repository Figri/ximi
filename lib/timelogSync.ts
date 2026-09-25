import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const K_SYNC_QUEUE = 'timelog_sync_queue_v1';
type SyncItem = { table: string; op: 'upsert' | 'delete'; row: any };

// 队列只在内存里维护一份（懒加载一次），所有增删都是同步操作，不会有并发的
// 读-改-写互相覆盖；AsyncStorage 只是每次变更后顺手做的持久化快照，不是每次
// 操作都要回读的"真相来源"。避免了并发调用enqueueSync/flushSync时互相踩踏
// 导致排队项凭空消失的问题。
let queue: SyncItem[] | null = null;
let loadingPromise: Promise<SyncItem[]> | null = null;
let flushing = false;

async function ensureQueueLoaded(): Promise<SyncItem[]> {
  if (queue !== null) return queue;
  if (!loadingPromise) {
    loadingPromise = AsyncStorage.getItem(K_SYNC_QUEUE).then((raw) => {
      const loaded: SyncItem[] = raw ? JSON.parse(raw) : [];
      queue = loaded;
      return loaded;
    });
  }
  return loadingPromise;
}

export async function enqueueSync(item: SyncItem): Promise<void> {
  const q = await ensureQueueLoaded();
  q.push(item);
  await AsyncStorage.setItem(K_SYNC_QUEUE, JSON.stringify(q));
  flushSync();
}

export async function flushSync(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const q = await ensureQueueLoaded();
    while (q.length > 0) {
      const item = q[0];
      try {
        if (item.op === 'upsert') {
          const { error } = await supabase.from(item.table).upsert(item.row);
          if (error) throw error;
        } else {
          const { error } = await supabase.from(item.table).delete().eq('id', item.row.id);
          if (error) throw error;
        }
        q.shift();
        await AsyncStorage.setItem(K_SYNC_QUEUE, JSON.stringify(q));
      } catch {
        break; // 多半离线，留着下次补
      }
    }
  } finally {
    flushing = false;
  }
}
