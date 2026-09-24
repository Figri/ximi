import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { TagFormModal } from '../components/timetab/TagFormModal';
import { useTimeLogStore } from '../lib/timelogStore';
import type { TimeTag } from '../types';

export default function TimelogTagsScreen() {
  const { tags, loading, fetchAll } = useTimeLogStore();
  const [editing, setEditing] = useState<TimeTag | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  function handleSaved() {
    setEditing(null);
    setCreating(false);
    fetchAll();
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>‹ 时间</Text>
        </Pressable>
        <Text style={styles.pageTitle}>情绪标签管理</Text>
        <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
          <Text style={styles.addButtonText}>＋</Text>
        </Pressable>
      </View>
      <Pressable style={styles.crossLinkRow} onPress={() => router.push('/timelog-categories')}>
        <Text style={styles.crossLink}>📁 分类管理 ›</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.grid}>
            {tags.map((tag) => (
              <Pressable key={tag.id} style={[styles.tagCard, { backgroundColor: tag.color }]} onPress={() => setEditing(tag)}>
                <Text style={styles.tagText}>{tag.name}</Text>
              </Pressable>
            ))}
          </View>
          {tags.length === 0 && <Text style={styles.empty}>还没有情绪标签，点右上角＋建一个</Text>}
        </ScrollView>
      )}

      <TagFormModal
        visible={!!editing || creating}
        tag={editing}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSaved={handleSaved}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  backText: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '600' },
  pageTitle: { fontSize: fontSize.cardName, fontWeight: '700', color: colors.textPrimary },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: radius.avatar,
    backgroundColor: colors.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: colors.purpleDark, fontSize: 18, fontWeight: '600', marginTop: -2 },
  crossLinkRow: { paddingHorizontal: spacing.lg, marginTop: 4 },
  crossLink: { fontSize: fontSize.tiny, color: colors.purpleDark, fontWeight: '600' },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tagCard: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.button },
  tagText: { color: '#fff', fontSize: fontSize.body, fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, marginTop: spacing.xl },
});
