import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { colors, fontSize, radius, statusColorDark } from '../../constants/theme';
import type { Action, Card, Cat, DecayStatus } from '../../types';
import { CatPickerModal } from '../common/CatPickerModal';

// 「该照顾的」里的一格（一排 3 格）：圆圈 + 名字（最多两行，不截成「…」）+ 一行小字（超几天 / 今天做了）。
// 圈的颜色就是状态：红 = 有点久了、黄 = 快到了、灰 = 还早；做了是紫色带 ✓。
// 点 = 做了（再点撤销）；要选猫的先选猫；「称体重」这种交给外面弹记体重的面板。长按 = 看以前的记录。

interface Props {
  card: Card;
  action: Action;
  status: DecayStatus;
  done: boolean;
  sub: string;
  cats: Cat[];
  onComplete: (options?: { selectedCats?: string[] }) => void;
  onUndo: () => void;
  onLongPress: () => void;
  /** 有值就不直接算做了，交给外面（比如弹记体重） */
  onSpecial?: () => void;
}

const SIZE = 54;

export function HabitTile({ card, action, status, done, sub, cats, onComplete, onUndo, onLongPress, onSpecial }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  function bounce() {
    scale.setValue(0.88);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  }

  function complete(options?: { selectedCats?: string[] }) {
    onComplete(options);
    bounce();
    Vibration.vibrate(12);
  }

  function press() {
    if (done) {
      onUndo();
      return;
    }
    if (onSpecial) {
      onSpecial();
      return;
    }
    if (action.requires_selection && cats.length > 0) {
      setPickerOpen(true);
      return;
    }
    complete();
  }

  const ring = done ? null : status === 'green' ? '#E4DEEC' : statusColorDark[status];

  return (
    <View style={styles.cell}>
      <Pressable style={styles.hit} onPress={press} onLongPress={onLongPress} delayLongPress={400} testID={`habit-${card.name}`}>
        <Animated.View style={[styles.circle, done ? styles.circleDone : { borderColor: ring ?? '#E4DEEC' }, { transform: [{ scale }] }]}>
          <Text style={styles.emoji}>{card.emoji || '⭐'}</Text>
          {done ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>✓</Text>
            </View>
          ) : null}
        </Animated.View>
        <Text style={[styles.name, done && styles.nameDone]} numberOfLines={2}>
          {card.name}
        </Text>
        <Text style={[styles.sub, !done && status === 'red' && styles.subRed]} numberOfLines={1}>
          {sub}
        </Text>
      </Pressable>
      <CatPickerModal
        visible={pickerOpen}
        cats={cats}
        title={`${card.name} · ${action.name}`}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(selectedCats) => {
          setPickerOpen(false);
          complete({ selectedCats });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { width: '33.333%', paddingHorizontal: 4, paddingVertical: 6 },
  hit: { alignItems: 'center', gap: 3 },
  circle: { width: SIZE, height: SIZE, borderRadius: radius.avatar, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 2.5 },
  circleDone: { backgroundColor: colors.purpleDark, borderColor: colors.purpleDark },
  emoji: { fontSize: 24, lineHeight: 30, includeFontPadding: false },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  name: { fontSize: fontSize.body, lineHeight: 17, color: colors.textPrimary, textAlign: 'center', marginTop: 3 },
  nameDone: { color: colors.purpleDark, fontWeight: '600' },
  sub: { fontSize: fontSize.tiny, color: colors.textMuted, textAlign: 'center' },
  subRed: { color: colors.redDark },
});
