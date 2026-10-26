import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageTitle } from '../../components/common/PageTitle';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addWeight, daysBetween, deleteBody, endPeriod, listBody, parseKg, startPeriod, type BodyRecord } from '../../lib/body';
import { buildDayDigest } from '../../lib/dayDigest';
import { lingDayKey, useLingSettings } from '../../lib/ling/settings';

// 身体（需求文档 §8.9）：体重曲线；睡眠从「睡觉」时间块自动算；经期默认私密——不进灵的提示词和主动消息。
// 删除都给 5 秒撤销，不弹系统确认框。

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function md(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
}

export default function BodyScreen() {
  const dayStartHour = useLingSettings((s) => s.settings.dayStartHour);
  const [weights, setWeights] = useState<BodyRecord[]>([]);
  const [periods, setPeriods] = useState<BodyRecord[]>([]);
  const [sleep, setSleep] = useState<{ key: string; hours: number | null }[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ text: string; restore: () => Promise<void> } | null>(null);

  const load = useCallback(async () => {
    setWeights(await listBody('weight'));
    setPeriods(await listBody('period'));
    const today = lingDayKey(new Date(), dayStartHour);
    const [y, m, d] = today.split('-').map(Number);
    const nights: { key: string; hours: number | null }[] = [];
    for (let i = 6; i >= 0; i--) {
      const k = keyOf(new Date(y, m - 1, d - i));
      nights.push({ key: k, hours: (await buildDayDigest(k, dayStartHour).catch(() => null))?.sleepHours ?? null });
    }
    setSleep(nights);
  }, [dayStartHour]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const today = keyOf(new Date());

  async function saveWeight() {
    const v = parseKg(draft, 20, 300);
    if (v == null) {
      setError('写个数字就行，比如 52.3');
      return;
    }
    setError(null);
    await addWeight(today, Math.round(v * 10) / 10);
    setDraft('');
    load();
  }

  function remove(r: BodyRecord, label: string) {
    deleteBody(r.id).then(load);
    setUndo({
      text: `删了${label}`,
      restore: async () => {
        if (r.kind === 'weight') await addWeight(r.date, r.value ?? 0, r.note);
        else {
          const p = await startPeriod(r.date);
          if (r.end_date) await endPeriod(p.id, r.end_date);
        }
      },
    });
    setTimeout(() => setUndo((u) => (u && u.text === `删了${label}` ? null : u)), 5000);
  }

  const recent = weights.slice(0, 12).reverse();
  const min = Math.min(...recent.map((w) => w.value ?? 0));
  const max = Math.max(...recent.map((w) => w.value ?? 0));
  const open = periods.find((p) => !p.end_date) ?? null;
  const maxSleep = Math.max(9, ...sleep.map((s) => s.hours ?? 0));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <PageTitle title="身体" />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.cardTitle}>体重</Text>
            <View style={styles.row}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="今天多少 kg"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={saveWeight}
                testID="weight-input"
              />
              <Pressable style={styles.btn} onPress={saveWeight} testID="weight-save">
                <Text style={styles.btnText}>记下</Text>
              </Pressable>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {recent.length ? (
              <View style={styles.chart}>
                {recent.map((w) => {
                  const h = max === min ? 50 : 16 + ((w.value! - min) / (max - min)) * 64;
                  return (
                    <Pressable key={w.id} style={styles.col} onLongPress={() => remove(w, `${md(w.date)} 的体重`)} delayLongPress={450}>
                      <Text style={styles.colValue}>{w.value}</Text>
                      <View style={[styles.colBar, { height: h }]} />
                      <Text style={styles.colLabel}>{md(w.date)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.muted}>还没记过。</Text>
            )}
            {recent.length ? <Text style={styles.muted}>长按一根柱子可以删掉。</Text> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>睡眠（从「睡觉」时间块自动算）</Text>
            <View style={styles.chart}>
              {sleep.map((s) => (
                <View key={s.key} style={styles.col}>
                  <Text style={styles.colValue}>{s.hours ?? '–'}</Text>
                  <View style={[styles.colBar, styles.sleepBar, { height: s.hours ? 8 + (s.hours / maxSleep) * 72 : 2 }]} />
                  <Text style={styles.colLabel}>{md(s.key)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>经期</Text>
            <Text style={styles.muted}>只存在这台手机和你自己的备份里，灵看不到，也不会拿来发消息。</Text>
            {open ? (
              <View style={styles.row}>
                <Text style={styles.line}>
                  {md(open.date)} 开始的，今天第 {daysBetween(open.date, today) + 1} 天
                </Text>
                <Pressable style={styles.btnGhost} onPress={() => endPeriod(open.id, today).then(load)} testID="period-end">
                  <Text style={styles.btnGhostText}>结束了</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.btnGhost} onPress={() => startPeriod(today).then(load)} testID="period-start">
                <Text style={styles.btnGhostText}>今天开始了</Text>
              </Pressable>
            )}
            {periods.slice(0, 6).map((p, i) => {
              const prev = periods[i + 1];
              return (
                <Pressable key={p.id} style={styles.periodRow} onLongPress={() => remove(p, `${md(p.date)} 那次经期`)} delayLongPress={450}>
                  <Text style={styles.line}>
                    {md(p.date)} – {p.end_date ? md(p.end_date) : '还没结束'}
                    {p.end_date ? `（${daysBetween(p.date, p.end_date) + 1} 天）` : ''}
                  </Text>
                  {prev ? <Text style={styles.muted}>距上次 {daysBetween(prev.date, p.date)} 天</Text> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      {undo ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{undo.text}</Text>
          <Pressable
            onPress={async () => {
              const u = undo;
              setUndo(null);
              await u.restore();
              load();
            }}
            hitSlop={10}
            testID="body-undo"
          >
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
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontSize: fontSize.secondary, fontWeight: '700', color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  input: { flex: 1, minWidth: 120, backgroundColor: colors.background, borderRadius: radius.widget, paddingHorizontal: 10, paddingVertical: 8, fontSize: fontSize.body, color: colors.textPrimary },
  btn: { backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: fontSize.body },
  btnGhost: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.purple, borderRadius: radius.widget, paddingHorizontal: 12, paddingVertical: 6 },
  btnGhostText: { color: colors.purpleDark, fontSize: fontSize.body },
  error: { color: colors.redDark, fontSize: fontSize.secondary },
  muted: { color: colors.textMuted, fontSize: fontSize.secondary, lineHeight: 17 },
  line: { color: colors.textPrimary, fontSize: fontSize.body },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingTop: spacing.sm },
  col: { flex: 1, alignItems: 'center', gap: 3 },
  colValue: { fontSize: 9, color: colors.textSecondary },
  colBar: { width: '70%', maxWidth: 22, borderRadius: 4, backgroundColor: colors.pinkDark },
  sleepBar: { backgroundColor: colors.blueDark },
  colLabel: { fontSize: 9, color: colors.textMuted },
  periodRow: { paddingVertical: 4, gap: 2 },
  toast: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.textPrimary, borderRadius: radius.button, paddingHorizontal: spacing.lg, paddingVertical: 11 },
  toastText: { flex: 1, color: '#fff', fontSize: fontSize.body },
  toastUndo: { color: '#D8B4E2', fontSize: fontSize.body, fontWeight: '700' },
});
