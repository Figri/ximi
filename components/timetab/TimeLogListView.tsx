import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { fetchLastLogEnd, fetchLogsForDate, formatLogDuration } from '../../lib/timelog';
import { useTimeLogStore } from '../../lib/timelogStore';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { AddLogModal } from './AddLogModal';
import type { TimeCategory, TimeLog, TimeTag } from '../../types';

function timeOfDayIcon(hour: number): string {
  if (hour < 5) return '🌙';
  if (hour < 8) return '🌅';
  if (hour < 18) return '☀️';
  if (hour < 21) return '🌇';
  return '🌙';
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

interface TimeLogListViewProps {
  date: Date;
  refreshKey: number;
  onChanged?: () => void;
}

interface ModalState {
  log: TimeLog | null;
  categoryId: string | null;
  start: Date;
  end: Date;
}

export function TimeLogListView({ date, refreshKey, onChanged }: TimeLogListViewProps) {
  const { categories, tags, fetchAll } = useTimeLogStore();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [addDefaultStart, setAddDefaultStart] = useState<Date | null>(null);

  useEffect(() => {
    if (categories.length === 0) fetchAll();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchLogsForDate(date)
      .then((rows) => setLogs([...rows].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())))
      .finally(() => setLoading(false));
  }, [date, refreshKey, localRefresh]);

  const categoryById: Record<string, TimeCategory> = {};
  for (const c of categories) categoryById[c.id] = c;
  const tagById: Record<string, TimeTag> = {};
  for (const t of tags) tagById[t.id] = t;

  async function handleAddRow() {
    const lastEnd = await fetchLastLogEnd();
    const fallback = new Date(Date.now() - 15 * 60_000);
    const start = lastEnd && lastEnd.getTime() < Date.now() ? lastEnd : fallback;
    setAddDefaultStart(start);
    setModalState({ log: null, categoryId: null, start, end: new Date() });
  }

  function handleRowPress(log: TimeLog) {
    setModalState({ log, categoryId: log.category_id, start: new Date(log.start_time), end: new Date(log.end_time) });
  }

  function handleModalSaved() {
    setModalState(null);
    setAddDefaultStart(null);
    setLocalRefresh((k) => k + 1);
    onChanged?.();
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {logs.length === 0 && <Text style={styles.empty}>这天还没有记录</Text>}
          {logs.map((log) => {
            const start = new Date(log.start_time);
            const end = new Date(log.end_time);
            const durationMin = (end.getTime() - start.getTime()) / 60000;
            const cat = log.category_id ? categoryById[log.category_id] : null;
            return (
              <Pressable key={log.id} style={styles.row} onPress={() => handleRowPress(log)}>
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
                    <View style={[styles.catPill, { backgroundColor: cat?.color ?? colors.textMuted }]}>
                      <Text style={styles.catPillText}>{cat?.name ?? '未分类'}</Text>
                    </View>
                  </View>
                  {log.description && <Text style={styles.descText}>{log.description}</Text>}
                  {log.tag_ids.length > 0 && (
                    <View style={styles.tagRow}>
                      {log.tag_ids.map((tid) => {
                        const t = tagById[tid];
                        if (!t) return null;
                        return (
                          <View key={tid} style={[styles.tagChip, { backgroundColor: t.color }]}>
                            <Text style={styles.tagChipText}>#{t.name}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}

          <Pressable style={styles.addRow} onPress={handleAddRow}>
            <View style={styles.addIconCircle}>
              <Text style={styles.addIconText}>＋</Text>
            </View>
            <Text style={styles.addRowText}>点击记录</Text>
          </Pressable>
        </ScrollView>
      )}

      <AddLogModal
        visible={!!modalState}
        log={modalState?.log}
        initialCategoryId={modalState?.categoryId}
        initialStart={modalState?.start}
        initialEnd={modalState?.end}
        onClose={() => {
          setModalState(null);
          setAddDefaultStart(null);
        }}
        onSaved={handleModalSaved}
        onDeleted={handleModalSaved}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 3 },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, marginTop: spacing.xl },
  row: { flexDirection: 'row', marginBottom: spacing.sm },
  timeCol: { width: 44, paddingTop: 4 },
  timeText: { fontSize: fontSize.tiny, color: colors.textPrimary, fontWeight: '600', includeFontPadding: false },
  timeTextMuted: { fontSize: fontSize.tiny, color: colors.textMuted, marginTop: 20, includeFontPadding: false },
  iconCol: { width: 24, alignItems: 'center', paddingTop: 4 },
  timeIcon: { fontSize: 14 },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    padding: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  durationText: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '700' },
  catPill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.button },
  catPillText: { fontSize: fontSize.tiny, color: '#fff', fontWeight: '700' },
  descText: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.xs },
  tagChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.button },
  tagChipText: { fontSize: fontSize.tiny, color: '#fff', fontWeight: '600' },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.purpleDark,
    borderRadius: radius.widget,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginLeft: 68,
  },
  addIconCircle: {
    width: 22,
    height: 22,
    borderRadius: radius.avatar,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIconText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  addRowText: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '600' },
});
