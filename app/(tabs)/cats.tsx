import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageTitle } from '../../components/common/PageTitle';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchCats } from '../../lib/cards';
import { fetchLastCatWeights } from '../../lib/cats';
import { catTodos, type CatTodo } from '../../lib/catTodos';
import type { Cat } from '../../types';

// 猫咪（需求文档 §8.8）：每只猫一张卡——上次称重、接下来要做的（＋ 里提到它的事项、填了下次日期自动建的事项），点进去看这只猫的记录。

function md(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
}

export default function CatsScreen() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [weights, setWeights] = useState<Record<string, { value: number; date: string }>>({});
  const [todos, setTodos] = useState<Record<string, CatTodo[]>>({});
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const list = await fetchCats().catch(() => []);
        setCats(list);
        setWeights(await fetchLastCatWeights(list.map((c) => c.id)).catch(() => ({})));
        setTodos(await catTodos());
        setLoaded(true);
      })();
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <PageTitle title="猫咪" />
      <ScrollView contentContainerStyle={styles.body}>
        {loaded && !cats.length ? <Text style={styles.empty}>还没有猫的资料。旧数据搬过来以后，猫会出现在这里。</Text> : null}
        {cats.map((c) => {
          const w = weights[c.id];
          const next = (todos[c.id] ?? []).filter((t) => !t.done)[0];
          return (
            <Pressable key={c.id} style={styles.card} onPress={() => router.push(`/cat/${c.id}`)} testID={`cat-${c.name}`}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{c.name.slice(0, 1)}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.name}>
                  {c.name} {c.gender ?? ''}
                </Text>
                <Text style={styles.meta}>{w ? `上次称重 ${w.value}kg · ${md(w.date.slice(0, 10))}` : '还没称过'}</Text>
                {next ? (
                  <Text style={styles.next}>
                    接下来：{md(next.date)} {next.content}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  empty: { fontSize: fontSize.body, color: colors.textMuted },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, color: colors.textPrimary, fontWeight: '600' },
  flex: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.cardName, fontWeight: '600', color: colors.textPrimary },
  meta: { fontSize: fontSize.secondary, color: colors.textSecondary },
  next: { fontSize: fontSize.secondary, color: colors.purpleDark },
  arrow: { fontSize: 20, color: colors.textMuted },
});
