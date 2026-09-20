import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, fontSize } from '../constants/theme';
import type { DecayStatus } from '../types';

interface ActionButtonProps {
  label: string;
  status: DecayStatus;
  onPress: () => void;
}

/** 完成按钮：点击触发 ✓ 弹出+缩放+渐隐 动效，之后按钮恢复原样 */
export function ActionButton({ label, status, onPress }: ActionButtonProps) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const handlePress = () => {
    onPress();
    scale.setValue(1);
    opacity.setValue(1);
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.2, useNativeDriver: true, speed: 30 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    Animated.timing(opacity, { toValue: 0, duration: 200, delay: 400, useNativeDriver: true }).start();
  };

  const bg = status === 'red' ? colors.redDark : status === 'yellow' ? colors.yellowDark : colors.greenDark;

  return (
    <Pressable onPress={handlePress} style={[styles.button, { backgroundColor: bg }]}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Animated.View style={[styles.checkmarkWrap, { transform: [{ scale }], opacity }]} pointerEvents="none">
        <Text style={styles.checkmark}>✓</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 76,
    height: 32,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#FFFFFF',
    fontSize: fontSize.secondary,
    fontWeight: '600',
  },
  checkmarkWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
