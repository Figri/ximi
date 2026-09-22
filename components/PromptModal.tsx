import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';

interface PromptModalProps {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}

/** Android上 Alert.prompt 不存在（iOS-only），需要这个跨平台的替代弹窗 */
export function PromptModal({ visible, title, initialValue = '', placeholder, onCancel, onSubmit }: PromptModalProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            autoFocus
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />
          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={handleSubmit}>
              <Text style={styles.confirmText}>确定</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.35)', justifyContent: 'center', padding: spacing.xl },
  sheet: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.lg },
  title: { fontSize: fontSize.cardName, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  cancelButton: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.button, backgroundColor: colors.background, alignItems: 'center' },
  cancelText: { color: colors.textSecondary, fontSize: fontSize.body },
  confirmButton: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.button, backgroundColor: colors.purpleDark, alignItems: 'center' },
  confirmText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
});
