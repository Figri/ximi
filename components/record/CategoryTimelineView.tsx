import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchTimelineByCategory } from '../../lib/timeline';
import type { TimelineCategory, TimelineEntry } from '../../types';

function entryMeta(entry: TimelineEntry): string | null {
  const parts: string[] = [];
  if (entry.end_time) {
    const mins = Math.round((new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime()) / 60000);
    if (mins > 0) parts.push(`${mins}min`);
  }
  if (entry.hp_change) parts.push(`HP${entry.hp_change > 0 ? '+' : ''}${entry.hp_change}`);
  if (entry.mp_change) parts.push(`MP${entry.mp_change > 0 ? '+' : ''}${entry.mp_change}`);
  return parts.length ? parts.join(' · ') : null;
}

export function CategoryTimelineView({ category, refreshKey }: { category: TimelineCategory; refreshKey: number }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchTimelineByCategory(category)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [category, refreshKey]);

  if (loading) return <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />;

  if (entries.length === 0) {
    return <Text style={styles.empty}>还没有记录，点右下角 ＋ 加一条</Text>;
  }

  return (
    <View>
      {entries.map((entry) => {
        const meta = entryMeta(entry);
        return (
          <View key={entry.id} style={styles.row}>
            <Text style={styles.date}>
              {new Date(entry.start_time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
              {meta ? ` · ${meta}` : ''}
            </Text>
            <Text style={styles.text}>{entry.description}</Text>
            {entry.image_url && <Image source={{ uri: entry.image_url }} style={styles.image} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, marginTop: spacing.xl },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  date: { fontSize: fontSize.tiny, color: colors.textMuted, marginBottom: 2 },
  text: { fontSize: fontSize.body, color: colors.textPrimary },
  image: { width: '100%', height: 160, borderRadius: radius.widget, marginTop: spacing.sm },
});
