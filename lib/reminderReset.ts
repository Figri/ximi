import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadItems as loadTodoItems, saveItems as saveTodoItems } from './todoLocal';
import { loadItems as loadScheduleItems, saveItems as saveScheduleItems } from './scheduleLocal';
import { fetchActions, updateAction } from './cards';

// 10/31 西米：以前的提醒先全关了，她自己挑要提醒的再开（只留喝水和灵发消息）。
// 只跑一次：事项的「提醒」开关关掉（时间留着，再打开还是原来的点）；习惯「到日子提醒我」和日程的提醒时间清掉。
// 关之前每一条原来是什么都存进 reminders_off_backup_v1（备份文件里也有），要找回来能对着恢复；
// 习惯编辑页再打开提醒时，默认填回原来的时间。

const K_DONE = 'reminders_reset_v1';
export const K_REMINDER_BACKUP = 'reminders_off_backup_v1';

export interface ReminderBackup {
  at: string;
  todos: { id: string; content: string; reminder_time: string | null }[];
  habits: { actionId: string; cardId: string; remind_at: string }[];
  schedule: { id: string; title: string; remind_at: string }[];
}

export async function loadReminderBackup(): Promise<ReminderBackup | null> {
  try {
    const raw = await AsyncStorage.getItem(K_REMINDER_BACKUP);
    return raw ? (JSON.parse(raw) as ReminderBackup) : null;
  } catch {
    return null;
  }
}

/** 习惯原来设的「到日子提醒我」几点（编辑页再打开提醒时用） */
export async function previousHabitRemindAt(actionId: string): Promise<string | null> {
  const b = await loadReminderBackup();
  return b?.habits.find((h) => h.actionId === actionId)?.remind_at ?? null;
}

/** 关掉旧提醒，返回关了几条；跑过就不再跑 */
export async function turnOffOldRemindersOnce(): Promise<number> {
  if (await AsyncStorage.getItem(K_DONE)) return 0;
  const backup: ReminderBackup = { at: new Date().toISOString(), todos: [], habits: [], schedule: [] };

  const todos = await loadTodoItems();
  for (const t of todos) if (t.reminder_enabled) backup.todos.push({ id: t.id, content: t.content, reminder_time: t.reminder_time });
  const actions = await fetchActions().catch(() => []);
  for (const a of actions) if (a.remind_at) backup.habits.push({ actionId: a.id, cardId: a.card_id, remind_at: a.remind_at });
  const schedule = await loadScheduleItems();
  for (const s of schedule) if (s.remind_at) backup.schedule.push({ id: s.id, title: s.title, remind_at: s.remind_at });

  // 先存备份，再动数据：中途断了下次还会再跑（K_DONE 最后才写），备份不会被空的覆盖
  const old = await loadReminderBackup();
  if (!old || backup.todos.length + backup.habits.length + backup.schedule.length > 0) {
    await AsyncStorage.setItem(K_REMINDER_BACKUP, JSON.stringify(backup));
  }
  if (backup.todos.length) await saveTodoItems(todos.map((t) => (t.reminder_enabled ? { ...t, reminder_enabled: false } : t)));
  for (const h of backup.habits) await updateAction(h.actionId, { remind_at: null });
  if (backup.schedule.length) await saveScheduleItems(schedule.map((s) => (s.remind_at ? { ...s, remind_at: null } : s)));
  await AsyncStorage.setItem(K_DONE, new Date().toISOString());
  return backup.todos.length + backup.habits.length + backup.schedule.length;
}
