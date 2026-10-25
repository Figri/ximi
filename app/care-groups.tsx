import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import {
  addGroup,
  deleteGroup,
  groupOf,
  loadGroupOrder,
  OTHER_GROUP,
  renameGroup,
  restoreGroup,
  saveGroupOrder,
  sortGroupNames,
  type GroupSnapshot,
} from '../lib/careGroups';
import { fetchCards } from '../lib/cards';
import { useCardStore } from '../lib/store';

// 分类管理：今天页「该照顾的」里那些分组（🐱猫、🧹区域……）。长按拖动排先后；能改名、删掉、加新的。
// 删掉只是把习惯上的这个标签拿掉（习惯本身还在，落到「其他」或者按名字猜的分组），5 秒内能撤销。

interface Row {
  name: string;
  count: number;
}

export default function CareGroupsScreen() {
  const refreshStore = useCardStore((s) => s.fetchAll);
  const [rows, setRows] = useState<Row[]>([]);
  const [otherCount, setOtherCount] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  /** 回车和失焦都会来一次，只认第一次 */
  const editingRef = useRef<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newName, setNewName] = useState('');
  const [toast, setToast] = useState<{ text: string; snap: GroupSnapshot } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 连着拖几次：一次存完再存下一次，不让两次写交叉 */
  const saving = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(async () => {
    const [order, cards] = await Promise.all([loadGroupOrder(), fetchCards()]);
    const counts = new Map<string, number>();
    for (const c of cards) {
      if (c.display_type !== 'habit') continue;
      const g = groupOf(c);
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    const names = sortGroupNames(Array.from(new Set([...order, ...counts.keys()])).filter((n) => n !== OTHER_GROUP), order);
    setRows(names.map((name) => ({ name, count: counts.get(name) ?? 0 })));
    setOtherCount(counts.get(OTHER_GROUP) ?? 0);
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [load]);

  function persistOrder(next: Row[]) {
    saving.current = saving.current
      .catch(() => {})
      .then(() => saveGroupOrder(next.map((r) => r.name)))
      .then(() => refreshStore());
  }

  function onDragEnd({ data }: { data: Row[] }) {
    setRows(data);
    persistOrder(data);
  }

  function startEdit(name: string) {
    editingRef.current = name;
    setDraft(name);
    setEditing(name);
  }

  async function submitRename(from: string) {
    if (editingRef.current !== from) return;
    editingRef.current = null;
    const to = draft.trim();
    setEditing(null);
    if (!to || to === from) return;
    await saving.current.catch(() => {});
    await renameGroup(from, to);
    // 新名字放在原来的位置
    const order = rows.map((r) => (r.name === from ? to : r.name)).filter((n, i, a) => a.indexOf(n) === i);
    await saveGroupOrder(order);
    await load();
    refreshStore();
  }

  async function remove(name: string) {
    await saving.current.catch(() => {});
    const snap = await deleteGroup(name);
    await load();
    refreshStore();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text: `删了「${name}」，用它的习惯还在`, snap });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  async function undo() {
    if (!toast) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const snap = toast.snap;
    setToast(null);
    await restoreGroup(snap);
    await load();
    refreshStore();
  }

  async function add() {
    const n = newName.trim();
    if (!n) return;
    setNewName('');
    await saving.current.catch(() => {});
    await addGroup(n);
    await saveGroupOrder([...rows.map((r) => r.name).filter((x) => x !== n), n]);
    await load();
  }

  function renderItem({ item, drag, isActive }: RenderItemParams<Row>) {
    const isEditing = editing === item.name;
    return (
      <ScaleDecorator>
        <Pressable style={[styles.row, isActive && styles.rowActive]} onLongPress={drag} delayLongPress={150} testID={`group-row-${item.name}`}>
          <Text style={styles.handle}>⠿</Text>
          {isEditing ? (
            <TextInput
              style={styles.renameInput}
              value={draft}
              onChangeText={setDraft}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => submitRename(item.name)}
              onBlur={() => submitRename(item.name)}
              testID="group-rename-input"
            />
          ) : (
            <View style={styles.nameBox}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.count}>{item.count} 个习惯</Text>
            </View>
          )}
          {!isEditing ? (
            <>
              <Pressable
                onPress={() => startEdit(item.name)}
                hitSlop={8}
                testID={`group-rename-${item.name}`}
              >
                <Text style={styles.action}>改名</Text>
              </Pressable>
              <Pressable onPress={() => remove(item.name)} hitSlop={8} testID={`group-delete-${item.name}`}>
                <Text style={styles.danger}>删</Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </ScaleDecorator>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>分类管理</Text>
        <View style={{ width: 48 }} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <DraggableFlatList
          data={rows}
          keyExtractor={(r) => r.name}
          renderItem={renderItem}
          onDragEnd={onDragEnd}
          containerStyle={styles.flex}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<Text style={styles.hint}>长按一行上下拖，今天页「该照顾的」就按这个顺序排。习惯分到哪一类，在长按习惯 → 改这个习惯里选。</Text>}
          ListFooterComponent={
            <View style={styles.footer}>
              <Text style={styles.other}>其他（没分类的）· {otherCount} 个习惯 · 永远在最后</Text>
              <View style={styles.addRow}>
                <TextInput
                  style={styles.addInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="新分类，比如 🧺洗衣"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={add}
                  testID="group-new"
                />
                <Pressable style={[styles.addBtn, !newName.trim() && styles.addBtnOff]} onPress={add} disabled={!newName.trim()} testID="group-add">
                  <Text style={styles.addBtnText}>加上</Text>
                </Pressable>
              </View>
            </View>
          }
        />
      </KeyboardAvoidingView>
      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText} numberOfLines={1}>
            {toast.text}
          </Text>
          <Pressable onPress={undo} hitSlop={10} testID="group-undo">
            <Text style={styles.toastUndo}>撤销</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  back: { fontSize: fontSize.body, color: colors.purpleDark, width: 48 },
  title: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  hint: { fontSize: fontSize.secondary, color: colors.textMuted, lineHeight: 17, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.widget, paddingHorizontal: spacing.md, paddingVertical: 12, marginBottom: spacing.sm },
  rowActive: { backgroundColor: colors.purpleLight },
  handle: { fontSize: 18, color: colors.textMuted },
  nameBox: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  count: { fontSize: fontSize.tiny, color: colors.textMuted },
  renameInput: { flex: 1, backgroundColor: colors.background, borderRadius: radius.widget, paddingHorizontal: 10, paddingVertical: 6, fontSize: fontSize.cardName, color: colors.textPrimary },
  action: { fontSize: fontSize.body, color: colors.purpleDark },
  danger: { fontSize: fontSize.body, color: colors.redDark },
  footer: { gap: spacing.md, marginTop: spacing.xs },
  other: { fontSize: fontSize.secondary, color: colors.textMuted },
  addRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  addInput: { flex: 1, backgroundColor: colors.card, borderRadius: radius.widget, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: fontSize.body, color: colors.textPrimary },
  addBtn: { backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnOff: { opacity: 0.4 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.body },
  toast: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.textPrimary, borderRadius: radius.button, paddingHorizontal: spacing.lg, paddingVertical: 11 },
  toastText: { flex: 1, color: '#fff', fontSize: fontSize.body },
  toastUndo: { color: '#D8B4E2', fontSize: fontSize.body, fontWeight: '700' },
});
