import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HPMPBar } from '../../components/HPMPBar';
import { CardList } from '../../components/CardList';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { useCardStore } from '../../lib/store';

export default function LifeScreen() {
  const fetchAll = useCardStore((s) => s.fetchAll);
  const error = useCardStore((s) => s.error);
  const [toolboxOpen, setToolboxOpen] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HPMPBar hp={72} mp={55} onToolboxPress={() => setToolboxOpen((v) => !v)} />
      {error && <Text style={styles.error}>{error}</Text>}
      {toolboxOpen && <Toolbox onClose={() => setToolboxOpen(false)} />}
      <CardList onNewCardPress={() => router.push('/card/new')} />
      <Pressable style={styles.fab} onPress={() => router.push('/card/new')}>
        <Text style={styles.fabText}>＋</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Toolbox({ onClose }: { onClose: () => void }) {
  const items = [
    { emoji: '⚖️', label: '体重' },
    { emoji: '🩸', label: '生理期' },
    { emoji: '💪', label: '运动' },
    { emoji: '⏱', label: '计时器' },
  ];
  return (
    <View style={styles.toolboxSheet}>
      {items.map((item) => (
        <Pressable key={item.label} style={styles.toolboxItem} onPress={onClose}>
          <Text style={styles.toolboxEmoji}>{item.emoji}</Text>
          <Text style={styles.toolboxLabel}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
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
    bottom: spacing.xl + 60,
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
  toolboxSheet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.md,
  },
  toolboxItem: { alignItems: 'center', width: 64 },
  toolboxEmoji: { fontSize: 22, marginBottom: 4 },
  toolboxLabel: { fontSize: fontSize.tiny, color: colors.textSecondary },
});
