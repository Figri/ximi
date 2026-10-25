import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addCatEvent, fetchCat, fetchCatEvents } from '../../lib/cats';
import { catTodos, parseNextDate, scheduleNextForCat, type CatTodo } from '../../lib/catTodos';
import { rescheduleAll } from '../../lib/ling/proactive';
import type { Cat, CatEvent, CatEventType } from '../../types';

// 一只猫的页（需求文档 §8.8）：疫苗、驱虫、看医生、体重的记录；记的时候填了「下次」，就在那天建一条事项，
// 今天页和猫咪页都能看到。

const EVENT_TYPES: { type: CatEventType; emoji: string }[] = [
  { type: '绝育', emoji: '✂️' },
  { type: '疫苗', emoji: '💉' },
  { type: '驱虫', emoji: '🐛' },
  { type: '看医生', emoji: '🏥' },
  { type: '体重', emoji: '⚖️' },
  { type: '其他', emoji: '📝' },
];

export default function CatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cat, setCat] = useState<Cat | null>(null);
  const [events, setEvents] = useState<CatEvent[]>([]);
  const [todos, setTodos] = useState<CatTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const [c, e, t] = await Promise.all([fetchCat(id), fetchCatEvents(id), catTodos()]);
      setCat(c);
      setEvents(e);
      setTodos((t[id] ?? []).filter((x) => !x.done));
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>加载中…</Text>
      </SafeAreaView>
    );
  }

  if (!cat) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>没找到这只猫</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{cat.name.slice(0, 1)}</Text>
          </View>
          <Text style={styles.name}>
            {cat.name} {cat.gender}
          </Text>
          {cat.notes && <Text style={styles.notes}>{cat.notes}</Text>}
        </View>

        <Pressable style={styles.addButton} onPress={() => setAddOpen(true)}>
          <Text style={styles.addButtonText}>＋ 加事件</Text>
        </Pressable>

        {todos.length ? (
          <>
            <Text style={styles.sectionTitle}>接下来要做的</Text>
            {todos.map((t) => (
              <View key={t.id} style={styles.todoRow}>
                <Text style={styles.todoDate}>{t.date.slice(5).replace('-', '/')}</Text>
                <Text style={styles.todoText}>{t.content}</Text>
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.sectionTitle}>事件时间线</Text>
        {events.length === 0 && <Text style={styles.empty}>还没有记录，点上面「加事件」加一条</Text>}
        {events.map((e) => (
          <View key={e.id} style={styles.eventRow}>
            <Text style={styles.eventEmoji}>{EVENT_TYPES.find((t) => t.type === e.event_type)?.emoji ?? '📝'}</Text>
            <View style={styles.eventBody}>
              <Text style={styles.eventTitle}>
                {e.event_type}
                {e.value != null ? ` · ${e.value}` : ''}
              </Text>
              {e.description && <Text style={styles.eventDesc}>{e.description}</Text>}
              <Text style={styles.eventDate}>{new Date(e.event_date).toLocaleDateString('zh-CN')}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <AddEventModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          setAddOpen(false);
          load();
        }}
        catId={cat.id}
        catName={cat.name}
      />
    </SafeAreaView>
  );
}

const NEEDS_NEXT: CatEventType[] = ['疫苗', '驱虫', '看医生'];

function AddEventModal({
  visible,
  onClose,
  onAdded,
  catId,
  catName,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
  catId: string;
  catName: string;
}) {
  const [type, setType] = useState<CatEventType>('体重');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    const nextDate = NEEDS_NEXT.includes(type) ? parseNextDate(next) : null;
    if (NEEDS_NEXT.includes(type) && next.trim() && !nextDate) {
      setError('下次的日期没认出来，写成 11/28 这样就行');
      return;
    }
    if (type === '体重' && value.trim() && !Number.isFinite(Number(value))) {
      setError('体重写个数字就行，比如 4.2');
      return;
    }
    setSaving(true);
    try {
      const d = new Date();
      await addCatEvent(catId, {
        event_type: type,
        description: description.trim() || null,
        value: value.trim() ? Number(value) : null,
        event_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      });
      if (nextDate) {
        await scheduleNextForCat(catId, catName, type === '看医生' ? '复查' : type, nextDate);
        rescheduleAll().catch(() => []);
      }
      setValue('');
      setDescription('');
      setNext('');
      onAdded();
    } catch (err) {
      setError(`没存上：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior="padding">
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>加一条事件</Text>
            <View style={styles.typeRow}>
              {EVENT_TYPES.map((t) => (
                <Pressable
                  key={t.type}
                  onPress={() => setType(t.type)}
                  style={[styles.typeChip, type === t.type && styles.typeChipActive]}
                  testID={`cat-type-${t.type}`}
                >
                  <Text style={styles.typeChipEmoji}>{t.emoji}</Text>
                  <Text style={[styles.typeChipText, type === t.type && styles.typeChipTextActive]}>{t.type}</Text>
                </Pressable>
              ))}
            </View>
            {type === '体重' && (
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={setValue}
                placeholder="多少 kg"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            )}
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="备注（可以不填）"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            {NEEDS_NEXT.includes(type) && (
              <TextInput
                style={styles.input}
                value={next}
                onChangeText={setNext}
                placeholder="下次哪天（比如 11/28，可以不填）"
                placeholderTextColor={colors.textMuted}
                testID="cat-next"
              />
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving} testID="cat-save">
              <Text style={styles.saveButtonText}>{saving ? '保存中…' : '保存'}</Text>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { textAlign: 'center', marginTop: spacing.xl, color: colors.textMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.avatar,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: { fontSize: 28, color: colors.textPrimary, fontWeight: '600' },
  name: { fontSize: fontSize.pageTitle, color: colors.textPrimary, fontWeight: '600' },
  notes: { fontSize: fontSize.secondary, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  addButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  addButtonText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
  sectionTitle: {
    fontSize: fontSize.secondary,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  empty: { fontSize: fontSize.body, color: colors.textMuted },
  eventRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  eventEmoji: { fontSize: 20, lineHeight: 24, includeFontPadding: false },
  eventBody: { flex: 1 },
  eventTitle: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  eventDesc: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: 2 },
  eventDate: { fontSize: fontSize.tiny, color: colors.textMuted, marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(61, 53, 84, 0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetTitle: { fontSize: fontSize.pageTitle, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.md },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  typeChipActive: { backgroundColor: colors.purple },
  typeChipEmoji: { fontSize: 14, includeFontPadding: false },
  typeChipText: { fontSize: fontSize.body, color: colors.textSecondary },
  typeChipTextActive: { color: colors.textPrimary, fontWeight: '600' },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  notesInput: { minHeight: 60, textAlignVertical: 'top' },
  saveButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.cardName, fontWeight: '600' },
  error: { color: colors.redDark, fontSize: fontSize.secondary, marginBottom: spacing.sm },
  todoRow: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.widget, padding: spacing.md, marginBottom: spacing.sm },
  todoDate: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '600', width: 44 },
  todoText: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary },
});
