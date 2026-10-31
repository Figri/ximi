import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fixedFontSize, fontSize, radius, spacing } from '../../constants/theme';
import { CUP_ML, WATER_SLOTS } from '../../lib/waterPlan';

// 喝水：4 个杯子对着 10、14、17、20 点。点一个空杯子 = 喝了一杯（500ml），水从杯底涨上来；
// 喝多了点错了用底下的「撤销」。杯子的大小写死，不跟着字号变。

const CUP_W = 54;
const CUP_H = 66;
const WATER = '#9FCBEA';
const WATER_TOP = '#C7E2F4';

function Cup({ filled, next, onPress, index }: { filled: boolean; next: boolean; onPress: () => void; index: number }) {
  const level = useRef(new Animated.Value(filled ? 1 : 0)).current;
  const bounce = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      level.setValue(filled ? 1 : 0);
      return;
    }
    Animated.timing(level, { toValue: filled ? 1 : 0, duration: filled ? 900 : 350, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    if (filled) {
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1.1, duration: 140, useNativeDriver: true }),
        Animated.spring(bounce, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
  }, [filled]);

  const height = level.interpolate({ inputRange: [0, 1], outputRange: ['0%', '86%'] });
  return (
    <Pressable onPress={onPress} disabled={filled} style={styles.cupCol} testID={`water-cup-${index + 1}`} aria-selected={filled}>
      <Animated.View style={[styles.cup, next && styles.cupNext, filled && styles.cupFilled, { transform: [{ scale: bounce }] }]}>
        <Animated.View style={[styles.water, { height }]}>
          <View style={styles.waterTop} />
        </Animated.View>
        <Text style={styles.cupMark}>{filled ? '💧' : next ? '＋' : ''}</Text>
      </Animated.View>
      <Text style={[styles.cupTime, filled && styles.cupTimeDone]}>{WATER_SLOTS[index]}:00</Text>
    </Pressable>
  );
}

interface Props {
  cups: number;
  onDrink: () => void;
}

export function WaterSection({ cups, onDrink }: Props) {
  const done = Math.min(cups, WATER_SLOTS.length);
  return (
    <View style={styles.wrap}>
      <View style={styles.cups}>
        {WATER_SLOTS.map((_, i) => (
          <Cup key={i} index={i} filled={i < done} next={i === done} onPress={onDrink} />
        ))}
      </View>
      <Text style={styles.sum} testID="water-sum">
        {cups >= WATER_SLOTS.length
          ? `今天 ${cups * CUP_ML}ml，喝够啦 🎉`
          : `今天 ${cups * CUP_ML} / ${WATER_SLOTS.length * CUP_ML} ml · 喝了一杯就点一个空杯子`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  cups: { flexDirection: 'row', justifyContent: 'space-around' },
  cupCol: { alignItems: 'center', gap: 4 },
  cup: {
    width: CUP_W,
    height: CUP_H,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: '#B9D6EA',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#F7FBFE',
  },
  cupNext: { borderColor: colors.blueDark, borderStyle: 'dashed' },
  cupFilled: { borderColor: '#8BBFE2' },
  water: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: WATER },
  waterTop: { height: 5, backgroundColor: WATER_TOP, opacity: 0.9 },
  cupMark: { fontSize: 18, lineHeight: 22, color: colors.blueDark, marginBottom: 18 },
  cupTime: { fontSize: fixedFontSize.secondary, color: colors.textMuted },
  cupTimeDone: { color: colors.blueDark, fontWeight: '700' },
  sum: { fontSize: fontSize.secondary, color: colors.textSecondary, textAlign: 'center' },
});
