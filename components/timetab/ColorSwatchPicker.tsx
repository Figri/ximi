import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

const PRESET_COLORS = [
  '#8B7BA8', '#8B5E2B', '#A78BCE', '#5CB88A', '#F5B841', '#E86F52',
  '#2E6DB4', '#3E3A7A', '#1FA69A', '#E8D96F', '#8B5A2B', '#7A857D',
  '#C05858', '#C4A830', '#5DA87A', '#6A9DBF', '#C48293', '#8E73B3',
];

interface ColorSwatchPickerProps {
  value: string;
  onChange: (color: string) => void;
  compact?: boolean; // 弹窗不能滚动时用，缩小色块尺寸让一屏放得下
}

export function ColorSwatchPicker({ value, onChange, compact }: ColorSwatchPickerProps) {
  const swatchSize = compact ? 24 : 32;
  return (
    <View>
      <View style={[styles.grid, compact && styles.gridCompact]}>
        {PRESET_COLORS.map((c) => (
          <Pressable
            key={c}
            style={[
              styles.swatch,
              { width: swatchSize, height: swatchSize, backgroundColor: c },
              value === c && styles.swatchActive,
            ]}
            onPress={() => onChange(c)}
          />
        ))}
      </View>
      <View style={styles.customRow}>
        <Text style={styles.customLabel}>自定义hex</Text>
        <TextInput
          style={styles.customInput}
          value={value}
          onChangeText={onChange}
          placeholder="#A78BCE"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={[styles.previewDot, { backgroundColor: value }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridCompact: { gap: 6 },
  swatch: { width: 32, height: 32, borderRadius: radius.avatar, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: colors.textPrimary },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  customLabel: { fontSize: fontSize.tiny, color: colors.textMuted },
  customInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  previewDot: { width: 24, height: 24, borderRadius: radius.avatar },
});
