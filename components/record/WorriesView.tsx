import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchWorries, updateWorryStatus } from '../../lib/worries';
import type { Worry, WorrySeverity } from '../../types';

const SEVERITY_LABEL: Record<WorrySeverity, string> = { light: '轻', medium: '中', heavy: '重' };
const SEVERITY_COLOR: Record<WorrySeverity, string> = {
  light: colors.green,
  medium: colors.yellowDark,
  heavy: colors.redDark,
};

export function WorriesView({ refreshKey }: { refreshKey: number }) {
  const [worries, setWorries] = useState<Worry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchWorries()
      .then(setWorries)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  async function handleResolve(worry: Worry, status: 'resolved' | 'let_go') {
    try {
      await updateWorryStatus(worry.id, status);
      setWorries((prev) => prev.map((w) => (w.id === worry.id ? { ...w, status } : w)));
    } catch (err) {
      Alert.alert('操作失败', err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />;

  const active = worries.filter((w) => w.status === 'active');
  const done = worries.filter((w) => w.status !== 'active');

  if (worries.length === 0) {
    return <Text style={styles.empty}>还没有记烦恼，点右下角 ＋ 说说看</Text>;
  }

  return (
    <View>
      {active.map((w) => (
        <View key={w.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.dot, { backgroundColor: SEVERITY_COLOR[w.severity] }]} />
            <Text style={styles.severityText}>{SEVERITY_LABEL[w.severity]}</Text>
            <Text style={styles.date}>{new Date(w.created_at).toLocaleDateString('zh-CN')}</Text>
          </View>
          <Text style={styles.content}>{w.content}</Text>
          {w.tags.length > 0 && <Text style={styles.tags}>{w.tags.join(' ')}</Text>}
          <View style={styles.actions}>
            <Pressable onPress={() => handleResolve(w, 'resolved')}>
              <Text style={styles.actionText}>✓ 解决了</Text>
            </Pressable>
            <Pressable onPress={() => handleResolve(w, 'let_go')}>
              <Text style={styles.actionText}>放下了</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {done.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>已经过去的</Text>
          {done.map((w) => (
            <View key={w.id} style={[styles.card, styles.cardDone]}>
              <Text style={[styles.content, styles.contentDone]}>{w.content}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, marginTop: spacing.xl },
  sectionTitle: { fontSize: fontSize.secondary, color: colors.textMuted, marginVertical: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardDone: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  severityText: { fontSize: fontSize.tiny, color: colors.textMuted },
  date: { fontSize: fontSize.tiny, color: colors.textMuted, marginLeft: 'auto' },
  content: { fontSize: fontSize.body, color: colors.textPrimary },
  contentDone: { textDecorationLine: 'line-through' },
  tags: { fontSize: fontSize.tiny, color: colors.purpleDark, marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  actionText: { fontSize: fontSize.secondary, color: colors.purpleDark, fontWeight: '600' },
});
