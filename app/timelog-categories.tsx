import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { CategoryFormModal } from '../components/timetab/CategoryFormModal';
import { useTimeLogStore } from '../lib/timelogStore';
import type { TimeCategory } from '../types';

export default function TimelogCategoriesScreen() {
  const { categories, loading, fetchAll } = useTimeLogStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<TimeCategory | null>(null);
  const [creatingUnderParent, setCreatingUnderParent] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    fetchAll();
  }, []);

  const topLevel = categories.filter((c) => !c.parent_id);
  const childrenByParent: Record<string, TimeCategory[]> = {};
  for (const c of categories) {
    if (c.parent_id) {
      childrenByParent[c.parent_id] = childrenByParent[c.parent_id] ?? [];
      childrenByParent[c.parent_id].push(c);
    }
  }

  function handleRowLongPress(cat: TimeCategory) {
    const isTopLevel = !cat.parent_id;
    Alert.alert(
      cat.name,
      undefined,
      [
        { text: '取消', style: 'cancel' as const },
        { text: '编辑', onPress: () => setEditing(cat) },
        ...(isTopLevel ? [{ text: '新建次级分类', onPress: () => setCreatingUnderParent(cat.id) }] : []),
      ]
    );
  }

  function handleModalSaved() {
    setEditing(null);
    setCreatingUnderParent(undefined);
    fetchAll();
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>‹ 时间</Text>
        </Pressable>
        <Text style={styles.pageTitle}>分类管理</Text>
        <Pressable style={styles.addButton} onPress={() => setCreatingUnderParent(null)}>
          <Text style={styles.addButtonText}>＋</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>长按分类可以编辑或加次级分类</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {topLevel.map((cat) => {
            const children = childrenByParent[cat.id] ?? [];
            const isCollapsed = collapsed[cat.id];
            return (
              <View key={cat.id}>
                <Pressable
                  style={styles.row}
                  onPress={() => setEditing(cat)}
                  onLongPress={() => handleRowLongPress(cat)}
                >
                  {children.length > 0 && (
                    <Pressable
                      hitSlop={8}
                      onPress={() => setCollapsed((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                    >
                      <Text style={styles.collapseIcon}>{isCollapsed ? '▶' : '▼'}</Text>
                    </Pressable>
                  )}
                  <View style={[styles.dot, { backgroundColor: cat.color }]} />
                  <Text style={styles.rowName}>{cat.name}</Text>
                  {children.length > 0 && <Text style={styles.childCount}>{children.length}</Text>}
                </Pressable>
                {!isCollapsed &&
                  children.map((child) => (
                    <Pressable
                      key={child.id}
                      style={[styles.row, styles.childRow]}
                      onPress={() => setEditing(child)}
                      onLongPress={() => handleRowLongPress(child)}
                    >
                      <View style={[styles.dot, { backgroundColor: child.color }]} />
                      <Text style={styles.rowName}>{child.name}</Text>
                    </Pressable>
                  ))}
              </View>
            );
          })}
          {topLevel.length === 0 && <Text style={styles.empty}>还没有分类，点右上角＋建一个</Text>}
        </ScrollView>
      )}

      <CategoryFormModal
        visible={!!editing || creatingUnderParent !== undefined}
        category={editing}
        defaultParentId={creatingUnderParent ?? null}
        topLevelCategories={topLevel}
        onClose={() => {
          setEditing(null);
          setCreatingUnderParent(undefined);
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
  hint: { fontSize: fontSize.tiny, color: colors.textMuted, paddingHorizontal: spacing.lg, marginTop: 4 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  childRow: { marginLeft: spacing.lg, backgroundColor: colors.background },
  collapseIcon: { fontSize: 12, color: colors.textMuted, width: 14 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  rowName: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary },
  childCount: { fontSize: fontSize.tiny, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, marginTop: spacing.xl },
});
