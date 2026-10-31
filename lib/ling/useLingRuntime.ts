import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { cancelLegacyNotifications, deliverDue, dropOutboxItem, refreshDrafts, rescheduleAll } from './proactive';
import { useLingSettings } from './settings';
import { useLingThread } from './thread';
import { syncAll } from '../notion/sync';
import { useLingLock } from './lock';
import { turnOffOldRemindersOnce } from '../reminderReset';
import { uiReady } from '../uiSettings';

const K_LEGACY_CANCELLED = 'ling_legacy_cancelled_v1';
const DRAFT_REFRESH_MS = 3 * 3600 * 1000;
/** App 开着时隔一阵按「现在」重排一次，「想你了」就永远落在她最后一次在的 3 小时以后 */
const HEARTBEAT_MS = 30 * 60 * 1000;

/** 打开 App：先把已经发出去的放进对话，再让灵重写一批要说的话，最后按「现在离开」重排 */
async function onActive() {
  await deliverDue().catch(() => 0);
  await rescheduleAll().catch(() => []);
  refreshDrafts()
    .then(() => rescheduleAll())
    .catch(() => {});
  syncAll().catch(() => {});
}

function isLingNotification(identifier: string | undefined): boolean {
  return !!identifier && identifier.startsWith('ling-');
}

/**
 * 灵在后台的那部分：投递、预写、排程、点通知进对话。在根布局里调一次。
 * 取代了老版本的 useDecayNotifications（变黄就推送）和 useTodoReminders（系统腔的提醒）。
 */
export function useLingRuntime() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await useLingSettings.getState().load();
      await useLingThread.getState().load();
      if (!(await AsyncStorage.getItem(K_LEGACY_CANCELLED))) {
        await cancelLegacyNotifications();
        await AsyncStorage.setItem(K_LEGACY_CANCELLED, '1');
      }
      // 10/31：旧的事项 / 习惯 / 日程提醒先全关（只跑一次，原来的时间留了底），排程之前做
      await turnOffOldRemindersOnce().catch(() => 0);
      if (!cancelled) await onActive();
    })();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onActive();
      else if (state === 'background') {
        rescheduleAll().catch(() => {});
        // 灵空间锁：一离开 App 就重新锁上
        useLingLock.getState().lock();
      }
    });

    const timer = setInterval(() => {
      refreshDrafts().catch(() => {});
    }, DRAFT_REFRESH_MS);
    const heartbeat = setInterval(() => {
      if (AppState.currentState === 'active') rescheduleAll().catch(() => {});
    }, HEARTBEAT_MS);

    // App 开着的时候灵的通知响了：马上放进对话。「想你了」例外——她就在这儿，作废重排
    const recvSub =
      Platform.OS === 'web'
        ? null
        : Notifications.addNotificationReceivedListener((n) => {
            if (!isLingNotification(n.request.identifier)) return;
            const data = n.request.content.data as { kind?: string; lingOutboxId?: string } | undefined;
            if (data?.kind === 'miss_you' && data.lingOutboxId) {
              dropOutboxItem(data.lingOutboxId)
                .then(() => rescheduleAll())
                .catch(() => {});
            } else {
              deliverDue().catch(() => 0);
            }
          });

    // 点了灵的通知：进对话
    const respSub =
      Platform.OS === 'web'
        ? null
        : Notifications.addNotificationResponseReceivedListener((resp) => {
            if (isLingNotification(resp.notification.request.identifier)) {
              deliverDue()
                .catch(() => 0)
                .finally(() => uiReady.then(() => router.push('/chat')));
            }
          });

    if (Platform.OS !== 'web') {
      Notifications.getLastNotificationResponseAsync()
        .then((resp) => {
          if (resp && isLingNotification(resp.notification.request.identifier)) uiReady.then(() => router.push('/chat'));
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      appSub.remove();
      clearInterval(timer);
      clearInterval(heartbeat);
      recvSub?.remove();
      respSub?.remove();
    };
  }, []);
}
