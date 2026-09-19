import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

const CATEGORIES = [
  { emoji: '📅', label: '今日' },
  { emoji: '🫀', label: '身体' },
  { emoji: '😴', label: '睡眠' },
  { emoji: '🍽', label: '饮食' },
  { emoji: '💭', label: '情绪' },
  { emoji: '😮‍💨', label: '烦恼' },
  { emoji: '📋', label: '计划' },
  { emoji: '⭐', label: '收藏' },
  { emoji: '🌙', label: '梦' },
  { emoji: '💗', label: '色色' },
  { emoji: '📓', label: '日记' },
];

export default function RecordScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.body}>
        <ScrollView
          style={styles.sidebar}
          contentContainerStyle={styles.sidebarContent}
          showsVerticalScrollIndicator={false}
        >
          {CATEGORIES.map((c, i) => (
            <View key={c.label} style={[styles.sidebarItem, i === 0 && styles.sidebarItemActive]}>
              <Text style={styles.sidebarEmoji}>{c.emoji}</Text>
              <Text style={styles.sidebarLabel}>{c.label}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.content}>
          <Text style={styles.placeholderEmoji}>📋</Text>
          <Text style={styles.placeholderTitle}>记录 · 施工中</Text>
          <Text style={styles.placeholderText}>
            24h 时间轴、AI每日总结、收藏、烦恼、日记会在第二/三版加上。{'\n'}
            现在可以先在 📌 生活 里把日常打卡跑起来。
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 64 },
  sidebarContent: { paddingTop: spacing.sm, paddingBottom: spacing.xl },
  sidebarItem: { alignItems: 'center', paddingVertical: spacing.sm },
  sidebarItemActive: { backgroundColor: colors.purpleLight, borderRadius: radius.widget },
  sidebarEmoji: { fontSize: 18 },
  sidebarLabel: { fontSize: fontSize.tiny, color: colors.textSecondary, marginTop: 2 },
  content: {
    flex: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: { fontSize: 32, marginBottom: spacing.sm },
  placeholderTitle: {
    fontSize: fontSize.cardName,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  placeholderText: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
});
