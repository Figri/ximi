import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../../constants/theme';
import { useCaptureStore } from '../../lib/captureStore';

// 所有主页面右下角同一个 ＋（需求文档 §5.3）。面板本身挂在底栏布局里，全局一个。

export function CaptureFab({ bottom = spacing.lg }: { bottom?: number }) {
  const open = useCaptureStore((s) => s.open);
  return (
    <Pressable style={[styles.fab, { bottom }]} onPress={() => open('any')} testID="capture-fab" hitSlop={6}>
      <Text style={styles.plus}>＋</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  plus: { color: '#fff', fontSize: 26, lineHeight: 30, marginTop: -2 },
});
