import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchLogsForDate, formatLogDuration } from '../../lib/timelog';
import { useTimeLogStore } from '../../lib/timelogStore';
import { AddLogModal } from './AddLogModal';
import type { TimeCategory, TimeLog, TimeTag } from '../../types';

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function timeOfDayIcon(hour: number): string {
  if (hour < 4) return '🌑';
  if (hour < 6) return '🌙';
  if (hour < 8) return '🌅';
  if (hour < 17) return '☀️';
  return '🌆';
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

interface TimeAxisViewProps {
  date: Date;
  refreshKey: number;
  onChanged: () => void;
}

interface ModalState {
  log: TimeLog | null;
  categoryId: string | null;
  start: Date;
  end: Date;
}

export function TimeAxisView({ date, refreshKey, onChanged }: TimeAxisViewProps) {
  const { categories, tags, fetchAll } = useTimeLogStore();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [localRefresh, setLocalRefresh] = useState(0);
  const [modalState, setModalState] = useState<ModalState | null>(null);

  useEffect(() => {
    if (categories.length === 0) fetchAll();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchLogsForDate(date)
      .then((rows) => setLogs([...rows].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())))
      .finally(() => setLoading(false));
  }, [date, refreshKey, localRefresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const categoryById: Record<string, TimeCategory> = {};
  for (const c of categories) categoryById[c.id] = c;
  const tagById: Record<string, TimeTag> = {};
  for (const t of tags) tagById[t.id] = t;

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const isToday = isSameDay(date, now);
  const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
  const gapStart = lastLog ? new Date(lastLog.end_time) : dayStart;
  const gapMinutes = isToday ? Math.max(0, (now.getTime() - gapStart.getTime()) / 60000) : 0;

  function handleQuickAdd() {
    setModalState({ log: null, categoryId: null, start: gapStart, end: now });
  }

  function handleFabAdd() {
    setModalState({ log: null, categoryId: null, start: new Date(Date.now() - 15 * 60_000), end: new Date() });
  }

  function handleCardPress(log: TimeLog) {
    setModalState({ log, categoryId: log.category_id, start: new Date(log.start_time), end: new Date(log.end_time) });
  }

  function handleModalSaved() {
    setModalState(null);
    setLocalRefresh((k) => k + 1);
    onChanged();
  }

  return (
    <View style={styles.container}>
      {isToday && (
        <View style={styles.nowRow}>
          <View style={styles.nowTimeCol}>
            <Text style={styles.nowTimeText}>{formatClock(gapStart)}</Text>
            <Text style={styles.nowTimeTextMuted}>{formatClock(now)}</Text>
          </View>
          <Pressable style={styles.nowAddBox} onPress={handleQuickAdd}>
            <Text style={styles.nowAddText}>{formatLogDuration(gapMinutes)}</Text>
            <View style={styles.nowAddRight}>
              <View style={styles.nowAddIconCircle}>
                <Text style={styles.nowAddIconText}>＋</Text>
              </View>
              <Text style={styles.nowAddLabel}>点击记录</Text>
            </View>
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
          {logs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyText}>这天还没有记录</Text>
            </View>
          ) : (
            logs.map((log) => {
              const start = new Date(log.start_time);
              const end = new Date(log.end_time);
              const durationMin = (end.getTime() - start.getTime()) / 60000;
              const cat = log.category_id ? categoryById[log.category_id] : null;
              return (
                <Pressable key={log.id} style={styles.row} onPress={() => handleCardPress(log)}>
                  <View style={styles.timeCol}>
                    <Text style={styles.timeText}>{formatClock(start)}</Text>
                    <Text style={styles.timeTextMuted}>{formatClock(end)}</Text>
                  </View>
                  <View style={styles.iconCol}>
                    <Text style={styles.timeIcon}>{timeOfDayIcon(start.getHours())}</Text>
                  </View>
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.durationText}>{formatLogDuration(durationMin)}</Text>
                      <View style={[styles.catBadge, { backgroundColor: cat?.color ?? colors.textMuted }]}>
                        <Text style={styles.catBadgeText}>{cat?.name ?? '未分类'}</Text>
                      </View>
                    </View>
                    {log.description && (
                      <Text style={styles.descText} numberOfLines={3}>
                        {log.description}
                      </Text>
                    )}
                    {log.tag_ids.length > 0 && (
                      <View style={styles.tagRow}>
                        {log.tag_ids.map((tid) => {
                          const t = tagById[tid];
                          if (!t) return null;
                          return (
                            <View key={tid} style={[styles.tagChip, { borderColor: t.color }]}>
                              <Text style={[styles.tagChipText, { color: t.color }]}>#{t.name}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      <Pressable style={styles.fab} onPress={handleFabAdd}>
        <Text style={styles.fabText}>＋</Text>
      </Pressable>

      <AddLogModal
        visible={!!modalState}
        log={modalState?.log}
        initialCategoryId={modalState?.categoryId}
        initialStart={modalState?.start}
        initialEnd={modalState?.end}
        onClose={() => setModalState(null)}
        onSaved={handleModalSaved}
        onDeleted={handleModalSaved}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  nowRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  nowTimeCol: { width: 44, paddingTop: 4 },
  nowTimeText: { fontSize: fontSize.tiny, color: colors.redDark, fontWeight: '700', includeFontPadding: false },
  nowTimeTextMuted: { fontSize: fontSize.tiny, color: colors.redDark, opacity: 0.6, marginTop: 4, includeFontPadding: false },
  nowAddBox: {
    flex: 1,
    marginLeft: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.redDark,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  nowAddText: { fontSize: fontSize.cardName, color: colors.redDark, fontWeight: '700' },
  nowAddRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nowAddIconCircle: {
    width: 22,
    height: 22,
    borderRadius: radius.avatar,
    backgroundColor: colors.redDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowAddIconText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  nowAddLabel: { fontSize: fontSize.body, color: colors.redDark, fontWeight: '600' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 3 },
  emptyState: { alignItems: 'center', marginTop: spacing.xl * 2 },
  emptyIcon: { fontSize: 56, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.body, color: colors.textMuted },
  row: { flexDirection: 'row', marginBottom: spacing.sm },
  timeCol: { width: 44, paddingTop: 4 },
  timeText: { fontSize: fontSize.tiny, color: colors.textPrimary, fontWeight: '600', includeFontPadding: false },
  timeTextMuted: { fontSize: fontSize.tiny, color: colors.textMuted, marginTop: 20, includeFontPadding: false },
  iconCol: { width: 24, alignItems: 'center', paddingTop: 4 },
  timeIcon: { fontSize: 14 },
  card: { flex: 1, backgroundColor: colors.card, borderRadius: radius.widget, padding: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.button },
  catBadgeText: { fontSize: fontSize.tiny, color: '#fff', fontWeight: '700' },
  durationText: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '700' },
  descText: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.xs },
  tagChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.button, borderWidth: 1 },
  tagChipText: { fontSize: fontSize.tiny, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: radius.avatar,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 24, fontWeight: '600', marginTop: -2 },
});
