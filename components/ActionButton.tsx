import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, fontSize, spacing } from '../constants/theme';
import type { DecayStatus } from '../types';

interface ActionButtonProps {
  label: string;
  status: DecayStatus;
  onPress: () => void;
  onUndo?: () => void;
}

/** 完成按钮：点击触发 ✓ 弹出+缩放+渐隐 动效，随后短暂显示"撤销" */
export function ActionButton({ label, status, onPress, onUndo }: ActionButtonProps) {
  const [showUndo, setShowUndo] = useState(false);
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const handlePress = () => {
    onPress();
    scale.setValue(0.6);
    opacity.setValue(1);
    // 先让 ✓ 动效播完（弹出+缩放+渐隐），再切换成"撤销"按钮，
    // 不然之前是动效一开始就立刻换成撤销按钮，动效根本没机会被看到。
    Animated.parallel([
      Animated.spring(scale, { toValue: 1.1, useNativeDriver: true, speed: 20 }),
      Animated.timing(opacity, { toValue: 0, duration: 150, delay: 250, useNativeDriver: true }),
    ]).start(() => {
      setShowUndo(true);
      setTimeout(() => setShowUndo(false), 4000);
    });
  };

  if (showUndo && onUndo) {
    return (
      <Pressable
        onPress={() => {
          onUndo();
          setShowUndo(false);
        }}
        style={[styles.button, styles.undoButton]}
      >
        <Text style={styles.undoText}>˟ 撤销</Text>
      </Pressable>
    );
  }

  const bg =
    status === 'red' ? colors.redDark : status === 'yellow' ? colors.yellowDark : colors.greenDark;

  return (
    <Pressable onPress={handlePress} style={[styles.button, { backgroundColor: bg }]}>
      <Text style={styles.label}>{label}</Text>
      <Animated.Text
        style={[styles.checkmark, { transform: [{ scale }], opacity }]}
        pointerEvents="none"
      >
        ✓
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#FFFFFF',
    fontSize: fontSize.secondary,
    fontWeight: '600',
  },
  checkmark: {
    position: 'absolute',
    fontSize: 16,
    color: '#FFFFFF',
  },
  undoButton: {
    backgroundColor: colors.textMuted,
  },
  undoText: {
    color: '#FFFFFF',
    fontSize: fontSize.secondary,
    fontWeight: '600',
  },
});
