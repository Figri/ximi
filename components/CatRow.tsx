import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import type { Cat } from '../types';

export function CatRow({ cats }: { cats: Cat[] }) {
  if (cats.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
        {cats.map((cat) => (
          <Pressable key={cat.id} style={styles.item} onPress={() => router.push(`/cat/${cat.id}`)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{cat.name.slice(0, 1)}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {cat.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 84,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  item: { alignItems: 'center', width: 56 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.avatar,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  name: { fontSize: fontSize.tiny, color: colors.textSecondary, includeFontPadding: false },
});
