import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addLog, deleteLog, formatLogDuration, updateLog } from '../../lib/timelog';
import { MAX_POINTS, normalizePoints } from '../../lib/pointsCalc';
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
  /** 长按格子打开时：直接把光标放进「描述」、弹出键盘 */
  focusDescription?: boolean;
  /** 列表视图右下角 ＋ 新建：没有格子可以划，这时才让改时间；别处时间只显示一行，要改就在格子上重新划 */
  editableTime?: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function digitsOnly(v: string): string {
  return v.replace(/[^\d]/g, '').slice(0, 2);
}

function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 「16:00–20:00」；过了午夜的写「次日」 */
function timeRangeLabel(start: Date, end: Date): string {
  const nextDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() > new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  return `${hhmm(start)}–${nextDay ? '次日 ' : ''}${hhmm(end)}`;
}

/** 时+分都合法时才拼出一个新 Date，年月日沿用 base 的年月日——弹窗里不再让改日期 */
function tryParseTimePart(base: Date, hourStr: string, minuteStr: string): Date | null {
  if (!/^\d{1,2}$/.test(hourStr) || !/^\d{1,2}$/.test(minuteStr)) return null;
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  if (hour > 23 || minute > 59) return null;
  const next = new Date(base);
  next.setHours(hour, minute, 0, 0);
  return next;
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
  focusDescription,
  editableTime,
}: AddLogModalProps) {
  const { categories, tags } = useTimeLogStore();

  // sheet的高度上限改用useWindowDimensions算出的实际像素值，不再用CSS百分比
  // 字符串——sheet的父级(KeyboardAvoidingView的avoider)本身没有明确的高度
  // (只设了width:'100%')，百分比maxHeight在没有明确高度的祖先上，原生Yoga
  // 布局引擎跟react-native-web的解析方式不一致：web上表现正常，但在真机上
  // 会导致sheet算出的高度过小，把标签这类靠后的内容直接压扁挤没
  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxHeight = windowHeight * 0.92;

  // activeLog跟log prop初始一致，但「继续添加」保存一次后会变成null——
  // 之后的保存操作就变成新建而不是反复改同一条，配合表单一起重置成"新建"态
  const [activeLog, setActiveLog] = useState<TimeLog | null | undefined>(log);
  const isEdit = !!activeLog;

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [description, setDescription] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  // 打开弹窗那一刻已经挂着的标签排最前面；点的时候不重新排，免得标签跳位置
  const [pinnedTagIds, setPinnedTagIds] = useState<string[]>([]);
  // 积分：＋/－ 选一个（默认＋），框里填数字；空着或 0 就是这条不计分
  const [pointsSign, setPointsSign] = useState<1 | -1>(1);
  const [pointsStr, setPointsStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);

  // 不弹系统框：没选分类在底下说一句；删除点一下变「再点一次删除」
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const descRef = useRef<TextInput>(null);

  const [startHourStr, setStartHourStr] = useState('');
  const [startMinuteStr, setStartMinuteStr] = useState('');
  const [endHourStr, setEndHourStr] = useState('');
  const [endMinuteStr, setEndMinuteStr] = useState('');

  // 收起来（删掉）的分类 / 标签不让再选；正在改的这条已经挂着的标签照样显示，能取消
  const sortedCategories = categories.filter((c) => !c.archived).sort((a, b) => a.sort_order - b.sort_order);
  const visibleTags = tags
    .filter((t) => !t.archived || tagIds.includes(t.id) || pinnedTagIds.includes(t.id))
    .sort((a, b) => a.sort_order - b.sort_order);
  const sortedTags = [...visibleTags.filter((t) => pinnedTagIds.includes(t.id)), ...visibleTags.filter((t) => !pinnedTagIds.includes(t.id))];

  useEffect(() => {
    if (!visible) return;
    setActiveLog(log);
    let s: Date;
    let e: Date;
    if (log) {
      setCategoryId(log.category_id);
      s = new Date(log.start_time);
      e = new Date(log.end_time);
      setDescription(log.description ?? '');
      setTagIds(log.tag_ids ?? []);
      setPinnedTagIds(log.tag_ids ?? []);
      const p = normalizePoints(log.points);
      setPointsSign(p != null && p < 0 ? -1 : 1);
      setPointsStr(p != null ? String(Math.abs(p)) : '');
    } else {
      setCategoryId(initialCategoryId ?? null);
      s = initialStart ?? new Date();
      e = initialEnd ?? new Date();
      const cat = categories.find((c) => c.id === initialCategoryId);
      setDescription(cat?.default_description ?? '');
      setTagIds([]);
      setPinnedTagIds([]);
      setPointsSign(1);
      setPointsStr('');
    }
    setStart(s);
    setEnd(e);
    setStartHourStr(pad2(s.getHours()));
    setStartMinuteStr(pad2(s.getMinutes()));
    setEndHourStr(pad2(e.getHours()));
    setEndMinuteStr(pad2(e.getMinutes()));
    setCategoryPanelOpen(false);
    setError(null);
    setConfirmDelete(false);
  }, [visible, log, initialCategoryId, initialStart, initialEnd]);

  // 长按打开时直接弹键盘：不能在输入框一出现就抢焦点（autoFocus）——那会儿弹窗的窗口还没真正显示，
  // 安卓不给弹键盘，可输入框已经被记成「聚焦了」，之后再 focus() 会被当成重复而跳过。
  // 所以等弹窗真正显示出来（onShow）再聚焦；万一 onShow 没来，过一会儿补一次
  const shownRef = useRef(false);
  function focusDescriptionNow() {
    const el = descRef.current;
    if (!el) return;
    if (el.isFocused()) el.blur();
    requestAnimationFrame(() => descRef.current?.focus());
  }
  function handleShow() {
    shownRef.current = true;
    if (focusDescription) focusDescriptionNow();
  }
  useEffect(() => {
    if (!visible) {
      shownRef.current = false;
      return;
    }
    if (!focusDescription) return;
    const t = setTimeout(() => {
      if (!shownRef.current) descRef.current?.focus();
    }, 700);
    return () => clearTimeout(t);
  }, [visible, focusDescription]);

  const selectedCategory = categoryId ? categories.find((c) => c.id === categoryId) ?? null : null;

  function commitStart(hourStr: string, minuteStr: string) {
    const d = tryParseTimePart(start, hourStr, minuteStr);
    if (d) setStart(d);
  }
  function commitEnd(hourStr: string, minuteStr: string) {
    const d = tryParseTimePart(end, hourStr, minuteStr);
    if (d) setEnd(d);
  }

  function toggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function selectCategory(id: string) {
    setCategoryId(id);
    setCategoryPanelOpen(false);
  }

  function handleManageCategoriesPress() {
    onClose();
    router.push('/timelog-categories');
  }
  function handleManageTagsPress() {
    onClose();
    router.push('/timelog-tags');
  }

  // 保存时兜底：如果这会儿end<=start（编辑时手滑打出不合理的数），静默拉到start+5分钟，
  // 不当场打断用户输入
  function clampedEnd(): Date {
    return end.getTime() > start.getTime() ? end : new Date(start.getTime() + 5 * 60_000);
  }

  async function persist(): Promise<boolean> {
    if (!categoryId) {
      setError('选个分类吧：这段时间是做什么的？');
      setCategoryPanelOpen(true);
      return false;
    }
    setError(null);
    const payload = {
      category_id: categoryId,
      start_time: start.toISOString(),
      end_time: clampedEnd().toISOString(),
      description: description.trim() || null,
      tag_ids: tagIds,
      points: pointsStr ? normalizePoints(pointsSign * parseInt(pointsStr, 10)) : null,
    };
    if (activeLog) {
      await updateLog(activeLog.id, payload);
    } else {
      await addLog(payload);
    }
    return true;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const ok = await persist();
      if (ok) onSaved();
    } catch (err) {
      setError(`没存上：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  // 继续添加：把当前这条存掉，但不关弹窗——清空描述/标签，保留分类和时间段，
  // 并把activeLog置空，让下一次保存变成新建而不是反复覆盖同一条
  async function handleSaveAndContinue() {
    setSaving(true);
    try {
      const ok = await persist();
      if (ok) {
        setActiveLog(null);
        setDescription('');
        setTagIds([]);
        setPinnedTagIds([]);
        setPointsSign(1);
        setPointsStr('');
      }
    } catch (err) {
      setError(`没存上：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!activeLog) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteLog(activeLog.id);
    onDeleted?.();
  }

  const durationMin = Math.max(0, (clampedEnd().getTime() - start.getTime()) / 60000);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={handleShow}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior="padding" style={styles.avoider}>
          <Pressable style={[styles.sheet, { maxHeight: sheetMaxHeight }]} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              style={styles.scrollArea}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.topRow}>
                <Pressable style={styles.catTrigger} onPress={() => setCategoryPanelOpen((v) => !v)}>
                  <View style={[styles.catDot, { backgroundColor: selectedCategory?.color ?? colors.textMuted }]} />
                  <Text style={styles.catTriggerText} numberOfLines={1}>
                    {selectedCategory?.name ?? '选分类'}
                  </Text>
                  <Text style={styles.catTriggerArrow}>{categoryPanelOpen ? '▲' : '▼'}</Text>
                </Pressable>
                <View style={styles.durationPill}>
                  <Text style={styles.durationPillText}>{formatLogDuration(durationMin)}</Text>
                </View>
              </View>

              {editableTime ? (
                <View style={styles.timeGroupsRow}>
                  <View style={styles.timeGroup}>
                    <Text style={styles.timeGroupLabel}>上尾</Text>
                    <View style={styles.timeInputRow}>
                      <TextInput
                        style={styles.hmInput}
                        value={startHourStr}
                        onChangeText={(v) => {
                          const d = digitsOnly(v);
                          setStartHourStr(d);
                          commitStart(d, startMinuteStr);
                        }}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                      <Text style={styles.colon}>:</Text>
                      <TextInput
                        style={styles.hmInput}
                        value={startMinuteStr}
                        onChangeText={(v) => {
                          const d = digitsOnly(v);
                          setStartMinuteStr(d);
                          commitStart(startHourStr, d);
                        }}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                    </View>
                  </View>
                  <View style={styles.timeGroup}>
                    <Text style={styles.timeGroupLabel}>下始</Text>
                    <View style={styles.timeInputRow}>
                      <TextInput
                        style={styles.hmInput}
                        value={endHourStr}
                        onChangeText={(v) => {
                          const d = digitsOnly(v);
                          setEndHourStr(d);
                          commitEnd(d, endMinuteStr);
                        }}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                      <Text style={styles.colon}>:</Text>
                      <TextInput
                        style={styles.hmInput}
                        value={endMinuteStr}
                        onChangeText={(v) => {
                          const d = digitsOnly(v);
                          setEndMinuteStr(d);
                          commitEnd(endHourStr, d);
                        }}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <Text style={styles.timeLine} testID="log-time">
                  {timeRangeLabel(start, clampedEnd())}
                </Text>
              )}

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

              <View style={styles.pointsRow}>
                <Text style={styles.pointsLabel}>积分</Text>
                <Pressable
                  style={[styles.signButton, pointsSign === 1 && styles.signPlusOn]}
                  onPress={() => setPointsSign(1)}
                  hitSlop={4}
                  testID="points-plus"
                  aria-selected={pointsSign === 1}
                >
                  <Text style={[styles.signText, pointsSign === 1 && styles.signTextOn]}>＋</Text>
                </Pressable>
                <Pressable
                  style={[styles.signButton, pointsSign === -1 && styles.signMinusOn]}
                  onPress={() => setPointsSign(-1)}
                  hitSlop={4}
                  testID="points-minus"
                  aria-selected={pointsSign === -1}
                >
                  <Text style={[styles.signText, pointsSign === -1 && styles.signTextOn]}>－</Text>
                </Pressable>
                <TextInput
                  style={[styles.pointsInput, pointsStr ? { color: pointsSign === 1 ? colors.greenDark : colors.redDark } : null]}
                  value={pointsStr}
                  onChangeText={(v) => setPointsStr(v.replace(/[^\d]/g, '').slice(0, String(MAX_POINTS).length))}
                  keyboardType="number-pad"
                  maxLength={String(MAX_POINTS).length}
                  placeholder="不计分"
                  placeholderTextColor={colors.textMuted}
                  testID="points-input"
                />
              </View>

              <Text style={styles.label}>描述</Text>
              <TextInput
                style={styles.descInput}
                value={description}
                onChangeText={setDescription}
                placeholder="发生了什么"
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                ref={descRef}
                testID="log-desc"
              />

              <View style={styles.tagHeaderRow}>
                <Text style={styles.label}>标签</Text>
                <Pressable onPress={handleManageTagsPress}>
                  <Text style={styles.tagManageLink}>管理 ›</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.tagScroll}
                contentContainerStyle={styles.tagRow}
                testID="log-tags"
              >
                {sortedTags.map((t) => {
                  const active = tagIds.includes(t.id);
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => toggleTag(t.id)}
                      style={[styles.tagChip, { borderColor: t.color }, active && { backgroundColor: t.color }]}
                    >
                      <Text style={[styles.tagChipText, { color: active ? '#fff' : t.color }]} numberOfLines={1}>
                        {t.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </ScrollView>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.actions}>
              {isEdit ? (
                <>
                  <Pressable style={styles.deleteButton} onPress={handleDelete} testID="log-delete">
                    <Text style={styles.deleteButtonText}>{confirmDelete ? '再点删除' : '删除'}</Text>
                  </Pressable>
                  <Pressable style={styles.outlineButton} onPress={handleSaveAndContinue} disabled={saving}>
                    <Text style={styles.outlineButtonText}>继续添加</Text>
                  </Pressable>
                  <Pressable style={styles.solidButton} onPress={handleSave} disabled={saving} testID="log-save">
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.solidButtonText}>修改</Text>}
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable style={styles.outlineButton} onPress={onClose}>
                    <Text style={styles.outlineButtonText}>取消</Text>
                  </Pressable>
                  <Pressable style={styles.solidButton} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.solidButtonText}>保存</Text>}
                  </Pressable>
                </>
              )}
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  errorText: { fontSize: fontSize.secondary, color: colors.redDark, marginTop: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.35)', justifyContent: 'center' },
  avoider: { width: '100%' },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginHorizontal: 16,
    padding: spacing.lg,
  },
  // flexShrink让ScrollView在sheet被maxHeight限高时自己收缩出内部滚动，
  // 而不是把actions一起挤出maxHeight顶到不可见——actions是ScrollView的
  // 兄弟节点而不是滚动内容的一部分，才能保证它始终贴底可见
  scrollArea: { flexShrink: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  catTrigger: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  catDot: { width: 14, height: 14, borderRadius: 7 },
  catTriggerText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  catTriggerArrow: { fontSize: 11, color: colors.textMuted, marginLeft: 2 },
  durationPill: { backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  durationPillText: { fontSize: fontSize.tiny, color: colors.textSecondary, fontWeight: '600' },

  timeLine: { fontSize: fontSize.body, color: colors.textSecondary, fontWeight: '600', marginBottom: 6 },
  timeGroupsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 6 },

  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 2 },
  pointsLabel: { fontSize: fontSize.secondary, color: colors.textSecondary, marginRight: 4 },
  signButton: { width: 36, height: 32, borderRadius: 8, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  signPlusOn: { backgroundColor: colors.greenDark },
  signMinusOn: { backgroundColor: colors.redDark },
  signText: { fontSize: 16, fontWeight: '700', color: colors.textMuted },
  signTextOn: { color: '#fff' },
  pointsInput: {
    width: 72,
    height: 32,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 0,
    fontSize: fontSize.cardName,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  timeGroup: { flex: 1 },
  timeGroupLabel: { fontSize: fontSize.tiny, color: colors.textMuted, marginBottom: 4 },
  timeInputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hmInput: {
    width: 44,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  colon: { fontSize: fontSize.body, color: colors.textSecondary },

  catPanel: { backgroundColor: colors.background, borderRadius: 12, padding: spacing.sm, marginBottom: spacing.sm },
  catPanelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catPanelChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.button },
  catPanelChipInactive: { borderWidth: 1, borderColor: colors.textMuted },
  catPanelChipText: { fontSize: fontSize.body, color: colors.textSecondary },
  catPanelChipTextActive: { color: '#fff', fontWeight: '600' },
  catPanelDivider: { height: 1, backgroundColor: colors.card, marginVertical: spacing.sm },
  catPanelManage: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '600', textAlign: 'center' },

  label: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: 6, marginBottom: 4 },
  descInput: {
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    minHeight: 60,
  },

  tagHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  tagManageLink: { fontSize: fontSize.tiny, color: colors.purpleDark, fontWeight: '600' },
  tagScroll: { marginTop: 4, flexGrow: 0 },
  tagRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.sm },
  tagChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.button, borderWidth: 1 },
  tagChipText: { fontSize: fontSize.body, fontWeight: '500' },

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
