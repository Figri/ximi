import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Action, Card, Cat } from '../../types';
import { isCompletedToday } from '../../lib/decay';
import { CatPickerModal } from './CatPickerModal';

interface HabitIconProps {
  card: Card;
  action: Action;
  lastCompletedAt: Date | null;
  cats: Cat[];
  onComplete: (action: Action, options?: { selectedCats?: string[] }) => void;
  onUndo: (action: Action) => void;
}

const SIZE = 60;

export function HabitIcon({ card, action, lastCompletedAt, cats, onComplete, onUndo }: HabitIconProps) {
  const done = isCompletedToday(lastCompletedAt);
  const [pickerOpen, setPickerOpen] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  function bounce() {
    scale.setValue(0.88);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  }

  function doCompleteWith(options?: { selectedCats?: string[] }) {
    onComplete(action, options);
    bounce();
    Vibration.vibrate(12);
  }

  function handlePress() {
    if (done) {
      onUndo(action);
      return;
    }
    if (action.requires_selection && cats.length > 0) {
      setPickerOpen(true);
      return;
    }
    doCompleteWith();
  }

  function handleLongPress() {
    router.push(`/habit/${card.id}`);
  }

  return (
    <View style={styles.wrapper}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          style={[styles.circle, done ? styles.circleDone : styles.circleIdle]}
          onPress={handlePress}
          onLongPress={handleLongPress}
        >
          <Text style={styles.emoji}>{card.emoji || '⭐'}</Text>
          {done && (
            <View style={styles.checkBadge}>
              <Text style={styles.checkBadgeText}>✓</Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
      <Text style={[styles.name, done && styles.nameDone]} numberOfLines={1}>
        {card.name}
      </Text>

      <CatPickerModal
        visible={pickerOpen}
        cats={cats}
        title={`${card.name} · ${action.name}`}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(selectedCats) => {
          setPickerOpen(false);
          doCompleteWith({ selectedCats });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: SIZE + 12, alignItems: 'center' },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleIdle: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: '#E4DEEC',
  },
  circleDone: {
    backgroundColor: colors.purpleDark,
  },
  emoji: { fontSize: 26, lineHeight: 30, includeFontPadding: false },
  checkBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  checkBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  name: {
    fontSize: fontSize.tiny,
    lineHeight: fontSize.tiny + 3,
    color: colors.textSecondary,
    marginTop: 4,
    maxWidth: SIZE + 16,
    textAlign: 'center',
    includeFontPadding: false,
  },
  nameDone: { color: colors.textPrimary, fontWeight: '600' },
});
