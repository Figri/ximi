import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fontSize, radius, spacing, statusColorDark } from '../constants/theme';
import type { Action, Card as CardType, DecayResult } from '../types';
import { ActionButton } from './ActionButton';

interface CardProps {
  card: CardType;
  primaryAction: Action | null;
  secondaryActions: Action[];
  decay: DecayResult;
  onComplete: (action: Action) => void;
  onUndo: (action: Action) => void;
}

export function Card({ card, primaryAction, secondaryActions, decay, onComplete, onUndo }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dotColor = statusColorDark[decay.status];

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  function handleComplete(action: Action) {
    onComplete(action);
    if (action.id === primaryAction?.id) {
      setJustCompleted(true);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setJustCompleted(false), 3000);
    }
  }

  function handleUndo() {
    if (!primaryAction) return;
    onUndo(primaryAction);
    setJustCompleted(false);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        style={styles.row}
        onPress={() => (secondaryActions.length || card.notes) && setExpanded((v) => !v)}
        onLongPress={() => router.push(`/card/${card.id}`)}
      >
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={styles.name} numberOfLines={1}>
          {card.name}
        </Text>
        {primaryAction && (
          <ActionButton
            label={primaryAction.name}
            status={decay.status}
            onPress={() => handleComplete(primaryAction)}
          />
        )}
      </Pressable>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.max(0, Math.min(100, decay.percentage))}%`, backgroundColor: dotColor },
            ]}
          />
        </View>
        <Text style={[styles.progressText, { color: dotColor }]}>{Math.round(decay.percentage)}%</Text>
      </View>

      {justCompleted && (
        <Pressable style={styles.undoRow} onPress={handleUndo}>
          <Text style={styles.undoText}>˟ 撤销</Text>
        </Pressable>
      )}

      {expanded && (
        <View style={styles.expanded}>
          {secondaryActions.map((action) => (
            <View key={action.id} style={styles.secondaryRow}>
              <Text style={styles.secondaryLabel}>{action.name}</Text>
              <ActionButton label={action.name} status="green" onPress={() => onComplete(action)} />
            </View>
          ))}
          {card.notes ? <Text style={styles.notes}>{card.notes}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    flex: 1,
    fontSize: fontSize.cardName,
    lineHeight: fontSize.cardName + 4,
    includeFontPadding: false,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: fontSize.tiny,
    fontWeight: '600',
    width: 32,
    textAlign: 'right',
    includeFontPadding: false,
  },
  undoRow: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  undoText: {
    fontSize: fontSize.tiny,
    color: colors.textMuted,
  },
  expanded: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryLabel: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
  },
  notes: {
    fontSize: fontSize.secondary,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
