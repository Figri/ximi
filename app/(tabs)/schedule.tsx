import { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSegments } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { DiaryBlock } from '../../components/schedule/DiaryBlock';
import { MonthCalendar } from '../../components/schedule/MonthCalendar';
import { ScheduleRowView } from '../../components/schedule/ScheduleRowView';
import { ScheduleToolbar } from '../../components/schedule/ScheduleToolbar';
import { PageTitle } from '../../components/common/PageTitle';
import {
  addDays,
  addItem,
  deleteItem,
  fetchDayView,
  setChecked,
  setDiary,
  SLOTS,
  todayDateKey,
  updateItem,
  type DayView,
  type ScheduleRow,
} from '../../lib/schedule';
import type { ScheduleSlot } from '../../types';

const SLOT_LABELS: Record<string, string> = { allday: '★ 全天', '08': '08:00', '10': '10:00', '12': '12:00', '14': '14:00', '16': '16:00', '18': '18:00', '20': '20:00', '22': '22:00' };
const REGIONS: ScheduleSlot[] = ['allday', ...SLOTS];

type DisplayItem = ScheduleRow | { divider: true; slot: ScheduleSlot; key: string };

function isDivider(item: DisplayItem): item is { divider: true; slot: ScheduleSlot; key: string } {
  return 'divider' in item;
}

function genDraftId(): string {
  return `draft:${Math.random().toString(36).slice(2)}`;
}

/** rows(扁平、含slot字段) -> 单个DraggableFlatList要的那种"分隔符+该区行"交替排列的
 * 展示列表。拖拽靠的就是这个结构：react-native-draggable-flatlist这个版本不支持
 * 跨list拖拽（之前在v1底栏那次已经核实过），要实现"跨时段拖"只能把全天+8个时段
 * 揉成一个list，用不可拖的分隔符行当"区块边界"，拖完之后看一个行最终落在哪个
 * 分隔符后面，就反推出它的新slot——跟底栏布局编辑态那次插入式拖拽同一个思路。 */
function buildDisplayList(rows: ScheduleRow[]): DisplayItem[] {
  const list: DisplayItem[] = [];
  for (const slot of REGIONS) {
    list.push({ divider: true, slot, key: `divider:${slot}` });
    const slotRows = rows
      .filter((r) => r.slot === slot && !(slot === 'allday' && r.done))
      .sort((a, b) => a.sort - b.sort);
    list.push(...slotRows);
  }
  return list;
}

/** slot(比如'14') -> 当天这个时段对应的具体小时数，给"准点提醒"这类需要具体时刻的功能用 */
function slotToHour(slot: ScheduleSlot): number | null {
  if (slot === 'allday') return null;
  return Number(slot);
}

export default function ScheduleScreen() {
  // 从今天页「排一排」单独打开时（app/page/schedule）顶上带个返回
  const standalone = (useSegments() as string[])[0] === 'page';
  const [dateKey, setDateKey] = useState(todayDateKey());
  const [dayView, setDayView] = useState<DayView | null>(null);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; onUndo?: () => void } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const rowRefs = useRef<Record<string, TextInput | null>>({});

  useEffect(() => {
    load();
  }, [dateKey]);

  async function load() {
    const view = await fetchDayView(dateKey);
    setDayView(view);
    setRows(Object.values(view.rowsBySlot).flat());
    setSelectedKey(null);
  }

  function focusRow(key: string | null, atEnd = true) {
    if (!key) return;
    requestAnimationFrame(() => {
      const el = rowRefs.current[key];
      if (el) {
        el.focus();
        if (atEnd && 'setNativeProps' in el) {
          // 光标跳到文字末尾——web上靠setSelection，原生上focus默认行为已经是光标落在点击/焦点处
        }
      }
    });
  }

  function rowsForSlot(slot: ScheduleSlot): ScheduleRow[] {
    return rows.filter((r) => r.slot === slot).sort((a, b) => a.sort - b.sort);
  }

  function showToast(text: string, onUndo?: () => void) {
    setToast({ text, onUndo });
    toastOpacity.setValue(1);
    Animated.timing(toastOpacity, { toValue: 0, duration: 400, delay: onUndo ? 4600 : 1200, useNativeDriver: true }).start(() => setToast(null));
  }

  // ---------------- 行操作 ----------------

  function handleAddDraft(slot: ScheduleSlot) {
    const key = genDraftId();
    const draft: ScheduleRow = { key, source: 'item', refId: key, title: '', slot, shape: 'circle', starred: false, done: false, sort: rowsForSlot(slot).length };
    setRows((prev) => [...prev, draft]);
    setSelectedKey(key);
    focusRow(key);
  }

  async function commitDraftOrUpdate(row: ScheduleRow, text: string) {
    const trimmed = text;
    if (row.refId.startsWith('draft:')) {
      if (!trimmed.trim()) {
        setRows((prev) => prev.filter((r) => r.key !== row.key));
        return;
      }
      const created = await addItem({ date: dateKey, slot: row.slot, title: trimmed.trim() });
      const newKey = `item:${created.id}`;
      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, key: newKey, refId: created.id, title: trimmed.trim() } : r)));
      if (selectedKey === row.key) setSelectedKey(newKey);
      return;
    }
    if (!trimmed.trim()) {
      await deleteItem(row.refId);
      setRows((prev) => prev.filter((r) => r.key !== row.key));
      return;
    }
    await updateItem(row.refId, { title: trimmed });
    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, title: trimmed } : r)));
  }

  function handleEnter(row: ScheduleRow) {
    const key = genDraftId();
    const slotRows = rowsForSlot(row.slot);
    const idx = slotRows.findIndex((r) => r.key === row.key);
    const draft: ScheduleRow = { key, source: 'item', refId: key, title: '', slot: row.slot, shape: 'circle', starred: false, done: false, sort: (slotRows[idx]?.sort ?? 0) + 0.5 };
    setRows((prev) => [...prev, draft]);
    setSelectedKey(key);
    focusRow(key);
  }

  async function handleEmptyBackspace(row: ScheduleRow) {
    const slotRows = rowsForSlot(row.slot);
    const idx = slotRows.findIndex((r) => r.key === row.key);
    const prevRow = idx > 0 ? slotRows[idx - 1] : null;
    if (!row.refId.startsWith('draft:')) await deleteItem(row.refId);
    setRows((prev) => prev.filter((r) => r.key !== row.key));
    if (prevRow) focusRow(prevRow.key);
  }

  async function handleMergeBackspace(row: ScheduleRow, currentText: string) {
    const slotRows = rowsForSlot(row.slot);
    const idx = slotRows.findIndex((r) => r.key === row.key);
    const prevRow = idx > 0 ? slotRows[idx - 1] : null;
    if (!prevRow || prevRow.shape !== 'circle') return; // 模板行不可编辑，不能往里合并
    const mergedTitle = prevRow.title + currentText;
    await updateItem(prevRow.refId, { title: mergedTitle });
    if (!row.refId.startsWith('draft:')) await deleteItem(row.refId);
    setRows((prev) => prev.filter((r) => r.key !== row.key).map((r) => (r.key === prevRow.key ? { ...r, title: mergedTitle } : r)));
    focusRow(prevRow.key);
  }

  async function handleToggleCheck(row: ScheduleRow) {
    const next = !row.done;
    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, done: next } : r)));
    // 全天条目勾完会飞进"今日已完成"折叠区、从可见列表里消失——这时候工具条
    // 还跟着一个看不见的行没有意义，一并收起
    if (row.slot === 'allday' && next) setSelectedKey(null);
    await setChecked(dateKey, row.source, row.refId, row.title, next);
  }

  function handleDelete(row: ScheduleRow) {
    const snapshot = row;
    setRows((prev) => prev.filter((r) => r.key !== row.key));
    setSelectedKey(null);
    let undone = false;
    showToast('已删除 · 撤销', async () => {
      undone = true;
      setRows((prev) => [...prev, snapshot]);
    });
    setTimeout(async () => {
      if (!undone && !snapshot.refId.startsWith('draft:')) await deleteItem(snapshot.refId);
    }, 5000);
  }

  async function handleToggleStar(row: ScheduleRow) {
    const next = !row.starred;
    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, starred: next } : r)));
    if (!row.refId.startsWith('draft:')) await updateItem(row.refId, { starred: next });
  }

  async function handleChangeSlot(row: ScheduleRow, slot: ScheduleSlot) {
    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, slot } : r)));
    if (!row.refId.startsWith('draft:')) await updateItem(row.refId, { slot });
  }

  async function handleSetRecurring(row: ScheduleRow, rule: string | null) {
    if (!row.refId.startsWith('draft:')) await updateItem(row.refId, { recurring_rule: rule });
    showToast(rule ? '已设为重复事项' : '已取消重复');
  }

  async function handleSetReminder(row: ScheduleRow, minutesBefore: number | null) {
    if (row.refId.startsWith('draft:')) return;
    if (minutesBefore === null) {
      await updateItem(row.refId, { remind_at: null });
      showToast('已取消提醒');
      return;
    }
    const hour = slotToHour(row.slot) ?? 9;
    const [y, m, d] = dateKey.split('-').map(Number);
    const remindAt = new Date(y, m - 1, d, hour, 0, 0);
    remindAt.setMinutes(remindAt.getMinutes() - minutesBefore);
    await updateItem(row.refId, { remind_at: remindAt.toISOString() });
    showToast('已设置提醒');
  }

  async function handleDiaryChange(text: string) {
    await setDiary(dateKey, text);
  }

  // 拖完之后：按分隔符切出每一段此刻属于哪个slot，行在列表里的新顺序当sort。
  // 只有source='item'的行会真的持久化slot变化——模板行(square)在
  // ScheduleRowView里压根没接onLongPress={drag}，用户抓不起来，但它仍然是
  // list数据的一部分，会被排在它该在的位置上，不需要额外处理。
  function handleRowDragEnd({ data }: { data: DisplayItem[] }) {
    let currentSlot: ScheduleSlot = 'allday';
    let sortCounter = 0;
    const moved: { key: string; slot: ScheduleSlot }[] = [];
    const nextRows = rows.map((r) => ({ ...r }));
    for (const item of data) {
      if (isDivider(item)) {
        currentSlot = item.slot;
        sortCounter = 0;
        continue;
      }
      const target = nextRows.find((r) => r.key === item.key);
      if (!target) continue;
      if (target.slot !== currentSlot) moved.push({ key: target.key, slot: currentSlot });
      target.slot = currentSlot;
      target.sort = sortCounter++;
    }
    setRows(nextRows);
    for (const m of moved) {
      const row = rows.find((r) => r.key === m.key);
      if (row && row.source === 'item' && !row.refId.startsWith('draft:')) {
        updateItem(row.refId, { slot: m.slot });
      }
    }
  }

  const selectedRow = rows.find((r) => r.key === selectedKey) ?? null;
  const todayKey = todayDateKey();
  const completedRows = rows.filter((r) => r.slot === 'allday' && r.done);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {standalone ? <PageTitle title="日程" /> : null}
      <View style={styles.header}>
        <Pressable onPress={() => setDateKey((d) => addDays(d, -1))} hitSlop={10}>
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>
        <Pressable onPress={() => setCalendarOpen((v) => !v)} style={styles.dateBtn}>
          <Text style={styles.dateText}>{formatHeaderDate(dateKey)}</Text>
        </Pressable>
        <Pressable onPress={() => setDateKey((d) => addDays(d, 1))} hitSlop={10}>
          <Text style={styles.navArrow}>›</Text>
        </Pressable>
        <Pressable onPress={() => setDateKey(todayDateKey())} hitSlop={10} style={styles.calendarIconBtn}>
          <Text style={styles.calendarIcon}>📅</Text>
        </Pressable>
      </View>

      {calendarOpen && (
        <MonthCalendar
          dateKey={dateKey}
          onSelectDate={(k) => {
            setDateKey(k);
            setCalendarOpen(false);
          }}
        />
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <DraggableFlatList
        data={buildDisplayList(rows)}
        keyExtractor={(item) => (isDivider(item) ? item.key : item.key)}
        onDragEnd={handleRowDragEnd}
        activationDistance={12}
        containerStyle={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={dayView ? <DiaryBlock content={dayView.diary} onChange={handleDiaryChange} /> : null}
        ListFooterComponent={
          completedRows.length > 0 ? (
            <View style={styles.completedSection}>
              <Pressable onPress={() => setCompletedOpen((v) => !v)} style={styles.completedHeader}>
                <Text style={styles.completedHeaderText}>
                  {completedOpen ? '▾' : '▸'} 今日已完成 ({completedRows.length})
                </Text>
              </Pressable>
              {completedOpen && completedRows.map((row) => renderRow(row))}
            </View>
          ) : null
        }
        renderItem={({ item, drag, isActive }: RenderItemParams<DisplayItem>) => {
          if (isDivider(item)) {
            const slotRows = rowsForSlot(item.slot).filter((r) => !(item.slot === 'allday' && r.done));
            const allDone = slotRows.length > 0 && slotRows.every((r) => r.done);
            const isPast = item.slot !== 'allday' && dateKey === todayKey && Number(item.slot) < new Date().getHours();
            return (
              <View style={[styles.dividerRow, isPast && allDone && styles.slotPastDone]}>
                <Text style={[styles.slotLabel, item.slot === 'allday' && styles.alldayLabel]}>{SLOT_LABELS[item.slot]}</Text>
                <Pressable style={styles.addHotzone} onPress={() => handleAddDraft(item.slot)}>
                  <Text style={styles.addHotzoneText}>{item.slot === 'allday' ? '＋ 添加' : '＋'}</Text>
                </Pressable>
              </View>
            );
          }
          return <View style={isActive && { opacity: 0.9 }}>{renderRow(item, drag)}</View>;
        }}
      />
      </KeyboardAvoidingView>

      {selectedRow && selectedRow.source === 'item' && (
        <ScheduleToolbar
          starred={selectedRow.starred}
          onToggleStar={() => handleToggleStar(selectedRow)}
          onChangeSlot={(slot) => handleChangeSlot(selectedRow, slot)}
          onSetRecurring={(rule) => handleSetRecurring(selectedRow, rule)}
          onSetReminder={(min) => handleSetReminder(selectedRow, min)}
          onDelete={() => handleDelete(selectedRow)}
        />
      )}

      {toast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toast.text}</Text>
          {toast.onUndo && (
            <Pressable onPress={toast.onUndo}>
              <Text style={styles.toastUndo}>撤销</Text>
            </Pressable>
          )}
        </Animated.View>
      )}
    </SafeAreaView>
  );

  function renderRow(row: ScheduleRow, drag?: () => void) {
    return (
      <ScheduleRowView
        key={row.key}
        ref={(el) => {
          rowRefs.current[row.key] = el;
        }}
        row={row}
        selected={selectedKey === row.key}
        onSelect={() => setSelectedKey(row.key)}
        onToggleCheck={() => handleToggleCheck(row)}
        onChangeTitle={(text) => commitDraftOrUpdate(row, text)}
        onEnter={() => handleEnter(row)}
        onEmptyBackspace={() => handleEmptyBackspace(row)}
        onMergeBackspace={(text) => handleMergeBackspace(row, text)}
        onDrag={drag}
        // 点 ＋ 新加的那一行直接弹键盘，不用再点一下输入框
        autoFocus={row.refId.startsWith('draft:') && selectedKey === row.key}
      />
    );
  }
}

function formatHeaderDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${m}月${d}日 ${weekdays[date.getDay()]}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
    // DraggableFlatList 内部的手势捕获层有时会在web上盖住它上面的兄弟节点
    // （哪怕JSX顺序在前面），导致头部的日期点不到——给头部一个更高的
    // zIndex，确保触摸事件优先分给它
    zIndex: 10,
    elevation: 10,
  },
  navArrow: { fontSize: 22, color: colors.purpleDark, fontWeight: '700', paddingHorizontal: spacing.sm },
  dateBtn: { paddingHorizontal: spacing.md, paddingVertical: 4 },
  dateText: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  calendarIconBtn: { position: 'absolute', right: spacing.lg },
  calendarIcon: { fontSize: 18 },
  scrollContent: { paddingBottom: spacing.xl * 4 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.card,
  },
  alldayLabel: { color: colors.yellowDark, fontWeight: '700' },
  slotPastDone: { opacity: 0.6 },
  slotLabel: { fontSize: fontSize.secondary, color: colors.textMuted, fontWeight: '600' },
  addHotzone: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  addHotzoneText: { fontSize: fontSize.secondary, color: colors.textMuted },
  completedSection: { paddingHorizontal: spacing.sm, marginTop: spacing.md },
  completedHeader: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  completedHeaderText: { fontSize: fontSize.secondary, color: colors.textMuted, fontWeight: '600' },
  toast: {
    position: 'absolute',
    bottom: spacing.xl * 2,
    alignSelf: 'center',
    backgroundColor: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toastText: { color: '#fff', fontSize: fontSize.body },
  toastUndo: { color: colors.purpleLight, fontSize: fontSize.body, fontWeight: '700' },
});
