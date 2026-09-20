import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fontSize, radius, spacing, statusColorDark } from '../constants/theme';
import type { Action, Card as CardType, DecayResult } from '../types';

interface CardProps {
  card: CardType;
  primaryAction: Action | null;
  secondaryActions: Action[];
  decay: DecayResult;
  onComplete: (action: Action) => void;
  onUndo: (action: Action) => void;
}

const TILE_BG = {
  green: colors.green + '40',
  yellow: colors.yellow + '55',
  red: colors.red + '55',
};

export function Card({ card, primaryAction, secondaryActions, decay, onComplete, onUndo }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const dotColor = statusColorDark[decay.status];
  const bg = TILE_BG[decay.status];

  function handlePress() {
    if (!primaryAction) return;
    onComplete(primaryAction);
    setJustCompleted(true);
    scale.setValue(0.9);
    checkOpacity.setValue(1);
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.1, useNativeDriver: true, speed: 24 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }),
    ]).start();
    Animated.timing(checkOpacity, { toValue: 0, duration: 200, delay: 400, useNativeDriver: true }).start();
  }

  function handleUndo() {
    if (!primaryAction) return;
    onUndo(primaryAction);
    setJustCompleted(false);
  }

  return (
    <View style={styles.wrapper}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          style={[styles.tile, { backgroundColor: bg }]}
          onPress={handlePress}
          onLongPress={() => {
            if (secondaryActions.length || card.notes) setExpanded((v) => !v);
            else router.push(`/card/${card.id}`);
          }}
        >
          <Text style={styles.emoji}>{card.emoji || '📌'}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {card.name}
          </Text>
          <Text style={[styles.percentage, { color: dotColor }]}>{Math.round(decay.percentage)}%</Text>
          <Animated.View style={[styles.checkOverlay, { opacity: checkOpacity }]} pointerEvents="none">
            <Text style={styles.checkText}>✓</Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
      {justCompleted && (
        <Pressable onPress={handleUndo} hitSlop={8}>
          <Text style={styles.undoText}>˟撤销</Text>
        </Pressable>
      )}

      {expanded && (
        <View style={styles.expanded}>
          {secondaryActions.map((action) => (
            <Pressable key={action.id} style={styles.secondaryRow} onPress={() => onComplete(action)}>
              <Text style={styles.secondaryLabel}>{action.name}</Text>
              <Text style={styles.secondaryDo}>点击完成</Text>
            </Pressable>
          ))}
          {card.notes ? <Text style={styles.notes}>{card.notes}</Text> : null}
          <Pressable onPress={() => router.push(`/card/${card.id}`)}>
            <Text style={styles.detailLink}>查看详情/编辑</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const TILE_SIZE = 80;

const styles = StyleSheet.create({
  wrapper: { width: TILE_SIZE, alignItems: 'center' },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
  emoji: { fontSize: 26, lineHeight: 30, includeFontPadding: false },
  name: {
    fontSize: 11,
    lineHeight: 14,
    includeFontPadding: false,
    color: colors.textPrimary,
    marginTop: 2,
    maxWidth: TILE_SIZE - 12,
  },
  percentage: {
    fontSize: 10,
    lineHeight: 13,
    includeFontPadding: false,
    fontWeight: '700',
    marginTop: 2,
  },
  checkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  checkText: { fontSize: 32, color: colors.greenDark, fontWeight: '700' },
  undoText: { fontSize: fontSize.tiny, color: colors.textMuted, marginTop: 2 },
  expanded: {
    position: 'absolute',
    top: TILE_SIZE + 4,
    width: 160,
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    padding: spacing.sm,
    gap: 6,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryLabel: { fontSize: fontSize.secondary, color: colors.textPrimary },
  secondaryDo: { fontSize: fontSize.tiny, color: colors.purpleDark },
  notes: { fontSize: fontSize.tiny, color: colors.textMuted },
  detailLink: { fontSize: fontSize.tiny, color: colors.blueDark, marginTop: 2 },
});
