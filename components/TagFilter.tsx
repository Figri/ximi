import { ScrollView, Pressable, Text, StyleSheet, View } from 'react-native';
import { colors, radius, spacing, fontSize } from '../constants/theme';

interface TagFilterProps {
  tags: string[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
  onAddPress?: () => void;
}

export function TagFilter({ tags, selected, onSelect, onAddPress }: TagFilterProps) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        <Chip label="全部" active={selected === null} onPress={() => onSelect(null)} />
        {tags.map((tag) => (
          <Chip key={tag} label={tag} active={selected === tag} onPress={() => onSelect(tag)} />
        ))}
        {onAddPress && <Chip label="＋" active={false} onPress={onAddPress} />}
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 48,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.purple,
  },
  chipText: {
    fontSize: fontSize.body,
    lineHeight: fontSize.body + 2,
    color: colors.textSecondary,
    includeFontPadding: false,
  },
  chipTextActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
});
