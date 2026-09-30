import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addItem, deleteItem, parseDateKey, toDateKey, updateItem } from '../../lib/todo';
import { useTodoStore } from '../../lib/todoStore';
import type { TodoItem, TodoRepeatType } from '../../types';

interface TodoFormModalProps {
  visible: boolean;
  item?: TodoItem | null; // 有值=编辑，无值=新建
  initialDate?: Date;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

const REPEAT_OPTIONS: { value: TodoRepeatType; label: string }[] = [
  { value: 'none', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
];

const WEEKDAY_OPTIONS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
];

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const LAST_DAY_VALUE = 0; // repeat_day_of_month=0 表示"最后一天"

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function digitsOnly(v: string): string {
  return v.replace(/[^\d]/g, '').slice(0, 2);
}

/** 月/日都合法时才拼出一个新 Date，年份沿用 base 的年份 */
function tryParseMonthDay(base: Date, monthStr: string, dayStr: string): Date | null {
  if (!/^\d{1,2}$/.test(monthStr) || !/^\d{1,2}$/.test(dayStr)) return null;
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const next = new Date(base);
  next.setMonth(month - 1, day);
  if (next.getMonth() !== month - 1) return null; // 比如02/30会进位到3月，判定非法
  return next;
}

export function TodoFormModal({ visible, item, initialDate, onClose, onSaved, onDeleted }: TodoFormModalProps) {
  const isEdit = !!item;
  const { categories } = useTodoStore();
  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxHeight = windowHeight * 0.92;

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);
  const [important, setImportant] = useState(false);
  const [content, setContent] = useState('');
  const [dateObj, setDateObj] = useState(new Date());
  const [monthStr, setMonthStr] = useState('');
  const [dayStr, setDayStr] = useState('');
  const [repeatType, setRepeatType] = useState<TodoRepeatType>('none');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState<number | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderHourStr, setReminderHourStr] = useState('09');
  const [reminderMinuteStr, setReminderMinuteStr] = useState('00');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (item) {
      setCategoryId(item.category_id);
      setImportant(item.important);
      setContent(item.content);
      const d = parseDateKey(item.date);
      setDateObj(d);
      setMonthStr(pad2(d.getMonth() + 1));
      setDayStr(pad2(d.getDate()));
      setRepeatType(item.repeat_type);
      setWeekdays(item.repeat_weekdays ?? []);
      setDayOfMonth(item.repeat_day_of_month);
      setReminderEnabled(item.reminder_enabled);
      if (item.reminder_time) {
        const [h, m] = item.reminder_time.split(':');
        setReminderHourStr(h ?? '09');
        setReminderMinuteStr(m ?? '00');
      } else {
        setReminderHourStr('09');
        setReminderMinuteStr('00');
      }
    } else {
      setCategoryId(null);
      setImportant(false);
      setContent('');
      const d = initialDate ?? new Date();
      setDateObj(d);
      setMonthStr(pad2(d.getMonth() + 1));
      setDayStr(pad2(d.getDate()));
      setRepeatType('none');
      setWeekdays([]);
      setDayOfMonth(null);
      setReminderEnabled(false);
      setReminderHourStr('09');
      setReminderMinuteStr('00');
    }
    setCategoryPanelOpen(false);
  }, [visible, item, initialDate]);

  const selectedCategory = categoryId ? categories.find((c) => c.id === categoryId) ?? null : null;

  function commitDate(mStr: string, dStr: string) {
    const d = tryParseMonthDay(dateObj, mStr, dStr);
    if (d) setDateObj(d);
  }

  function selectCategory(id: string) {
    setCategoryId(id);
    setCategoryPanelOpen(false);
  }

  function handleManageCategoriesPress() {
    onClose();
    router.push('/todo-categories');
  }

  function toggleWeekday(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  async function persist(): Promise<boolean> {
    if (!content.trim()) {
      Alert.alert('写点什么呢？', '内容不能为空');
      return false;
    }
    if (repeatType === 'weekly' && weekdays.length === 0) {
      Alert.alert('选至少一个星期几', '每周重复要指定星期几，不然这条事项永远不会出现');
      return false;
    }
    if (repeatType === 'monthly' && dayOfMonth === null) {
      Alert.alert('选一个日期', '每月重复要指定哪一天，不然这条事项永远不会出现');
      return false;
    }
    const payload = {
      content: content.trim(),
      category_id: categoryId,
      important,
      date: toDateKey(dateObj),
      repeat_type: repeatType,
      repeat_weekdays: repeatType === 'weekly' ? weekdays : null,
      repeat_day_of_month: repeatType === 'monthly' ? dayOfMonth : null,
      reminder_enabled: reminderEnabled,
      reminder_time: reminderEnabled ? `${pad2(parseInt(reminderHourStr || '0', 10))}:${pad2(parseInt(reminderMinuteStr || '0', 10))}` : null,
    };
    if (item) {
      await updateItem(item.id, payload);
    } else {
      await addItem(payload);
    }
    return true;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const ok = await persist();
      if (ok) onSaved();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!item) return;
    Alert.alert('删除这条事项？', item.content, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteItem(item.id);
          onDeleted?.();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior="padding" style={styles.avoider}>
          <Pressable style={[styles.sheet, { maxHeight: sheetMaxHeight }]} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.topRow}>
                <Pressable style={styles.catTrigger} onPress={() => setCategoryPanelOpen((v) => !v)}>
                  <View style={[styles.catDot, { backgroundColor: selectedCategory?.color ?? colors.textMuted }]} />
                  <Text style={styles.catTriggerText} numberOfLines={1}>
                    {selectedCategory?.name ?? '选分类'}
                  </Text>
                  <Text style={styles.catTriggerArrow}>{categoryPanelOpen ? '▲' : '▼'}</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => setImportant((v) => !v)}>
                  <Text style={styles.starButton}>{important ? '★' : '☆'}</Text>
                </Pressable>
              </View>

              {categoryPanelOpen && (
                <View style={styles.catPanel}>
                  <View style={styles.catPanelGrid}>
                    {sortedCategories.map((c) => {
                      const active = categoryId === c.id;
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => selectCategory(c.id)}
                          style={[styles.catPanelChip, active ? { backgroundColor: c.color } : styles.catPanelChipInactive]}
                        >
                          <Text style={[styles.catPanelChipText, active && styles.catPanelChipTextActive]}>{c.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.catPanelDivider} />
                  <Pressable onPress={handleManageCategoriesPress}>
                    <Text style={styles.catPanelManage}>⚙ 管理</Text>
                  </Pressable>
                </View>
              )}

              <Text style={styles.label}>内容</Text>
              <TextInput
                style={styles.contentInput}
                value={content}
                onChangeText={setContent}
                placeholder="要做什么"
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
              />

              <Text style={styles.label}>日期（从这天开始）</Text>
              <View style={styles.dateRow}>
                <TextInput
                  style={styles.dateHmInput}
                  value={monthStr}
                  onChangeText={(v) => {
                    const d = digitsOnly(v);
                    setMonthStr(d);
                    commitDate(d, dayStr);
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="MM"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.dateSlash}>/</Text>
                <TextInput
                  style={styles.dateHmInput}
                  value={dayStr}
                  onChangeText={(v) => {
                    const d = digitsOnly(v);
                    setDayStr(d);
                    commitDate(monthStr, d);
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="DD"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <Text style={styles.label}>重复</Text>
              <View style={styles.repeatRow}>
                {REPEAT_OPTIONS.map((opt) => {
                  const active = repeatType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setRepeatType(opt.value)}
                      style={[styles.repeatChip, active && styles.repeatChipActive]}
                    >
                      <Text style={[styles.repeatChipText, active && styles.repeatChipTextActive]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {repeatType === 'weekly' && (
                <View style={styles.weekdayRow}>
                  {WEEKDAY_OPTIONS.map((opt) => {
                    const active = weekdays.includes(opt.value);
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => toggleWeekday(opt.value)}
                        style={[styles.weekdayChip, active && styles.weekdayChipActive]}
                      >
                        <Text style={[styles.weekdayChipText, active && styles.weekdayChipTextActive]}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {repeatType === 'monthly' && (
                <View style={styles.monthDayGrid}>
                  {MONTH_DAYS.map((d) => {
                    const active = dayOfMonth === d;
                    return (
                      <Pressable
                        key={d}
                        onPress={() => setDayOfMonth(d)}
                        style={[styles.monthDayChip, active && styles.monthDayChipActive]}
                      >
                        <Text style={[styles.monthDayChipText, active && styles.monthDayChipTextActive]}>{d}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={() => setDayOfMonth(LAST_DAY_VALUE)}
                    style={[styles.monthDayChip, styles.lastDayChip, dayOfMonth === LAST_DAY_VALUE && styles.monthDayChipActive]}
                  >
                    <Text style={[styles.monthDayChipText, dayOfMonth === LAST_DAY_VALUE && styles.monthDayChipTextActive]}>
                      最后一天
                    </Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.reminderRow}>
                <Text style={styles.label}>提醒</Text>
                {reminderEnabled && (
                  <View style={styles.reminderTimeRow}>
                    <TextInput
                      style={styles.dateHmInput}
                      value={reminderHourStr}
                      onChangeText={(v) => setReminderHourStr(digitsOnly(v))}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                    <Text style={styles.dateSlash}>:</Text>
                    <TextInput
                      style={styles.dateHmInput}
                      value={reminderMinuteStr}
                      onChangeText={(v) => setReminderMinuteStr(digitsOnly(v))}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                )}
                <Switch value={reminderEnabled} onValueChange={setReminderEnabled} />
              </View>
            </ScrollView>

            <View style={styles.actions}>
              {isEdit && (
                <Pressable style={styles.deleteButton} onPress={handleDelete}>
                  <Text style={styles.deleteButtonText}>删除</Text>
                </Pressable>
              )}
              <Pressable style={styles.outlineButton} onPress={onClose}>
                <Text style={styles.outlineButtonText}>取消</Text>
              </Pressable>
              <Pressable style={styles.solidButton} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.solidButtonText}>保存</Text>}
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.35)', justifyContent: 'center' },
  avoider: { width: '100%' },
  sheet: { backgroundColor: colors.card, borderRadius: 16, marginHorizontal: 16, padding: spacing.lg },
  scrollArea: { flexShrink: 1 },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  catTrigger: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  catDot: { width: 14, height: 14, borderRadius: 7 },
  catTriggerText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  catTriggerArrow: { fontSize: 11, color: colors.textMuted, marginLeft: 2 },
  starButton: { fontSize: 22, color: colors.yellowDark },

  catPanel: { backgroundColor: colors.background, borderRadius: 12, padding: spacing.sm, marginBottom: spacing.sm },
  catPanelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catPanelChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.button },
  catPanelChipInactive: { borderWidth: 1, borderColor: colors.textMuted },
  catPanelChipText: { fontSize: fontSize.body, color: colors.textSecondary },
  catPanelChipTextActive: { color: '#fff', fontWeight: '600' },
  catPanelDivider: { height: 1, backgroundColor: colors.card, marginVertical: spacing.sm },
  catPanelManage: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '600', textAlign: 'center' },

  label: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: 6, marginBottom: 4 },
  contentInput: {
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    minHeight: 60,
  },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateHmInput: {
    width: 44,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  dateSlash: { fontSize: fontSize.body, color: colors.textSecondary },

  repeatRow: { flexDirection: 'row', gap: spacing.sm },
  repeatChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.button, borderWidth: 1, borderColor: colors.textMuted },
  repeatChipActive: { backgroundColor: colors.purpleDark, borderColor: colors.purpleDark },
  repeatChipText: { fontSize: fontSize.body, color: colors.textSecondary },
  repeatChipTextActive: { color: '#fff', fontWeight: '600' },

  weekdayRow: { flexDirection: 'row', gap: 6, marginTop: spacing.sm },
  weekdayChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayChipActive: { backgroundColor: colors.purpleDark, borderColor: colors.purpleDark },
  weekdayChipText: { fontSize: fontSize.body, color: colors.textSecondary },
  weekdayChipTextActive: { color: '#fff', fontWeight: '600' },

  monthDayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  monthDayChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastDayChip: { width: 'auto', paddingHorizontal: spacing.sm, borderRadius: radius.button },
  monthDayChipActive: { backgroundColor: colors.purpleDark, borderColor: colors.purpleDark },
  monthDayChipText: { fontSize: fontSize.tiny, color: colors.textSecondary },
  monthDayChipTextActive: { color: '#fff', fontWeight: '600' },

  reminderRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm },
  reminderTimeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  deleteButton: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm, alignItems: 'center' },
  deleteButtonText: { color: colors.redDark, fontSize: fontSize.body },
  outlineButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.textMuted,
    alignItems: 'center',
  },
  outlineButtonText: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '600' },
  solidButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
  },
  solidButtonText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
});
