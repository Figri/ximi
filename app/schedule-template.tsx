import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { fetchLatestTemplateItems, saveNewTemplateVersion, SLOTS } from '../lib/schedule';
import type { ScheduleSlot } from '../types';

const SLOT_LABELS: Record<string, string> = { '08': '08:00', '10': '10:00', '12': '12:00', '14': '14:00', '16': '16:00', '18': '18:00', '20': '20:00', '22': '22:00' };

interface DraftRow {
  id: string;
  slot: ScheduleSlot;
  title: string;
}

function genId(): string {
  return `row:${Math.random().toString(36).slice(2)}`;
}

export default function ScheduleTemplateScreen() {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const refs = useRef<Record<string, TextInput | null>>({});

  useEffect(() => {
    fetchLatestTemplateItems().then((items) => {
      setRows(items.map((it) => ({ id: `row:${it.id}`, slot: it.slot, title: it.title })));
      setLoading(false);
    });
  }, []);

  function rowsForSlot(slot: ScheduleSlot): DraftRow[] {
    return rows.filter((r) => r.slot === slot);
  }

  function focus(id: string | null) {
    if (!id) return;
    requestAnimationFrame(() => refs.current[id]?.focus());
  }

  function addRow(slot: ScheduleSlot) {
    const id = genId();
    setRows((prev) => [...prev, { id, slot, title: '' }]);
    focus(id);
  }

  function handleChangeTitle(id: string, text: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, title: text } : r)));
  }

  function handleBlurCommit(row: DraftRow) {
    if (!row.title.trim()) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    }
  }

  function handleEnter(row: DraftRow) {
    addRow(row.slot);
  }

  function handleBackspace(row: DraftRow) {
    if (row.title.length > 0) return;
    const slotRows = rowsForSlot(row.slot);
    const idx = slotRows.findIndex((r) => r.id === row.id);
    const prev = idx > 0 ? slotRows[idx - 1] : null;
    setRows((cur) => cur.filter((r) => r.id !== row.id));
    focus(prev?.id ?? null);
  }

  async function handleSave() {
    const nonEmpty = rows.filter((r) => r.title.trim());
    setSaving(true);
    try {
      await saveNewTemplateVersion(nonEmpty.map((r) => ({ slot: r.slot, title: r.title.trim() })));
      Alert.alert('已更新', '从明天开始生效，今天和之前的记录都不受影响');
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>就是一张空白的一天——写好之后点保存，明天开始生效，今天和之前的记录都不会变。</Text>
        {!loading &&
          SLOTS.map((slot) => (
            <View key={slot} style={styles.slotSection}>
              <Text style={styles.slotLabel}>{SLOT_LABELS[slot]}</Text>
              {rowsForSlot(slot).map((row) => (
                <View key={row.id} style={styles.row}>
                  <Text style={styles.handle}>⠿</Text>
                  <TextInput
                    ref={(el) => {
                      refs.current[row.id] = el;
                    }}
                    style={styles.input}
                    value={row.title}
                    onChangeText={(t) => handleChangeTitle(row.id, t)}
                    onBlur={() => handleBlurCommit(row)}
                    onSubmitEditing={() => handleEnter(row)}
                    onKeyPress={(e) => {
                      if (e.nativeEvent.key === 'Backspace') handleBackspace(row);
                    }}
                    blurOnSubmit={false}
                    returnKeyType="next"
                    placeholder="写点什么…"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              ))}
              <Pressable style={styles.addHotzone} onPress={() => addRow(slot)}>
                <Text style={styles.addHotzoneText}>＋</Text>
              </Pressable>
            </View>
          ))}
      </ScrollView>
      <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveButtonText}>{saving ? '保存中…' : '保存'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 3 },
  hint: { fontSize: fontSize.secondary, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 18 },
  slotSection: { marginBottom: spacing.md },
  slotLabel: { fontSize: fontSize.secondary, color: colors.textMuted, fontWeight: '600', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: spacing.sm },
  handle: { fontSize: 15, color: colors.textMuted, width: 20, textAlign: 'center' },
  input: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, padding: 0 },
  addHotzone: { paddingVertical: 6, paddingLeft: 28 },
  addHotzoneText: { fontSize: fontSize.secondary, color: colors.textMuted },
  saveButton: {
    margin: spacing.lg,
    backgroundColor: colors.purpleDark,
    borderRadius: radius.widget,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
});
