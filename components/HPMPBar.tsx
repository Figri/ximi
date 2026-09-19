import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';

interface HPMPBarProps {
  hp: number;
  mp: number;
  onToolboxPress?: () => void;
}

/**
 * v1 先做静态展示，HP/MP 的真实计算规则见 lib/decay.ts 后续版本（P3）。
 */
export function HPMPBar({ hp, mp, onToolboxPress }: HPMPBarProps) {
  return (
    <View style={styles.container}>
      <Meter emoji="❤️" value={hp} color={colors.redDark} />
      <Meter emoji="💜" value={mp} color={colors.purpleDark} />
      <Pressable onPress={onToolboxPress} style={styles.toolbox}>
        <Text style={styles.toolboxEmoji}>🧰</Text>
      </Pressable>
    </View>
  );
}

function Meter({ emoji, value, color }: { emoji: string; value: number; color: string }) {
  return (
    <View style={styles.meter}>
      <Text style={styles.meterEmoji}>{emoji}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  meter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  meterEmoji: { fontSize: 14 },
  track: {
    flex: 1,
    height: 6,
    borderRadius: radius.widget,
    backgroundColor: colors.blueLight,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.widget,
  },
  value: {
    fontSize: fontSize.secondary,
    color: colors.textSecondary,
    width: 20,
  },
  toolbox: {
    padding: spacing.xs,
  },
  toolboxEmoji: { fontSize: 18 },
});
