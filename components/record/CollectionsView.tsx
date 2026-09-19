import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchCollections, type CollectionWithCard } from '../../lib/collections';

export function CollectionsView({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<CollectionWithCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchCollections()
      .then(setItems)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />;

  if (items.length === 0) {
    return <Text style={styles.empty}>还没有收藏，点右下角 ＋ 加一个</Text>;
  }

  return (
    <View>
      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.name}>{item.card_name}</Text>
          {item.content && <Text style={styles.content}>{item.content}</Text>}
          {item.url && (
            <Pressable onPress={() => Linking.openURL(item.url!)}>
              <Text style={styles.link} numberOfLines={1}>
                {item.url}
              </Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, marginTop: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  name: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  content: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: 4 },
  link: { fontSize: fontSize.secondary, color: colors.blueDark, marginTop: 4 },
});
