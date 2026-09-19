import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchTimelineByCategory } from '../../lib/timeline';
import type { TimelineCategory, TimelineEntry } from '../../types';

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
      {entries.map((entry) => (
        <View key={entry.id} style={styles.row}>
          <Text style={styles.date}>
            {new Date(entry.start_time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
          </Text>
          <Text style={styles.text}>{entry.description}</Text>
        </View>
      ))}
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
});
