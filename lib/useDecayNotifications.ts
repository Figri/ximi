import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { getActionDecay } from './decay';
import { cancelActionNotification, ensureNotificationPermission, scheduleDecayNotification } from './notifications';
import { useCardStore } from './store';

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15分钟
const REMIND_THROTTLE_MS = 12 * 60 * 60 * 1000; // 同一张卡12小时内只提醒一次

/**
 * v1：在前台用定时器 + AppState 监听做衰减检查（Expo Go 兼容，无需原生后台任务）。
 * 真正的后台推送需要 development build + expo-background-fetch/expo-task-manager，留到后面加。
 */
export function useDecayNotifications() {
  const lastRemindedAt = useRef<Record<string, number>>({});

  useEffect(() => {
    ensureNotificationPermission();

    const check = async () => {
      let { cards, actions, lastCompletions } = useCardStore.getState();
      if (cards.length === 0) {
        await useCardStore.getState().fetchAll();
        ({ cards, actions, lastCompletions } = useCardStore.getState());
      }
      const byCard: Record<string, typeof actions> = {};
      for (const a of actions) {
        byCard[a.card_id] = byCard[a.card_id] ?? [];
        byCard[a.card_id].push(a);
      }

      const now = Date.now();
      for (const card of cards) {
        const primary = (byCard[card.id] ?? []).find((a) => a.is_primary);
        if (!primary) continue;

        const lastCompletedAt = lastCompletions[primary.id] ? new Date(lastCompletions[primary.id]) : null;
        const decay = getActionDecay(primary, lastCompletedAt);

        if (decay.status === 'green') {
          if (lastRemindedAt.current[primary.id]) {
            await cancelActionNotification(primary.id);
            delete lastRemindedAt.current[primary.id];
          }
          continue;
        }

        const last = lastRemindedAt.current[primary.id] ?? 0;
        if (now - last < REMIND_THROTTLE_MS) continue;

        await scheduleDecayNotification(card, primary, lastCompletedAt);
        lastRemindedAt.current[primary.id] = now;
      }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);
}
