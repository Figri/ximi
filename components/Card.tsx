import { useState } from 'react';
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
  const dotColor = statusColorDark[decay.status];

  return (
    <View style={styles.wrapper}>
      <Pressable
        style={styles.row}
        onPress={() => (secondaryActions.length || card.notes) && setExpanded((v) => !v)}
        onLongPress={() => router.push(`/card/${card.id}`)}
      >
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {card.name}
          </Text>
          <Text style={[styles.timeLeft, { color: dotColor }]}>{decay.timeLeft}</Text>
        </View>
        {primaryAction && (
          <ActionButton
            label={primaryAction.name}
            status={decay.status}
            onPress={() => onComplete(primaryAction)}
            onUndo={() => onUndo(primaryAction)}
          />
        )}
      </Pressable>

      {expanded && (
        <View style={styles.expanded}>
          {secondaryActions.map((action) => (
            <View key={action.id} style={styles.secondaryRow}>
              <Text style={styles.secondaryLabel}>{action.name}</Text>
              <ActionButton
                label={action.name}
                status="green"
                onPress={() => onComplete(action)}
                onUndo={() => onUndo(action)}
              />
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
    height: 64,
    paddingHorizontal: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: fontSize.cardName,
    lineHeight: fontSize.cardName + 4,
    includeFontPadding: false,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  timeLeft: {
    fontSize: fontSize.secondary,
    lineHeight: fontSize.secondary + 4,
    includeFontPadding: false,
    marginTop: 2,
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
