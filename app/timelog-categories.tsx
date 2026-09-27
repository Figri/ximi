import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { CategoryFormModal } from '../components/timetab/CategoryFormModal';
import { useTimeLogStore } from '../lib/timelogStore';
import type { TimeCategory } from '../types';

export default function TimelogCategoriesScreen() {
  const { categories, loading, fetchAll, upsertCategory } = useTimeLogStore();
  const [editing, setEditing] = useState<TimeCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [order, setOrder] = useState<TimeCategory[]>([]);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    setOrder([...categories].sort((a, b) => a.sort_order - b.sort_order));
  }, [categories]);

  function handleModalSaved() {
    setEditing(null);
    setCreating(false);
  }

  // store.upsertCategory 会同步更新内存+落库，拖完直接按新顺序逐个写 sort_order 即可
  async function handleDragEnd({ data }: { data: TimeCategory[] }) {
    setOrder(data);
    // 必须逐个await：并发触发多个upsertCategory会对store里的同一份categories数组
    // 做并发的读-改-写，后写的set()会把先写的整个覆盖掉，导致排序基本没生效
    for (let i = 0; i < data.length; i++) {
      await upsertCategory({ ...data[i], sort_order: i + 1 });
    }
  }

  function renderItem({ item, drag, isActive }: RenderItemParams<TimeCategory>) {
    return (
      <ScaleDecorator>
        <Pressable
          style={[styles.row, isActive && styles.rowActive]}
          onPress={() => setEditing(item)}
          onLongPress={drag}
          delayLongPress={150}
        >
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.dragHandle}>≡</Text>
        </Pressable>
      </ScaleDecorator>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>‹ 时间</Text>
        </Pressable>
        <Text style={styles.pageTitle}>分类管理</Text>
        <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
          <Text style={styles.addButtonText}>＋</Text>
        </Pressable>
      </View>
      <View style={styles.hintRow}>
        <Text style={styles.hint}>长按拖动排序，点击编辑</Text>
        <Pressable onPress={() => router.push('/timelog-tags')}>
          <Text style={styles.crossLink}>💭 情绪标签 ›</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />
      ) : order.length === 0 ? (
        <Text style={styles.empty}>还没有分类，点右上角＋建一个</Text>
      ) : (
        <DraggableFlatList
          data={order}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onDragEnd={handleDragEnd}
          contentContainerStyle={styles.content}
        />
      )}

      <CategoryFormModal
        visible={!!editing || creating}
        category={editing}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSaved={handleModalSaved}
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
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginTop: 4,
  },
  hint: { fontSize: fontSize.tiny, color: colors.textMuted },
  crossLink: { fontSize: fontSize.tiny, color: colors.purpleDark, fontWeight: '600' },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    marginBottom: spacing.xs,
    gap: 14,
  },
  rowActive: { opacity: 0.85 },
  dot: { width: 18, height: 18, borderRadius: 9 },
  rowName: { flex: 1, fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  dragHandle: { fontSize: 18, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, marginTop: spacing.xl },
});
