import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addLog, deleteLog, updateLog } from '../../lib/timelog';
import { useTimeLogStore } from '../../lib/timelogStore';
import type { TimeLog } from '../../types';

interface AddLogModalProps {
  visible: boolean;
  log?: TimeLog | null; // 有值=编辑，无值=新建
  initialCategoryId?: string | null;
  initialStart?: Date;
  initialEnd?: Date;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatMD(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function categoryLabel(cat: { name: string; parent_id: string | null }, byId: Record<string, { name: string }>): string {
  if (cat.parent_id && byId[cat.parent_id]) return `${byId[cat.parent_id].name}·${cat.name}`;
  return cat.name;
}

const WHEEL_ITEM_HEIGHT = 34;
const WHEEL_VISIBLE_ROWS = 3;

/** 简易滚轮列：用ScrollView+snapToInterval做吸附，不引入原生picker依赖，保持纯OTA */
function WheelColumn({
  items,
  selectedIndex,
  onChange,
  width,
}: {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  width: number;
}) {
  // contentOffset在react-native-web上对ScrollView不生效（实测scrollTop恒为0），
  // 改成挂载后用ref命令式滚到初始选中位置
  const scrollRef = useRef<ScrollView>(null);
  const initialIndex = useRef(selectedIndex).current;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: initialIndex * WHEEL_ITEM_HEIGHT, animated: false });
    });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // onMomentumScrollEnd/onScrollEndDrag在react-native-web上不可靠（实测鼠标滚轮
  // 驱动的滚动完全不触发），改成onScroll+自己防抖：停止滚动~150ms后才提交，
  // 这个写法在web和原生上都成立，不依赖某个平台特定的"滚动动量结束"事件
  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / WHEEL_ITEM_HEIGHT)));
      onChange(idx);
    }, 150);
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={{ height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS, width }}
      contentContainerStyle={{ paddingVertical: WHEEL_ITEM_HEIGHT }}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ITEM_HEIGHT}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={handleScroll}
    >
      {items.map((label, i) => (
        <View key={i} style={{ height: WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[styles.wheelText, i === selectedIndex && styles.wheelTextSelected]}>{label}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

/** 一组「日期|时|分」滚轮，代表一个时间点（开始或结束） */
function TimeWheelGroup({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
  const dateOptions = useRef(
    Array.from({ length: 9 }, (_, i) => {
      const d = new Date(value);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + (i - 4));
      return d;
    })
  ).current;
  const hourOptions = Array.from({ length: 24 }, (_, i) => i);
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i);

  const foundDateIdx = dateOptions.findIndex((d) => isSameDay(d, value));
  const dateIdx = foundDateIdx === -1 ? 4 : foundDateIdx;
  const hourIdx = value.getHours();
  const minuteIdx = value.getMinutes();

  function commit(newDateIdx: number, newHour: number, newMinute: number) {
    const base = dateOptions[newDateIdx] ?? dateOptions[dateIdx];
    const next = new Date(base);
    next.setHours(newHour, newMinute, 0, 0);
    onChange(next);
  }

  return (
    <View style={styles.wheelGroup}>
      <View style={styles.wheelGroupLabelBadge}>
        <Text style={styles.wheelGroupLabelText}>{label}</Text>
      </View>
      <View style={styles.wheelRow}>
        <WheelColumn items={dateOptions.map(formatMD)} selectedIndex={dateIdx} width={64} onChange={(i) => commit(i, hourIdx, minuteIdx)} />
        <WheelColumn
          items={hourOptions.map((h) => String(h).padStart(2, '0'))}
          selectedIndex={hourIdx}
          width={44}
          onChange={(i) => commit(dateIdx, i, minuteIdx)}
        />
        <WheelColumn
          items={minuteOptions.map((m) => String(m).padStart(2, '0'))}
          selectedIndex={minuteIdx}
          width={44}
          onChange={(i) => commit(dateIdx, hourIdx, i)}
        />
      </View>
    </View>
  );
}

export function AddLogModal({
  visible,
  log,
  initialCategoryId,
  initialStart,
  initialEnd,
  onClose,
  onSaved,
  onDeleted,
}: AddLogModalProps) {
  const { categories, tags } = useTimeLogStore();
  const isEdit = !!log;

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [description, setDescription] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [editingTime, setEditingTime] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (log) {
      setCategoryId(log.category_id);
      setStart(new Date(log.start_time));
      setEnd(new Date(log.end_time));
      setDescription(log.description ?? '');
      setTagIds(log.tag_ids ?? []);
    } else {
      setCategoryId(initialCategoryId ?? null);
      setStart(initialStart ?? new Date());
      setEnd(initialEnd ?? new Date());
      const cat = categories.find((c) => c.id === initialCategoryId);
      setDescription(cat?.default_description ?? '');
      setTagIds([]);
    }
    setEditingTime(false);
  }, [visible, log, initialCategoryId, initialStart, initialEnd]);

  const categoryById: Record<string, { name: string }> = {};
  for (const c of categories) categoryById[c.id] = c;

  // 滚轮拖到哪就是哪，不静默拒绝（否则视觉位置和实际值会对不上）；
  // 只在会导致时长<=0时才把另一头顺带推开，保证至少5分钟时长
  function handleStartChange(next: Date) {
    setStart(next);
    setEnd((prevEnd) => (next.getTime() >= prevEnd.getTime() ? new Date(next.getTime() + 5 * 60_000) : prevEnd));
  }

  function handleEndChange(next: Date) {
    setEnd(next);
    setStart((prevStart) => (next.getTime() <= prevStart.getTime() ? new Date(next.getTime() - 5 * 60_000) : prevStart));
  }

  function toggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function handleManagePress() {
    onClose();
    router.push('/timelog-categories');
  }

  async function handleSave() {
    if (!categoryId) {
      Alert.alert('选个分类吧', '这段时间是做什么的？');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && log) {
        await updateLog(log.id, {
          category_id: categoryId,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          description: description.trim() || null,
          tag_ids: tagIds,
        });
      } else {
        await addLog({
          category_id: categoryId,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          description: description.trim() || null,
          tag_ids: tagIds,
        });
      }
      onSaved();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!log) return;
    Alert.alert('删除这条记录？', description || undefined, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteLog(log.id);
          onDeleted?.();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior="padding" style={styles.avoider}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 30 }}
            >
              <Text style={styles.title}>{isEdit ? '编辑记录' : '记一笔'}</Text>

              <Text style={styles.label}>分类</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
                <View style={styles.chipRow}>
                  {categories.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setCategoryId(c.id)}
                      style={[styles.catChip, { borderColor: c.color }, categoryId === c.id && { backgroundColor: c.color }]}
                    >
                      <Text style={[styles.catChipText, categoryId === c.id && styles.catChipTextActive]}>
                        {categoryLabel(c, categoryById)}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable style={styles.manageChip} onPress={handleManagePress}>
                    <Text style={styles.manageChipText}>⚙ 管理</Text>
                  </Pressable>
                </View>
              </ScrollView>

              <View style={styles.timeRow}>
                <Text style={styles.timeText}>
                  时间：{formatTime(start)} — {formatTime(end)}
                </Text>
                <Pressable onPress={() => setEditingTime((v) => !v)}>
                  <Text style={styles.timeEditButton}>改{editingTime ? '▲' : '▼'}</Text>
                </Pressable>
              </View>
              {editingTime && (
                <View style={styles.wheelsRow}>
                  <TimeWheelGroup label="上尾" value={start} onChange={handleStartChange} />
                  <View style={styles.wheelsDivider} />
                  <TimeWheelGroup label="下始" value={end} onChange={handleEndChange} />
                </View>
              )}

              <Text style={styles.label}>正文</Text>
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={setDescription}
                placeholder="发生了什么"
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <Text style={styles.label}>情绪</Text>
              <View style={styles.chipRow}>
                {tags.map((t) => {
                  const active = tagIds.includes(t.id);
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => toggleTag(t.id)}
                      style={[styles.tagChip, { borderColor: t.color }, active && { backgroundColor: t.color }]}
                    >
                      <Text style={[styles.tagChipText, active && styles.catChipTextActive]}>{t.name}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.actions}>
                {isEdit && (
                  <Pressable style={styles.deleteButton} onPress={handleDelete}>
                    <Text style={styles.deleteButtonText}>删除</Text>
                  </Pressable>
                )}
                <Pressable style={styles.cancelButton} onPress={onClose}>
                  <Text style={styles.cancelText}>取消</Text>
                </Pressable>
                <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>保存</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.35)', justifyContent: 'flex-end' },
  // 90% 上限挂在 KAV 上（相对整屏）：挂在 sheet 上时百分比是相对 KAV 算的，而 KAV 高度又由 sheet
  // 撑出来，结果 sheet 被压成自身内容的 90%，底部按钮被截掉。键盘弹出时 KAV 加 paddingBottom，sheet 跟着收缩、内部滚动
  avoider: { width: '100%', maxHeight: '90%' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    flexShrink: 1,
  },
  title: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  label: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs },
  catScroll: { maxHeight: 40 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    borderWidth: 1.5,
    backgroundColor: colors.background,
  },
  catChipText: { fontSize: fontSize.body, color: colors.textSecondary },
  catChipTextActive: { color: '#fff', fontWeight: '700' },
  manageChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    backgroundColor: colors.background,
  },
  manageChipText: { fontSize: fontSize.body, color: colors.textSecondary },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  timeText: { fontSize: fontSize.secondary, color: colors.textSecondary, flex: 1 },
  timeEditButton: { fontSize: fontSize.secondary, color: colors.blueDark },
  wheelsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.xs, gap: spacing.sm },
  wheelsDivider: { width: 1, backgroundColor: colors.background, alignSelf: 'stretch' },
  wheelGroup: { flex: 1, alignItems: 'center' },
  wheelGroupLabelBadge: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginBottom: 4,
  },
  wheelGroupLabelText: { fontSize: fontSize.tiny, color: '#fff', fontWeight: '700' },
  wheelRow: { flexDirection: 'row', gap: 4 },
  wheelText: { fontSize: fontSize.body, color: colors.textMuted },
  wheelTextSelected: { color: colors.textPrimary, fontWeight: '700', fontSize: fontSize.cardName },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  tagChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    borderWidth: 1.5,
    backgroundColor: colors.background,
  },
  tagChipText: { fontSize: fontSize.body, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginBottom: 20 },
  deleteButton: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm, alignItems: 'center' },
  deleteButtonText: { color: colors.redDark, fontSize: fontSize.body },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  cancelText: { color: colors.textSecondary, fontSize: fontSize.body },
  saveButton: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
});
