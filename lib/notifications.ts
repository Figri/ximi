import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Action, Card } from '../types';
import { getActionDecay } from './decay';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  if (requested.granted) return true;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('ximi-default', {
      name: '西米OS 提醒',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  return false;
}

const notificationIdKey = (actionId: string) => `ximi-action-${actionId}`;

/**
 * 根据卡片当前的衰减状态，安排/取消提醒：
 * - 变黄：提前一次温和提醒
 * - 变红：立刻提醒（下一次检查周期触发）
 * 由调用方（例如每 15 分钟跑一次的后台任务）传入卡片 + 动作 + 最近完成时间。
 */
export async function scheduleDecayNotification(
  card: Card,
  action: Action,
  lastCompletedAt: Date | null
): Promise<void> {
  const identifier = notificationIdKey(action.id);
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  const decay = getActionDecay(action, lastCompletedAt);
  if (decay.status === 'green') return;

  const title = decay.status === 'red' ? `${card.name} 超时了` : `${card.name} 该做了`;
  const body = `${action.name} · ${decay.timeLeft}`;

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body },
    trigger: null, // 立即触发；调用方负责节流（例如每张卡每天最多提醒一次）
  });
}

export async function cancelActionNotification(actionId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationIdKey(actionId)).catch(() => {});
}

/** 工具箱计时器用：N 秒后本地提醒一次，返回 identifier 方便中途取消 */
export async function scheduleTimerNotification(label: string, seconds: number): Promise<string> {
  const identifier = `ximi-timer-${Date.now()}`;
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title: '计时到了', body: label },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
    },
  });
  return identifier;
}

export async function cancelTimerNotification(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
}
