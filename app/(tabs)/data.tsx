import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

const CARDS = [
  '习惯完成率',
  'HP / MP 趋势',
  '烦恼统计',
  '体重曲线',
  '屏幕时间统计',
  '项目列表',
];

export default function DataScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>📊 数据 · 施工中</Text>
        <Text style={styles.subtitle}>图表会在第三版加上，先占个位置</Text>
        {CARDS.map((title) => (
          <View key={title} style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardPlaceholder}>暂无数据</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fontSize.pageTitle, color: colors.textPrimary, fontWeight: '600' },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  cardPlaceholder: { fontSize: fontSize.secondary, color: colors.textMuted, marginTop: spacing.sm },
});
