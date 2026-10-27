import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/theme';
import { formatPoints } from '../../lib/pointsCalc';

// 时间条、列表、统计里同一个小胶囊：白底，正分绿字「+10」，负分红字「-8」。
// 用白底是因为格子本身有绿（睡）、红（家务）这些底色，直接写绿字红字会看不清。

export function PointsBadge({ points, size = 'sm', testID }: { points: number; size?: 'xs' | 'sm'; testID?: string }) {
  const color = points > 0 ? colors.greenDark : points < 0 ? colors.redDark : colors.textMuted;
  return (
    <View style={[styles.badge, size === 'xs' ? styles.badgeXs : styles.badgeSm, { borderColor: color + '66' }]} testID={testID}>
      <Text style={[size === 'xs' ? styles.textXs : styles.textSm, { color }]} numberOfLines={1}>
        {formatPoints(points)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, alignSelf: 'flex-start' },
  badgeXs: { borderRadius: 6, paddingHorizontal: 3, paddingVertical: 0, marginRight: 3 },
  badgeSm: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  textXs: { fontSize: 9, lineHeight: 12, fontWeight: '800', includeFontPadding: false },
  textSm: { fontSize: 11, lineHeight: 15, fontWeight: '800', includeFontPadding: false },
});
