import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize } from '../../constants/theme';
import { HOURS_PER_DAY, planInk, planTint, setRange, snapshotDays, type DaySlots } from '../../lib/plan';
import { useTimeLogStore } from '../../lib/timelogStore';
import type { PlanPick } from './PlanColumn';

interface PlanSheetProps {
  /** null = 不显示 */
  pick: PlanPick | null;
  /** 标题右边的小字：「11月1日 周日」「周一到周五 · 5 天」 */
  subtitle: string;
  onClose: () => void;
  onSaved: () => void;
  /** 删了：把删之前的样子交出去，页面底下出「已删除 · 撤销」 */
  onDeleted: (before: Record<string, DaySlots | null>) => void;
}

function hh(h: number): string {
  return `${h}:00`;
}

/** 「改剧本」：时间（整点，−/＋ 一下一小时）、分类、一行字；删除 / 确定。点外面关掉 */
export function PlanSheet({ pick, subtitle, onClose, onSaved, onDeleted }: PlanSheetProps) {
  const categories = useTimeLogStore((s) => s.categories);
  const fetchAll = useTimeLogStore((s) => s.fetchAll);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(1);
  const [cat, setCat] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (categories.length === 0) fetchAll();
  }, []);

  useEffect(() => {
    if (!pick) return;
    setFrom(pick.from);
    setTo(pick.to);
    setCat(pick.slot?.c ?? null);
    setText(pick.slot?.d ?? '');
    setBusy(false);
  }, [pick]);

  const active = categories.filter((c) => !c.archived).sort((a, b) => a.sort_order - b.sort_order);
  // 这块剧本用的分类后来被删了（收起来了）：照样放在最前面，能看出原来是什么
  const current = cat ? categories.find((c) => c.id === cat) : null;
  const chips = current && current.archived ? [current, ...active] : active;

  const canDelete = !!pick && (!!pick.origin || !!pick.slot);

  async function save() {
    if (!pick || !cat || busy) return;
    setBusy(true);
    if (pick.origin) await setRange(pick.keys, pick.origin.from, pick.origin.to, null);
    await setRange(pick.keys, from, to, { c: cat, d: text });
    onSaved();
  }

  async function remove() {
    if (!pick || busy) return;
    setBusy(true);
    const range = pick.origin ?? { from, to };
    const before = snapshotDays(pick.keys);
    await setRange(pick.keys, range.from, range.to, null);
    onDeleted(before);
  }

  return (
    <Modal visible={!!pick} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="plan-sheet-backdrop">
        <KeyboardAvoidingView behavior="padding" style={styles.avoider}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} testID="plan-sheet">
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.handle} />
              <View style={styles.titleRow}>
                <Text style={styles.title}>{pick?.origin || pick?.slot ? '改剧本' : '排剧本'}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>时间</Text>
                <View style={styles.stepper}>
                  <Pressable onPress={() => setFrom((v) => Math.max(0, v - 1))} hitSlop={6} testID="plan-from-minus">
                    <Text style={styles.stepBtn}>−</Text>
                  </Pressable>
                  <Text style={styles.stepVal} testID="plan-from">
                    {hh(from)}
                  </Text>
                  <Pressable onPress={() => setFrom((v) => Math.min(to - 1, v + 1))} hitSlop={6} testID="plan-from-plus">
                    <Text style={styles.stepBtn}>＋</Text>
                  </Pressable>
                </View>
                <Text style={styles.dash}>–</Text>
                <View style={styles.stepper}>
                  <Pressable onPress={() => setTo((v) => Math.max(from + 1, v - 1))} hitSlop={6} testID="plan-to-minus">
                    <Text style={styles.stepBtn}>−</Text>
                  </Pressable>
                  <Text style={styles.stepVal} testID="plan-to">
                    {hh(to)}
                  </Text>
                  <Pressable onPress={() => setTo((v) => Math.min(HOURS_PER_DAY, v + 1))} hitSlop={6} testID="plan-to-plus">
                    <Text style={styles.stepBtn}>＋</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.chips}>
                {chips.map((c) => {
                  const on = c.id === cat;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setCat(c.id)}
                      style={[styles.chip, { backgroundColor: on ? c.color : planTint(c.color) }, on && styles.chipOn]}
                      testID={`plan-cat-${c.name}`}
                    >
                      <Text style={[styles.chipText, { color: on ? '#fff' : planInk(c.color) }, on && styles.chipTextOn]}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="写点什么，可不填"
                placeholderTextColor={colors.textMuted}
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={save}
                testID="plan-text"
              />

              <View style={styles.btns}>
                {canDelete ? (
                  <Pressable style={styles.del} onPress={remove} testID="plan-delete">
                    <Text style={styles.delText}>删除</Text>
                  </Pressable>
                ) : null}
                <Pressable style={[styles.ok, !cat && styles.okOff]} onPress={save} disabled={!cat} testID="plan-ok">
                  <Text style={styles.okText}>{cat ? '确定' : '先选一个分类'}</Text>
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
  avoider: { width: '100%' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingBottom: 20, maxHeight: 520 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD6E6', marginTop: 8, marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: fontSize.secondary, color: colors.textMuted, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  label: { width: 38, fontSize: fontSize.body, color: colors.textMuted },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.purpleLight, borderRadius: 10, height: 36, paddingHorizontal: 4 },
  stepBtn: { width: 26, textAlign: 'center', fontSize: 17, color: colors.purpleDark, fontWeight: '700' },
  stepVal: { minWidth: 46, textAlign: 'center', fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
  dash: { marginHorizontal: 8, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  chip: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 6 },
  chipOn: { borderWidth: 2, borderColor: colors.textPrimary, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: fontSize.body, fontWeight: '600' },
  chipTextOn: { fontWeight: '800' },
  input: { backgroundColor: colors.background, borderRadius: 12, height: 44, paddingHorizontal: 12, fontSize: 15, color: colors.textPrimary, marginBottom: 12 },
  btns: { flexDirection: 'row', gap: 10 },
  del: { width: 88, height: 44, borderRadius: 12, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  delText: { fontSize: 15, color: colors.redDark, fontWeight: '600' },
  ok: { flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.purpleDark, alignItems: 'center', justifyContent: 'center' },
  okOff: { backgroundColor: colors.purple },
  okText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
