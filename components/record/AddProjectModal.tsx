import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { createProject } from '../../lib/projects';
import { fetchWorries } from '../../lib/worries';
import { useCardStore } from '../../lib/store';
import type { Worry } from '../../types';

export function AddProjectModal({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { cards } = useCardStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [selectedWorries, setSelectedWorries] = useState<string[]>([]);
  const [worries, setWorries] = useState<Worry[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) fetchWorries().then(setWorries);
  }, [visible]);

  function toggleCard(id: string) {
    setSelectedCards((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }
  function toggleWorry(id: string) {
    setSelectedWorries((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]));
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('起个名字吧', '项目名不能是空的');
      return;
    }
    setSaving(true);
    try {
      await createProject(name.trim(), description.trim() || null, selectedCards, selectedWorries);
      setName('');
      setDescription('');
      setSelectedCards([]);
      setSelectedWorries([]);
      onAdded();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>新建项目</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="项目名字"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <TextInput
              style={[styles.input, styles.descInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="简单描述一下（选填）"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            {cards.length > 0 && (
              <>
                <Text style={styles.label}>关联卡片（选填）</Text>
                <View style={styles.chipRow}>
                  {cards.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => toggleCard(c.id)}
                      style={[styles.chip, selectedCards.includes(c.id) && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, selectedCards.includes(c.id) && styles.chipTextActive]}>
                        {c.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {worries.length > 0 && (
              <>
                <Text style={styles.label}>关联烦恼（选填）</Text>
                <View style={styles.chipRow}>
                  {worries.map((w) => (
                    <Pressable
                      key={w.id}
                      onPress={() => toggleWorry(w.id)}
                      style={[styles.chip, selectedWorries.includes(w.id) && styles.chipActive]}
                    >
                      <Text
                        style={[styles.chipText, selectedWorries.includes(w.id) && styles.chipTextActive]}
                        numberOfLines={1}
                      >
                        {w.content}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveButtonText}>{saving ? '保存中…' : '保存'}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61, 53, 84, 0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '80%',
  },
  title: { fontSize: fontSize.pageTitle, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.md },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  descInput: { minHeight: 60, textAlignVertical: 'top' },
  label: { fontSize: fontSize.secondary, color: colors.textSecondary, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    maxWidth: 180,
  },
  chipActive: { backgroundColor: colors.purple },
  chipText: { fontSize: fontSize.secondary, color: colors.textSecondary },
  chipTextActive: { color: colors.textPrimary, fontWeight: '600' },
  saveButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.cardName, fontWeight: '600' },
});
