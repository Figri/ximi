import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Action, Card, TodoItem } from '../types';
import { getActionDecay } from './decay';

const TIMER_IDENTIFIER_PREFIX = 'ximi-timer-';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const id = notification.request.identifier;
    const isTimer = id.startsWith(TIMER_IDENTIFIER_PREFIX);
    const kind = (notification.request.content.data as any)?.kind;
    const isLingRemind = id.startsWith('ling-') && (kind === 'reminder' || kind === 'play_end');
    // 这里只在 App 开着时才会走到：「想你了」这时不弹（她就在），由灵的运行时作废重排
    const isMissYouWhileOpen = id.startsWith('ling-') && kind === 'miss_you';
    return {
      shouldShowBanner: !isMissYouWhileOpen,
      shouldShowList: !isMissYouWhileOpen,
      shouldPlaySound: isTimer || isLingRemind, // 计时器和约定提醒要响，灵平常说话不吵
      shouldSetBadge: false,
    };
  },
});

/** 灵的两个通知渠道：平常说话（想你了、顺口一提）和约定提醒（到点要响） */
export async function ensureLingChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('ling', {
    name: '灵的消息',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync('ling-remind', {
    name: '约定提醒',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('ximi-default', {
    name: '西米OS 日常提醒',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync('ximi-timer', {
    name: '西米OS 计时器',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  await ensureAndroidChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
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

  // 权限请求挪到这里"真的要发通知了才问"，不在app一启动就弹系统权限框
  const granted = await ensureNotificationPermission();
  if (!granted) return;

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

/** 工具箱计时器用：N 秒后本地提醒一次（响铃+震动），返回 identifier 方便中途取消 */
export async function scheduleTimerNotification(label: string, seconds: number): Promise<string> {
  const identifier = `${TIMER_IDENTIFIER_PREFIX}${Date.now()}`;
  const granted = await ensureNotificationPermission();
  if (!granted) return identifier; // 没给权限就不响铃，identifier正常返回让调用方能照常取消计时器
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: '⏱ 计时到了',
      body: label,
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: 'ximi-timer' } : {}),
    },
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

const todoNotificationIdKey = (todoId: string) => `ximi-todo-${todoId}`;

/**
 * 事项提醒：调用方(useTodoReminders)算好"下一次该提醒的具体时间点"传进来，
 * 这里只管调度一次性DATE trigger。重复事项的"下一次"由调用方周期性重算并
 * 重新调用这个函数来实现，不在这里做原生的daily/weekly/monthly trigger——
 * 这样"每月最后一天"这种原生trigger类型表达不了的场景也能用同一套机制处理。
 */
export async function scheduleTodoReminder(item: TodoItem, occurrence: Date): Promise<void> {
  const identifier = todoNotificationIdKey(item.id);
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: '该做了',
      body: item.content,
      ...(Platform.OS === 'android' ? { channelId: 'ximi-default' } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: occurrence },
  });
}

export async function cancelTodoReminder(todoId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(todoNotificationIdKey(todoId)).catch(() => {});
}
