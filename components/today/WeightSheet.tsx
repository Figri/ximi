import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addWeight, latestWeight, type BodyRecord } from '../../lib/body';
import { addCatEvent, fetchLastCatWeights } from '../../lib/cats';
import type { Cat } from '../../types';

// 记体重的小面板：今天页「身体」的「记体重」、点「称体重」这个习惯都弹它。
// 自己的体重进「身体」；猫可以单独称，也可以抱着称（减掉你的体重），记进猫的记录。

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function md(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
}

/** 「52.3」「52.3kg」「52,3」都认；不像体重的返回 null */
function parseKg(raw: string, min: number, max: number): number | null {
  const v = Number(raw.replace(/kg|公斤|斤/gi, '').replace(',', '.').trim());
  if (!raw.trim() || !Number.isFinite(v) || v <= min || v >= max) return null;
  return Math.round(v * 100) / 100;
}

interface Props {
  visible: boolean;
  cats: Cat[];
  /** 从哪儿打开的，标题上提一句（比如「称体重」这个习惯） */
  title?: string;
  onClose: () => void;
  onSaved: (r: { myKg: number | null; catIds: string[] }) => void;
}

export function WeightSheet({ visible, cats, title, onClose, onSaved }: Props) {
  const [mine, setMine] = useState('');
  const [last, setLast] = useState<BodyRecord | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [alone, setAlone] = useState<Record<string, string>>({});
  const [held, setHeld] = useState<Record<string, string>>({});
  const [catLast, setCatLast] = useState<Record<string, { value: number; date: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMine('');
    setAlone({});
    setHeld({});
    setError(null);
    setCatsOpen(false);
    latestWeight().then(setLast).catch(() => setLast(null));
    fetchLastCatWeights(cats.map((c) => c.id)).then(setCatLast).catch(() => setCatLast({}));
  }, [visible]);

  async function save() {
    if (busy) return;
    const myKg = parseKg(mine, 20, 300);
    if (mine.trim() && myKg == null) {
      setError('你的体重写个数字就行，比如 52.3');
      return;
    }
    const ref = myKg ?? last?.value ?? null;
    const catRows: { cat: Cat; kg: number }[] = [];
    for (const cat of cats) {
      const a = alone[cat.id]?.trim();
      const h = held[cat.id]?.trim();
      if (a) {
        const kg = parseKg(a, 0, 30);
        if (kg == null) {
          setError(`${cat.name}的体重写个数字就行，比如 4.2`);
          return;
        }
        catRows.push({ cat, kg });
      } else if (h) {
        const both = parseKg(h, 20, 330);
        if (both == null) {
          setError(`抱着${cat.name}一起称的数写个数字，比如 56.5`);
          return;
        }
        if (ref == null) {
          setError(`抱着称要先知道你自己多重：先在上面填你的体重`);
          return;
        }
        const kg = Math.round((both - ref) * 100) / 100;
        if (kg <= 0 || kg >= 30) {
          setError(`抱着${cat.name}称的数减掉你的体重不太对（${kg}kg），再看一眼？`);
          return;
        }
        catRows.push({ cat, kg });
      }
    }
    if (myKg == null && !catRows.length) {
      setError('还没填数');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (myKg != null) await addWeight(keyOf(new Date()), myKg);
      for (const r of catRows) await addCatEvent(r.cat.id, { event_type: '体重', value: r.kg, event_date: new Date().toISOString() });
      onSaved({ myKg, catIds: catRows.map((r) => r.cat.id) });
    } catch (err) {
      setError(`没记上：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="weight-backdrop">
        <KeyboardAvoidingView behavior="padding" style={styles.avoider}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
              <Text style={styles.title}>⚖️ {title ?? '记体重'}</Text>
              <View style={styles.row}>
                <Text style={styles.label}>我</Text>
                <TextInput
                  style={styles.input}
                  value={mine}
                  onChangeText={(t) => {
                    setMine(t);
                    setError(null);
                  }}
                  placeholder={last?.value != null ? `上次 ${last.value}` : '比如 52.3'}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={save}
                  testID="weigh-mine"
                />
                <Text style={styles.unit}>kg</Text>
              </View>
              {last?.value != null ? <Text style={styles.hint}>上次 {md(last.date)} 是 {last.value} kg</Text> : null}

              {cats.length ? (
                <Pressable onPress={() => setCatsOpen((v) => !v)} hitSlop={6} testID="weigh-cats-toggle">
                  <Text style={styles.link}>{catsOpen ? '猫先不称了' : '猫也称一下 ›'}</Text>
                </Pressable>
              ) : null}
              {catsOpen
                ? cats.map((cat) => (
                    <View key={cat.id} style={styles.catBlock}>
                      <Text style={styles.catName}>
                        {cat.name}
                        {catLast[cat.id] ? <Text style={styles.hint}>{`  上次 ${catLast[cat.id].value} kg`}</Text> : null}
                      </Text>
                      <View style={styles.row}>
                        <TextInput
                          style={[styles.input, styles.half]}
                          value={alone[cat.id] ?? ''}
                          onChangeText={(t) => {
                            setAlone((p) => ({ ...p, [cat.id]: t }));
                            setError(null);
                          }}
                          placeholder="单独称"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                          testID={`weigh-alone-${cat.name}`}
                        />
                        <TextInput
                          style={[styles.input, styles.half]}
                          value={held[cat.id] ?? ''}
                          onChangeText={(t) => {
                            setHeld((p) => ({ ...p, [cat.id]: t }));
                            setError(null);
                          }}
                          placeholder="抱着一起称"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                          testID={`weigh-held-${cat.name}`}
                        />
                      </View>
                    </View>
                  ))
                : null}

              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                <Pressable style={[styles.btn, busy && styles.btnOff]} onPress={save} disabled={busy} testID="weigh-save">
                  <Text style={styles.btnText}>记下</Text>
                </Pressable>
                <Pressable onPress={onClose} hitSlop={8}>
                  <Text style={styles.cancel}>算了</Text>
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
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: 560 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { fontSize: fontSize.cardName, fontWeight: '700', color: colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { width: 22, fontSize: fontSize.body, color: colors.textSecondary },
  // minWidth 0：网页上输入框自带一个最小宽度，两个并排会挤出屏幕
  input: { flex: 1, minWidth: 0, backgroundColor: colors.background, borderRadius: radius.widget, paddingHorizontal: 12, paddingVertical: 10, fontSize: fontSize.cardName, color: colors.textPrimary },
  half: { flexBasis: 0, fontSize: fontSize.body },
  unit: { fontSize: fontSize.body, color: colors.textSecondary },
  hint: { fontSize: fontSize.secondary, color: colors.textMuted, fontWeight: '400' },
  link: { fontSize: fontSize.body, color: colors.purpleDark, paddingVertical: 4 },
  catBlock: { gap: 6 },
  catName: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  error: { fontSize: fontSize.secondary, color: colors.redDark },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.xs },
  btn: { backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 22, paddingVertical: 10 },
  btnOff: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: fontSize.body, fontWeight: '700' },
  cancel: { color: colors.textMuted, fontSize: fontSize.body },
});
