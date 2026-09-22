import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HPMPBar } from '../../components/HPMPBar';
import { ToolboxGrid } from '../../components/ToolboxSheet';
import { HabitSection } from '../../components/checkin/HabitSection';
import { TodoSection } from '../../components/checkin/TodoSection';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { useCardStore } from '../../lib/store';
import { calculateHP, calculateMP } from '../../lib/hpmp';

export default function CheckinScreen() {
  const { cards, actions, cats, lastCompletions, error, fetchAll } = useCardStore();
  const [toolboxOpen, setToolboxOpen] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const hp = useMemo(() => calculateHP(cards, actions, lastCompletions), [cards, actions, lastCompletions]);
  const mp = useMemo(() => calculateMP(cards, actions, lastCompletions), [cards, actions, lastCompletions]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>打卡</Text>
        <Pressable style={styles.addButton} onPress={() => router.push('/habit/new')}>
          <Text style={styles.addButtonText}>＋</Text>
        </Pressable>
      </View>
      <HPMPBar hp={hp} mp={mp} onToolboxPress={() => setToolboxOpen((v) => !v)} />
      {error && <Text style={styles.error}>{error}</Text>}
      {toolboxOpen && <ToolboxGrid onClose={() => setToolboxOpen(false)} />}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <HabitSection cats={cats} />
        <View style={styles.divider} />
        <TodoSection />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  pageTitle: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: radius.avatar,
    backgroundColor: colors.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: colors.purpleDark, fontSize: 18, fontWeight: '600', marginTop: -2 },
  error: {
    color: colors.redDark,
    fontSize: fontSize.secondary,
    paddingHorizontal: spacing.lg,
  },
  scrollContent: { paddingBottom: spacing.xl * 3 },
  divider: {
    height: 1,
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
  },
});
