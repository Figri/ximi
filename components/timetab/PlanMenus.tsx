import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize } from '../../constants/theme';
import {
  applyDayTemplate,
  applyWeekTemplate,
  dayLabel,
  daySlotsOf,
  deleteTemplate,
  renameTemplate,
  saveDayTemplate,
  saveWeekTemplate,
  setRange,
  snapshotDays,
  toggleDefaultWeek,
  usePlanStore,
  WEEKDAY_CN,
  writeDays,
  type DaySlots,
} from '../../lib/plan';
import { useTimeLogStore } from '../../lib/timelogStore';

export type PlanToast = (text: string, undo?: Record<string, DaySlots | null>) => void;

/** 一天 24 格的彩条缩略图 */
function MiniDay({ slots, cell = 5, height = 9 }: { slots: DaySlots; cell?: number; height?: number }) {
  const categories = useTimeLogStore((s) => s.categories);
  const colorOf = (id: string) => categories.find((c) => c.id === id)?.color ?? colors.textMuted;
  return (
    <View style={[styles.mini, { borderRadius: Math.min(3, height / 2) }]}>
      {slots.map((s, h) => (
        <View key={h} style={{ width: cell, height, backgroundColor: s ? colorOf(s.c) : '#ECE8F1' }} />
      ))}
    </View>
  );
}

/** 周模板缩略图：7 行彩条 */
function MiniWeek({ days }: { days: DaySlots[] }) {
  return (
    <View style={{ gap: 1 }}>
      {days.map((d, i) => (
        <MiniDay key={i} slots={d} cell={3.6} height={3} />
      ))}
    </View>
  );
}

function Sheet({ visible, onClose, children, testID }: { visible: boolean; onClose: () => void; children: React.ReactNode; testID: string }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID={`${testID}-backdrop`}>
        <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} testID={testID}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.handle} />
              {children}
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function DayChips({ keys, picked, onToggle, disabled }: { keys: string[]; picked: string[]; onToggle: (k: string) => void; disabled?: string[] }) {
  return (
    <View style={styles.dayChips}>
      {keys.map((k, i) => {
        const on = picked.includes(k);
        const off = disabled?.includes(k);
        return (
          <Pressable key={k} onPress={() => !off && onToggle(k)} style={[styles.dayChip, on && styles.dayChipOn, off && { opacity: 0.3 }]} testID={`pick-day-${i}`}>
            <Text style={[styles.dayChipText, on && { color: '#fff' }]}>{WEEKDAY_CN[i]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------- 长按某一天 ----------------

interface DayMenuProps {
  dayKey: string | null;
  /** 这天所在那周（复制到其他天用） */
  weekKeys: string[];
  /** 周日程里有「复制到其他天」，对照里没有 */
  allowCopy: boolean;
  onClose: () => void;
  onToast: PlanToast;
}

/** 长按星期几 / 日期：套用日模板 ▸ / 存成日模板 / 复制到其他天 / 清空这天 */
export function DayMenu({ dayKey, weekKeys, allowCopy, onClose, onToast }: DayMenuProps) {
  const days = usePlanStore((s) => s.days);
  const dayTemplates = usePlanStore((s) => s.templates.days);
  const [open, setOpen] = useState<'apply' | 'save' | 'copy' | null>(null);
  const [name, setName] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setOpen(null);
    setName('');
    setTargets([]);
    setConfirmClear(false);
  }, [dayKey]);

  if (!dayKey) return <Sheet visible={false} onClose={onClose} testID="day-menu">{null}</Sheet>;
  const slots = daySlotsOf(days, dayKey);
  const isEmpty = !days[dayKey];

  async function apply(id: string, tplName: string) {
    const before = await applyDayTemplate(id, [dayKey!]);
    onClose();
    if (before) onToast(`${dayLabel(dayKey!)} 套用了「${tplName}」`, before);
  }
  async function save() {
    const t = await saveDayTemplate(name || dayLabel(dayKey!), slots);
    onClose();
    onToast(`存成了日模板「${t.name}」`);
  }
  async function copy() {
    if (targets.length === 0) return;
    const before = snapshotDays(targets);
    const patch: Record<string, DaySlots | null> = {};
    for (const k of targets) patch[k] = isEmpty ? null : slots.map((s) => (s ? { ...s } : null));
    await writeDays(patch);
    onClose();
    onToast(`复制到了 ${targets.length} 天`, before);
  }
  async function clear() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    const before = snapshotDays([dayKey!]);
    await setRange([dayKey!], 0, 24, null);
    onClose();
    onToast(`清空了 ${dayLabel(dayKey!)}`, before);
  }

  return (
    <Sheet visible onClose={onClose} testID="day-menu">
      <View style={styles.titleRow}>
        <Text style={styles.title}>{dayLabel(dayKey)}</Text>
        <MiniDay slots={slots} />
      </View>

      <Pressable style={styles.item} onPress={() => setOpen(open === 'apply' ? null : 'apply')} testID="day-menu-apply">
        <Text style={styles.itemText}>套用日模板</Text>
        <Text style={styles.itemArrow}>{open === 'apply' ? '▾' : '▸'}</Text>
      </Pressable>
      {open === 'apply' ? (
        dayTemplates.length === 0 ? (
          <Text style={styles.note}>还没有日模板。把排好的一天「存成日模板」就有了。</Text>
        ) : (
          dayTemplates.map((t) => (
            <Pressable key={t.id} style={styles.subItem} onPress={() => apply(t.id, t.name)} testID={`day-menu-tpl-${t.name}`}>
              <MiniDay slots={t.slots} cell={4} height={8} />
              <Text style={styles.subItemText}>{t.name}</Text>
            </Pressable>
          ))
        )
      ) : null}

      <Pressable style={styles.item} onPress={() => setOpen(open === 'save' ? null : 'save')} testID="day-menu-save">
        <Text style={styles.itemText}>存成日模板</Text>
        <Text style={styles.itemArrow}>{open === 'save' ? '▾' : '▸'}</Text>
      </Pressable>
      {open === 'save' ? (
        isEmpty ? (
          <Text style={styles.note}>这天还没排剧本，先排好再存。</Text>
        ) : (
          <View style={styles.inlineRow}>
            <TextInput
              style={styles.inlineInput}
              value={name}
              onChangeText={setName}
              placeholder="起个名，比如 工作日"
              placeholderTextColor={colors.textMuted}
              maxLength={12}
              autoFocus
              testID="day-menu-name"
            />
            <Pressable style={styles.inlineBtn} onPress={save} testID="day-menu-save-ok">
              <Text style={styles.inlineBtnText}>存</Text>
            </Pressable>
          </View>
        )
      ) : null}

      {allowCopy ? (
        <>
          <Pressable style={styles.item} onPress={() => setOpen(open === 'copy' ? null : 'copy')} testID="day-menu-copy">
            <Text style={styles.itemText}>复制到其他天</Text>
            <Text style={styles.itemArrow}>{open === 'copy' ? '▾' : '▸'}</Text>
          </Pressable>
          {open === 'copy' ? (
            <View style={styles.inlineRow}>
              <DayChips
                keys={weekKeys}
                picked={targets}
                disabled={[dayKey]}
                onToggle={(k) => setTargets((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]))}
              />
              <Pressable style={[styles.inlineBtn, targets.length === 0 && styles.inlineBtnOff]} onPress={copy} testID="day-menu-copy-ok">
                <Text style={styles.inlineBtnText}>复制</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}

      <Pressable style={[styles.item, styles.itemLast]} onPress={clear} disabled={isEmpty} testID="day-menu-clear">
        <Text style={[styles.itemText, { color: isEmpty ? colors.textMuted : colors.redDark }]}>
          {isEmpty ? '这天还没有剧本' : confirmClear ? '再点一次清空' : '清空这天的剧本'}
        </Text>
      </Pressable>
    </Sheet>
  );
}

// ---------------- 模板 ----------------

interface TemplateSheetProps {
  visible: boolean;
  weekKeys: string[];
  onClose: () => void;
  onToast: PlanToast;
}

type Editing = { kind: 'day' | 'week'; id: string; mode: 'menu' | 'rename' | 'apply'; confirmDelete?: boolean } | null;

/** 「模板」：周模板（套用到这周 / 存这周 / ★ 默认）、日模板（套用到哪几天 / 存某一天） */
export function TemplateSheet({ visible, weekKeys, onClose, onToast }: TemplateSheetProps) {
  const days = usePlanStore((s) => s.days);
  const templates = usePlanStore((s) => s.templates);
  const [editing, setEditing] = useState<Editing>(null);
  const [renameText, setRenameText] = useState('');
  const [applyDays, setApplyDays] = useState<string[]>([]);
  const [newWeek, setNewWeek] = useState<string | null>(null);
  const [newDay, setNewDay] = useState<{ key: string | null; name: string } | null>(null);

  useEffect(() => {
    if (!visible) {
      setEditing(null);
      setNewWeek(null);
      setNewDay(null);
      setApplyDays([]);
    }
  }, [visible]);

  const weekEmpty = weekKeys.every((k) => !days[k]);

  async function applyWeek(id: string, name: string) {
    const before = await applyWeekTemplate(id, weekKeys);
    onClose();
    if (before) onToast(`这周套用了「${name}」`, before);
  }
  async function saveWeek() {
    const t = await saveWeekTemplate(newWeek || '周模板', weekKeys);
    setNewWeek(null);
    onToast(`存成了周模板「${t.name}」`);
  }
  async function applyDay(id: string, name: string) {
    if (applyDays.length === 0) return;
    const before = await applyDayTemplate(id, applyDays);
    onClose();
    if (before) onToast(`${applyDays.length} 天套用了「${name}」`, before);
  }
  async function saveDay() {
    if (!newDay?.key) return;
    const t = await saveDayTemplate(newDay.name || dayLabel(newDay.key), daySlotsOf(days, newDay.key));
    setNewDay(null);
    onToast(`存成了日模板「${t.name}」`);
  }
  async function doRename() {
    if (!editing) return;
    await renameTemplate(editing.kind, editing.id, renameText);
    setEditing(null);
  }
  async function doDelete() {
    if (!editing) return;
    if (!editing.confirmDelete) {
      setEditing({ ...editing, confirmDelete: true });
      return;
    }
    await deleteTemplate(editing.kind, editing.id);
    setEditing(null);
  }

  function rowActions(kind: 'day' | 'week', id: string, name: string, isDefault?: boolean) {
    if (!editing || editing.id !== id || editing.mode === 'apply') return null;
    if (editing.mode === 'rename') {
      return (
        <View style={styles.inlineRow}>
          <TextInput style={styles.inlineInput} value={renameText} onChangeText={setRenameText} maxLength={12} autoFocus testID="tpl-rename-input" />
          <Pressable style={styles.inlineBtn} onPress={doRename} testID="tpl-rename-ok">
            <Text style={styles.inlineBtnText}>好</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.actions}>
        <Pressable
          style={styles.action}
          onPress={() => {
            setRenameText(name);
            setEditing({ kind, id, mode: 'rename' });
          }}
          testID="tpl-act-rename"
        >
          <Text style={styles.actionText}>改名</Text>
        </Pressable>
        {kind === 'week' ? (
          <Pressable
            style={styles.action}
            onPress={async () => {
              await toggleDefaultWeek(id);
              setEditing(null);
            }}
            testID="tpl-act-default"
          >
            <Text style={styles.actionText}>{isDefault ? '取消默认' : '设为默认'}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.action} onPress={doDelete} testID="tpl-act-delete">
          <Text style={[styles.actionText, { color: colors.redDark }]}>{editing.confirmDelete ? '再点一次删除' : '删除'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} testID="tpl-sheet">
      <View style={styles.titleRow}>
        <Text style={styles.title}>模板</Text>
      </View>

      <Text style={styles.sec}>周模板</Text>
      {templates.weeks.length === 0 ? <Text style={styles.note}>还没有周模板。排好一周，点下面存起来。</Text> : null}
      {templates.weeks.map((t) => {
        const isDefault = templates.defaultWeekId === t.id;
        return (
          <View key={t.id} style={styles.tRowWrap}>
            <Pressable
              style={styles.tRow}
              onLongPress={() => setEditing({ kind: 'week', id: t.id, mode: 'menu' })}
              delayLongPress={400}
              testID={`tpl-week-${t.name}`}
            >
              <MiniWeek days={t.days} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.tName} numberOfLines={1}>
                    {t.name}
                  </Text>
                  {isDefault ? <Text style={styles.star}>★ 默认</Text> : null}
                </View>
                {isDefault ? <Text style={styles.tSub}>新的一周空着时，自动用它填好</Text> : null}
              </View>
              <Pressable style={styles.tBtn} onPress={() => applyWeek(t.id, t.name)} testID={`tpl-week-apply-${t.name}`}>
                <Text style={styles.tBtnText}>套用到这周</Text>
              </Pressable>
            </Pressable>
            {rowActions('week', t.id, t.name, isDefault)}
          </View>
        );
      })}
      {newWeek == null ? (
        <Pressable onPress={() => !weekEmpty && setNewWeek('')} testID="tpl-week-new">
          <Text style={[styles.add, weekEmpty && { color: colors.textMuted }]}>{weekEmpty ? '这周还没排剧本，排好了才能存成周模板' : '＋ 把这周存成周模板'}</Text>
        </Pressable>
      ) : (
        <View style={styles.inlineRow}>
          <TextInput
            style={styles.inlineInput}
            value={newWeek}
            onChangeText={setNewWeek}
            placeholder="起个名，比如 平常周"
            placeholderTextColor={colors.textMuted}
            maxLength={12}
            autoFocus
            testID="tpl-week-name"
          />
          <Pressable style={styles.inlineBtn} onPress={saveWeek} testID="tpl-week-save">
            <Text style={styles.inlineBtnText}>存</Text>
          </Pressable>
        </View>
      )}

      <Text style={[styles.sec, { marginTop: 14 }]}>日模板</Text>
      {templates.days.length === 0 ? <Text style={styles.note}>还没有日模板。</Text> : null}
      {templates.days.map((t) => {
        const applying = editing?.id === t.id && editing.mode === 'apply';
        return (
          <View key={t.id} style={styles.tRowWrap}>
            <Pressable
              style={styles.tRow}
              onLongPress={() => setEditing({ kind: 'day', id: t.id, mode: 'menu' })}
              delayLongPress={400}
              testID={`tpl-day-${t.name}`}
            >
              <MiniDay slots={t.slots} cell={4.5} height={9} />
              <Text style={[styles.tName, { flex: 1 }]} numberOfLines={1}>
                {t.name}
              </Text>
              <Pressable
                style={[styles.tBtn, applying && styles.tBtnOn]}
                onPress={() => {
                  setApplyDays([]);
                  setEditing(applying ? null : { kind: 'day', id: t.id, mode: 'apply' });
                }}
                testID={`tpl-day-apply-${t.name}`}
              >
                <Text style={[styles.tBtnText, applying && { color: '#fff' }]}>套用到…</Text>
              </Pressable>
            </Pressable>
            {applying ? (
              <View style={styles.inlineRow}>
                <DayChips keys={weekKeys} picked={applyDays} onToggle={(k) => setApplyDays((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]))} />
                <Pressable style={[styles.inlineBtn, applyDays.length === 0 && styles.inlineBtnOff]} onPress={() => applyDay(t.id, t.name)} testID="tpl-day-apply-ok">
                  <Text style={styles.inlineBtnText}>套用</Text>
                </Pressable>
              </View>
            ) : null}
            {rowActions('day', t.id, t.name)}
          </View>
        );
      })}
      {newDay == null ? (
        <Pressable onPress={() => setNewDay({ key: null, name: '' })} testID="tpl-day-new">
          <Text style={styles.add}>＋ 把某一天存成日模板</Text>
        </Pressable>
      ) : (
        <View>
          <Text style={styles.note}>存哪一天：</Text>
          <DayChips
            keys={weekKeys}
            picked={newDay.key ? [newDay.key] : []}
            disabled={weekKeys.filter((k) => !days[k])}
            onToggle={(k) => setNewDay((d) => ({ key: k, name: d?.name ?? '' }))}
          />
          <View style={[styles.inlineRow, { marginTop: 8 }]}>
            <TextInput
              style={styles.inlineInput}
              value={newDay.name}
              onChangeText={(v) => setNewDay((d) => ({ key: d?.key ?? null, name: v }))}
              placeholder="起个名，比如 游泳日"
              placeholderTextColor={colors.textMuted}
              maxLength={12}
              testID="tpl-day-name"
            />
            <Pressable style={[styles.inlineBtn, !newDay.key && styles.inlineBtnOff]} onPress={saveDay} testID="tpl-day-save">
              <Text style={styles.inlineBtnText}>存</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingBottom: 24, maxHeight: 600 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD6E6', marginTop: 8, marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 },
  title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  titleNote: { fontSize: fontSize.secondary, color: colors.textMuted },
  mini: { flexDirection: 'row', overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E6E0EE' },
  itemLast: { borderBottomWidth: 0 },
  itemText: { fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
  itemArrow: { fontSize: 13, color: colors.textMuted },
  subItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingLeft: 8 },
  subItemText: { fontSize: 14, color: colors.textPrimary },
  note: { fontSize: fontSize.body, color: colors.textMuted, paddingVertical: 6 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  inlineInput: { flex: 1, height: 40, borderRadius: 10, backgroundColor: colors.background, paddingHorizontal: 10, fontSize: 14, color: colors.textPrimary },
  inlineBtn: { height: 36, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.purpleDark, alignItems: 'center', justifyContent: 'center' },
  inlineBtnOff: { backgroundColor: colors.purple },
  inlineBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  dayChips: { flexDirection: 'row', gap: 5, flexShrink: 1, flexWrap: 'wrap' },
  dayChip: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.purpleLight, alignItems: 'center', justifyContent: 'center' },
  dayChipOn: { backgroundColor: colors.purpleDark },
  dayChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  sec: { fontSize: fontSize.body, color: colors.textMuted, marginBottom: 4 },
  tRowWrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E6E0EE' },
  tRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  tName: { fontSize: 15, color: colors.textPrimary, fontWeight: '600', flexShrink: 1 },
  tSub: { fontSize: fontSize.secondary, color: colors.textMuted, marginTop: 2 },
  star: { fontSize: 10, color: '#B07A00', backgroundColor: '#FFF1CF', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  tBtn: { borderWidth: 1.5, borderColor: colors.purpleDark, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 5 },
  tBtnOn: { backgroundColor: colors.purpleDark },
  tBtnText: { fontSize: 12.5, color: colors.purpleDark, fontWeight: '700' },
  add: { fontSize: 14, color: colors.purpleDark, paddingVertical: 10, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  action: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.purpleLight },
  actionText: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
});
