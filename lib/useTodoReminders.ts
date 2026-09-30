import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { loadItems } from './todoLocal';
import { nextTodoOccurrence } from './todo';
import { cancelTodoReminder, scheduleTodoReminder } from './notifications';

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 跟衰减提醒用同一个检查周期

/**
 * v1：跟useDecayNotifications同一套基建——前台定时器+AppState监听周期性检查，
 * 不是真正的后台推送。每次检查给每条开了提醒的事项算一次"下一次该提醒的
 * 具体时间点"(nextTodoOccurrence，纯JS日期计算)，用一次性DATE trigger调度；
 * 时间点没变就不重复调度，事项被删或提醒被关掉就取消对应的调度。
 * 这个"周期性重算+调度下一次"的设计天然处理了"每月最后一天"这类原生
 * daily/weekly/monthly trigger类型表达不了的重复规则。
 */
export function useTodoReminders() {
  const scheduledFor = useRef<Record<string, number>>({}); // todoId -> 已排的occurrence时间戳

  useEffect(() => {
    const check = async () => {
      const items = await loadItems();
      const now = new Date();
      const currentIds = new Set<string>();

      for (const item of items) {
        currentIds.add(item.id);
        if (!item.reminder_enabled || !item.reminder_time) {
          if (scheduledFor.current[item.id] != null) {
            await cancelTodoReminder(item.id);
            delete scheduledFor.current[item.id];
          }
          continue;
        }
        const occurrence = nextTodoOccurrence(item, now);
        if (!occurrence) continue;
        const ts = occurrence.getTime();
        if (scheduledFor.current[item.id] === ts) continue; // 已经排过这个时间点了
        await scheduleTodoReminder(item, occurrence);
        scheduledFor.current[item.id] = ts;
      }

      for (const id of Object.keys(scheduledFor.current)) {
        if (!currentIds.has(id)) {
          await cancelTodoReminder(id);
          delete scheduledFor.current[id];
        }
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
