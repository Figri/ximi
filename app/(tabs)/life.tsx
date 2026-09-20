import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HPMPBar } from '../../components/HPMPBar';
import { CardList } from '../../components/CardList';
import { ToolboxGrid } from '../../components/ToolboxSheet';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { useCardStore } from '../../lib/store';
import { calculateHP, calculateMP } from '../../lib/hpmp';

export default function LifeScreen() {
  const { cards, actions, cats, lastCompletions, error, fetchAll } = useCardStore();
  const [toolboxOpen, setToolboxOpen] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const hp = useMemo(() => calculateHP(cards, actions, lastCompletions), [cards, actions, lastCompletions]);
  const mp = useMemo(() => calculateMP(cards, actions, lastCompletions), [cards, actions, lastCompletions]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HPMPBar hp={hp} mp={mp} onToolboxPress={() => setToolboxOpen((v) => !v)} />
      {error && <Text style={styles.error}>{error}</Text>}
      {toolboxOpen && <ToolboxGrid onClose={() => setToolboxOpen(false)} />}
      <CardList cats={cats} onNewCardPress={() => router.push('/card/new')} />
      <Pressable style={styles.fab} onPress={() => router.push('/card/new')}>
        <Text style={styles.fabText}>＋</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  error: {
    color: colors.redDark,
    fontSize: fontSize.secondary,
    paddingHorizontal: spacing.lg,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: radius.avatar,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 26, fontWeight: '300', marginTop: -2 },
});
