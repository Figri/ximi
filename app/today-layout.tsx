import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { colors, fontSize, lh, radius, spacing } from '../constants/theme';
import { DEFAULT_TODAY_LAYOUT, TODAY_CARDS, type TodayCardKey, type TodayLayout } from '../lib/todayCards';
import { loadTodayLayout, saveTodayLayout } from '../lib/todayLayout';

// 今天页右上角「调整」：长按一行上下拖排顺序，右边开关管显示不显示。改了马上存，回到今天页就是新的样子。

const LABEL: Record<TodayCardKey, { label: string; icon: string }> = Object.fromEntries(TODAY_CARDS.map((c) => [c.key, { label: c.label, icon: c.icon }])) as any;
const SWITCH_TRACK = { false: '#DDD6E8', true: colors.purple };

export default function TodayLayoutScreen() {
  const [layout, setLayout] = useState<TodayLayout | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    loadTodayLayout().then(setLayout);
  }, []);

  function persist(next: TodayLayout) {
    setLayout(next);
    saving.current = saving.current.catch(() => {}).then(() => saveTodayLayout(next));
  }

  function toggle(k: TodayCardKey, show: boolean) {
    if (!layout) return;
    persist({ ...layout, hidden: show ? layout.hidden.filter((x) => x !== k) : [...layout.hidden, k] });
  }

  function renderItem({ item, drag, isActive }: RenderItemParams<TodayCardKey>) {
    const shown = !layout?.hidden.includes(item);
    return (
      <ScaleDecorator>
        <Pressable style={[styles.row, isActive && styles.rowActive]} onLongPress={drag} delayLongPress={150} testID={`layout-row-${item}`}>
          <Text style={styles.handle}>⠿</Text>
          <Text style={styles.icon}>{LABEL[item].icon}</Text>
          <Text style={[styles.name, !shown && styles.nameOff]} numberOfLines={1}>
            {LABEL[item].label}
          </Text>
          <Switch value={shown} onValueChange={(v) => toggle(item, v)} trackColor={SWITCH_TRACK} thumbColor="#fff" testID={`layout-show-${item}`} />
        </Pressable>
      </ScaleDecorator>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} testID="layout-back">
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>今天页放什么</Text>
        <View style={{ width: 48 }} />
      </View>
      {layout ? (
        <DraggableFlatList
          data={layout.order}
          keyExtractor={(k) => k}
          renderItem={renderItem}
          onDragEnd={({ data }) => persist({ ...layout, order: data })}
          containerStyle={styles.flex}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<Text style={styles.hint}>长按一行上下拖，排今天页的顺序；关掉的就不显示。翻到以前的日子只看随心记、喝水、事项。</Text>}
          ListFooterComponent={
            <Pressable style={styles.reset} onPress={() => persist({ order: [...DEFAULT_TODAY_LAYOUT.order], hidden: [] })} hitSlop={8} testID="layout-reset">
              <Text style={styles.resetText}>恢复默认</Text>
            </Pressable>
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  back: { fontSize: fontSize.body, color: colors.purpleDark, width: 48 },
  title: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  hint: { fontSize: fontSize.secondary, color: colors.textMuted, lineHeight: lh(17), marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.sm },
  rowActive: { backgroundColor: colors.purpleLight },
  handle: { fontSize: 18, color: colors.textMuted, width: 18 },
  icon: { fontSize: 18 },
  name: { flex: 1, fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  nameOff: { color: colors.textMuted, fontWeight: '400' },
  reset: { alignSelf: 'center', paddingVertical: spacing.md },
  resetText: { fontSize: fontSize.secondary, color: colors.purpleDark },
});
