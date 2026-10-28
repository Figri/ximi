import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { MOOD_FACES, type MoodFace } from '../../lib/moods';

// 随心记的表情弹窗：12 个常用情绪，点一个就选上、弹窗关掉；点外面也关。选着一个时底下有「不要表情」。

interface Props {
  visible: boolean;
  selected: MoodFace | null;
  onPick: (mood: MoodFace | null) => void;
  onClose: () => void;
}

export function MoodPicker({ visible, selected, onPick, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="mood-backdrop">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>现在怎么样</Text>
          <View style={styles.grid}>
            {MOOD_FACES.map((m) => {
              const on = selected?.face === m.face;
              return (
                <View key={m.face} style={styles.cell}>
                  <Pressable
                    style={({ pressed }) => [styles.face, on && styles.faceOn, pressed && styles.facePressed]}
                    onPress={() => onPick(m)}
                    testID={`mood-face-${m.label}`}
                    aria-selected={on}
                  >
                    <Text style={styles.emoji}>{m.face}</Text>
                    <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                      {m.label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {selected ? (
            <Pressable style={styles.clear} onPress={() => onPick(null)} hitSlop={8} testID="mood-clear">
              <Text style={styles.clearText}>不要表情</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingHorizontal: spacing.lg },
  sheet: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: fontSize.cardName, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  cell: { width: '25%', padding: 3 },
  face: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 10,
    borderRadius: radius.widget,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  faceOn: { backgroundColor: colors.purpleLight, borderColor: colors.purpleDark },
  facePressed: { backgroundColor: colors.purpleLight },
  emoji: { fontSize: 28, lineHeight: 34 },
  label: { fontSize: fontSize.secondary, color: colors.textSecondary },
  labelOn: { color: colors.purpleDark, fontWeight: '700' },
  clear: { alignSelf: 'center', paddingVertical: 4 },
  clearText: { fontSize: fontSize.secondary, color: colors.textMuted },
});
