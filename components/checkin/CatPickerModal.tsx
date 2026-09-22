import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Cat } from '../../types';

interface CatPickerModalProps {
  visible: boolean;
  cats: Cat[];
  title: string;
  onCancel: () => void;
  onConfirm: (selectedCatIds: string[]) => void;
}

export function CatPickerModal({ visible, cats, title, onCancel, onConfirm }: CatPickerModalProps) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function toggleAll() {
    setSelected((prev) => (prev.length === cats.length ? [] : cats.map((c) => c.id)));
  }

  function handleConfirm() {
    const result = selected;
    setSelected([]);
    onConfirm(result);
  }

  function handleCancel() {
    setSelected([]);
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>选哪几只猫？</Text>
          <View style={styles.grid}>
            {cats.map((cat) => {
              const active = selected.includes(cat.id);
              return (
                <Pressable key={cat.id} style={styles.catItem} onPress={() => toggle(cat.id)}>
                  <View style={[styles.avatar, active && styles.avatarActive]}>
                    <Text style={styles.avatarText}>{cat.name.slice(0, 1)}</Text>
                    {active && (
                      <View style={styles.checkBadge}>
                        <Text style={styles.checkBadgeText}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.catName} numberOfLines={1}>
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.selectAllButton} onPress={toggleAll}>
            <Text style={styles.selectAllText}>{selected.length === cats.length ? '取消全选' : '全选'}</Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, selected.length === 0 && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={selected.length === 0}
            >
              <Text style={styles.confirmText}>确认（{selected.length}）</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.35)', justifyContent: 'center', padding: spacing.xl },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  title: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted, textAlign: 'center', marginTop: 2, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  catItem: { alignItems: 'center', width: 60 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.avatar,
    backgroundColor: colors.pinkLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarActive: { backgroundColor: colors.pink, borderColor: colors.pinkDark },
  avatarText: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  checkBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  catName: { fontSize: fontSize.tiny, color: colors.textSecondary, marginTop: 4, includeFontPadding: false },
  selectAllButton: { alignSelf: 'center', marginTop: spacing.md, paddingVertical: 4, paddingHorizontal: spacing.md },
  selectAllText: { color: colors.purpleDark, fontSize: fontSize.body },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  cancelText: { color: colors.textSecondary, fontSize: fontSize.body },
  confirmButton: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
  },
  confirmButtonDisabled: { opacity: 0.4 },
  confirmText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
});
