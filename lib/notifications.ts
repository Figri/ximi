import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 计时器到点的提醒还在这里；事项提醒、例行变黄的推送 2.0 起都改成灵来说（lib/ling/proactive.ts）。
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

const K_ASKED_ONCE = 'notif_perm_asked_v1';

/**
 * 通知权限。ask：
 * - 'always'：你自己点的（开计时器、提醒自检），没权限就问；
 * - 'once'：灵排消息时，整个安装只主动问这一次，而且只在 App 开在前台时问；
 * - 'never'：只看不问。
 * 以前每次排消息都问，没给权限的话系统弹窗会一遍遍弹，屏幕跟着一闪一闪。
 */
export async function ensureNotificationPermission(ask: 'always' | 'once' | 'never' = 'always'): Promise<boolean> {
  await ensureAndroidChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (ask === 'never' || current.canAskAgain === false) return false;
  if (ask === 'once') {
    if (AppState.currentState !== 'active') return false;
    if (await AsyncStorage.getItem(K_ASKED_ONCE).catch(() => '1')) return false;
    await AsyncStorage.setItem(K_ASKED_ONCE, '1').catch(() => {});
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

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
    },
    // 安卓的通知渠道要写在 trigger 里（写在 content 里会被忽略，响铃用不上计时器渠道）
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
      channelId: 'ximi-timer',
    },
  });
  return identifier;
}

export async function cancelTimerNotification(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
}
