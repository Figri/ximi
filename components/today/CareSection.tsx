import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { HabitTile } from './HabitTile';
import { HabitHistorySheet } from './HabitHistorySheet';
import { WeightSheet } from './WeightSheet';
import { getActionDecay, habitSubLabel, isCompletedToday } from '../../lib/decay';
import { groupOf, loadGroupOrder, sortGroupNames } from '../../lib/careGroups';
import { useCardStore } from '../../lib/store';
import type { Action, Card, DecayStatus } from '../../types';

// 「该照顾的」（今天页最底下）：变黄、变红的例行（习惯卡片）。默认收成一行（几件、几件红了），点开才看。
// 点开后按分类分组，分类的先后在「分类管理」里拖；组里按建的先后排，点了、撤销了都不挪位置。
// 一排 3 个。点 = 做了（再点撤销），这一轮点过的留着显示 ✓；「称体重」点了弹记体重。长按 = 以前的记录。
// 「全部」能看到所有习惯（还早的、今天做过的、想做就做的），原来打卡页的事在这儿做。

const K_SHOW_ALL = 'care_show_all_v1';
const WEIGH_WORDS = /称体重|量体重|体重/;

interface Item {
  card: Card;
  action: Action;
  status: DecayStatus;
  done: boolean;
  due: boolean;
  sub: string;
}

export function CareSection() {
  const { cards, actions, cats, lastCompletions, doComplete, doUndo } = useCardStore();
  /** 这一轮在页面上点过的：今天照顾过了也留着显示 ✓，方便撤销 */
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  /** 默认收起来（每次打开 App 都是收着的） */
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [history, setHistory] = useState<{ card: Card; action: Action } | null>(null);
  const [weighing, setWeighing] = useState<{ card: Card; action: Action } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(K_SHOW_ALL)
      .then((v) => setShowAll(v === '1'))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadGroupOrder()
        .then(setOrder)
        .catch(() => {});
    }, [])
  );

  function toggleShowAll(v: boolean) {
    setShowAll(v);
    AsyncStorage.setItem(K_SHOW_ALL, v ? '1' : '0').catch(() => {});
  }

  const all = useMemo(() => {
    const now = new Date();
    const out: Item[] = [];
    for (const card of cards) {
      if (card.archived || card.display_type !== 'habit') continue;
      const primary = actions.find((a) => a.card_id === card.id && a.is_primary);
      if (!primary) continue;
      const last = lastCompletions[primary.id] ? new Date(lastCompletions[primary.id]) : null;
      const done = isCompletedToday(last);
      const manual = primary.frequency_type === 'manual';
      const status: DecayStatus = done || manual ? 'green' : getActionDecay(primary, last).status;
      out.push({ card, action: primary, status, done, due: !manual && !done && status !== 'green', sub: habitSubLabel(primary, last, done, now) });
    }
    return out;
  }, [cards, actions, lastCompletions]);

  const items = showAll ? all : all.filter((i) => i.due || (i.done && touched.has(i.action.id)));

  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const g = groupOf(it.card);
      map.set(g, [...(map.get(g) ?? []), it]);
    }
    return sortGroupNames([...map.keys()], order).map((name) => ({ name, list: map.get(name)! }));
  }, [items, order]);

  const pending = all.filter((i) => i.due);
  const reds = pending.filter((i) => i.status === 'red').length;

  function complete(it: Item, options?: { selectedCats?: string[] }) {
    setTouched((prev) => new Set(prev).add(it.action.id));
    doComplete(it.action, it.card, options);
  }

  const sheets = (
    <>
      <HabitHistorySheet
        target={history}
        cats={cats}
        onClose={() => setHistory(null)}
        onEdit={(card) => {
          setHistory(null);
          router.push(`/habit/${card.id}`);
        }}
      />
      <WeightSheet
        visible={!!weighing}
        cats={cats}
        title={weighing?.card.name}
        onClose={() => setWeighing(null)}
        onSaved={({ catIds }) => {
          const w = weighing;
          setWeighing(null);
          if (!w) return;
          setTouched((prev) => new Set(prev).add(w.action.id));
          doComplete(w.action, w.card, catIds.length ? { selectedCats: catIds } : undefined);
        }}
      />
    </>
  );

  if (!all.length) {
    return (
      <View style={styles.collapsed}>
        <Text style={styles.summary}>还没有要照顾的习惯</Text>
        <Pressable onPress={() => router.push('/habit/new')} hitSlop={8} testID="care-new">
          <Text style={styles.link}>＋ 新习惯</Text>
        </Pressable>
      </View>
    );
  }

  if (!open) {
    const preview = sortGroupNames(
      Array.from(new Set(pending.map((i) => groupOf(i.card)))),
      order
    ).map((g) => `${g} ${pending.filter((i) => groupOf(i.card) === g).length}`);
    return (
      <Pressable style={styles.collapsed} onPress={() => setOpen(true)} testID="care-expand">
        <View style={styles.collapsedTop}>
          <Text style={styles.summary}>
            {pending.length ? `${pending.length} 件该照顾了${reds ? ` · ${reds} 件有点久了` : ''}` : `都照顾到了 ✓（一共 ${all.length} 个习惯）`}
          </Text>
          <Text style={styles.link}>展开 ›</Text>
        </View>
        {preview.length ? (
          <Text style={styles.preview} numberOfLines={2}>
            {preview.join('   ')}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <View style={styles.seg}>
          <Pressable style={[styles.segBtn, !showAll && styles.segOn]} onPress={() => toggleShowAll(false)} testID="care-due">
            <Text style={[styles.segText, !showAll && styles.segTextOn]}>该做的 {pending.length}</Text>
          </Pressable>
          <Pressable style={[styles.segBtn, showAll && styles.segOn]} onPress={() => toggleShowAll(true)} testID="care-all">
            <Text style={[styles.segText, showAll && styles.segTextOn]}>全部 {all.length}</Text>
          </Pressable>
        </View>
        <View style={styles.links}>
          <Pressable onPress={() => router.push('/care-groups')} hitSlop={8} testID="care-groups">
            <Text style={styles.link}>分类管理</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/habit/new')} hitSlop={8} testID="care-new">
            <Text style={styles.link}>＋ 新习惯</Text>
          </Pressable>
        </View>
      </View>

      {!items.length ? (
        <Pressable onPress={() => toggleShowAll(true)} hitSlop={6}>
          <Text style={styles.allGood}>都照顾到了 ✓ 看全部 ›</Text>
        </Pressable>
      ) : null}

      {groups.map((g) => (
        <View key={g.name} style={styles.group}>
          <Text style={styles.groupName}>
            {g.name} · {g.list.length}
          </Text>
          <View style={styles.grid}>
            {g.list.map((it) => (
              <HabitTile
                key={it.card.id}
                card={it.card}
                action={it.action}
                status={it.status}
                done={it.done}
                sub={it.sub}
                cats={cats}
                onComplete={(options) => complete(it, options)}
                onUndo={() => doUndo(it.action.id)}
                onLongPress={() => setHistory({ card: it.card, action: it.action })}
                onSpecial={WEIGH_WORDS.test(it.card.name) ? () => setWeighing({ card: it.card, action: it.action }) : undefined}
              />
            ))}
          </View>
        </View>
      ))}
      <View style={styles.footer}>
        <Text style={styles.hint}>长按能看以前哪天做的</Text>
        <Pressable onPress={() => setOpen(false)} hitSlop={8} testID="care-collapse">
          <Text style={styles.link}>收起</Text>
        </Pressable>
      </View>
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  collapsed: { gap: 4, backgroundColor: colors.background, borderRadius: radius.widget, paddingHorizontal: spacing.md, paddingVertical: 10 },
  collapsedTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  summary: { flexShrink: 1, fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  preview: { fontSize: fontSize.secondary, color: colors.textMuted, lineHeight: 16 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  seg: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: radius.button, padding: 2 },
  segBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.button },
  segOn: { backgroundColor: colors.card },
  segText: { fontSize: fontSize.secondary, color: colors.textMuted },
  segTextOn: { color: colors.purpleDark, fontWeight: '700' },
  links: { flexDirection: 'row', gap: spacing.md },
  link: { fontSize: fontSize.secondary, color: colors.purpleDark },
  group: { gap: 2 },
  groupName: { fontSize: fontSize.secondary, color: colors.textSecondary, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { fontSize: fontSize.tiny, color: colors.textMuted },
  allGood: { fontSize: fontSize.body, color: colors.textMuted },
});
