import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { HabitIcon } from '../checkin/HabitIcon';
import { getActionDecay, isCompletedToday } from '../../lib/decay';
import { useCardStore } from '../../lib/store';
import type { Action, Card } from '../../types';

// 「该照顾的」：变黄、变红的例行（习惯卡片）。默认收成一行（几件、几件红了），点开才看；
// 点开后按分类分组（卡片的第一个标签，比如 🐱猫、🏠家务；没标签的按名字猜一下猫 / 打扫，猜不出放「其他」）。
// 点图标就算照顾过了（再点撤销）；这一轮点过的留着显示 ✓，刷新后才收走。分类在「编辑习惯」里改（长按图标进去）。

const CAT_WORDS = /猫|铲屎|猫砂|喂|水碗|梳毛|剪指甲|艾琪|小黄|皮蛋|粥粥|兔狲|兔轩/;
const CLEAN_WORDS = /扫|拖|擦|洗|倒垃圾|收拾|整理|客厅|厨房|卫生间|厕所|浴室|床|桌/;

function groupOf(card: Card): string {
  const first = (card.tags ?? []).find((t) => !!t && !!t.trim());
  if (first) return first;
  if (CAT_WORDS.test(card.name)) return '🐱猫';
  if (CLEAN_WORDS.test(card.name)) return '🧹打扫';
  return '其他';
}

interface Item {
  card: Card;
  action: Action;
  red: boolean;
  done: boolean;
}

export function CareSection() {
  const { cards, actions, cats, lastCompletions, doComplete, doUndo } = useCardStore();
  /** 这一轮在页面上点过的：今天照顾过了也留着显示 ✓，方便撤销 */
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  /** 默认收起来（每次打开 App 都是收着的） */
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const card of cards) {
      if (card.archived || card.display_type !== 'habit') continue;
      const primary = actions.find((a) => a.card_id === card.id && a.is_primary);
      if (!primary || primary.frequency_type === 'manual') continue;
      const last = lastCompletions[primary.id] ? new Date(lastCompletions[primary.id]) : null;
      if (isCompletedToday(last)) {
        // 今天照顾过：只有这一轮在页面上点的才留着（能撤销），别的不出现
        if (touched.has(primary.id)) out.push({ card, action: primary, red: false, done: true });
        continue;
      }
      const status = getActionDecay(primary, last).status;
      if (status !== 'green') out.push({ card, action: primary, red: status === 'red', done: false });
    }
    return out;
  }, [cards, actions, lastCompletions, touched]);

  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const g = groupOf(it.card);
      map.set(g, [...(map.get(g) ?? []), it]);
    }
    return [...map.entries()]
      .map(([name, list]) => ({ name, list: list.sort((a, b) => Number(b.red) - Number(a.red)) }))
      .sort((a, b) => (a.name === '其他' ? 1 : b.name === '其他' ? -1 : b.list.length - a.list.length));
  }, [items]);

  const pending = items.filter((i) => !i.done);
  if (!items.length) return <Text style={styles.allGood}>都照顾到了 ✓</Text>;

  if (!open) {
    const reds = pending.filter((i) => i.red).length;
    return (
      <Pressable style={styles.collapsed} onPress={() => setOpen(true)} testID="care-expand">
        <View style={styles.collapsedTop}>
          <Text style={styles.summary}>
            {pending.length ? `${pending.length} 件该照顾了${reds ? ` · ${reds} 件有点久了` : ''}` : '都照顾到了 ✓'}
          </Text>
          <Text style={styles.link}>展开 ›</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {groups.map((g) => `${g.name} ${g.list.filter((i) => !i.done).length}`).join('   ')}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      {groups.map((g) => (
        <View key={g.name} style={styles.group}>
          <Text style={styles.groupName}>
            {g.name} · {g.list.length}
          </Text>
          <View style={styles.row}>
            {g.list.map(({ card, action }) => (
              <HabitIcon
                key={card.id}
                card={card}
                action={action}
                lastCompletedAt={lastCompletions[action.id] ? new Date(lastCompletions[action.id]) : null}
                cats={cats}
                onComplete={(a, options) => {
                  setTouched((prev) => new Set(prev).add(a.id));
                  doComplete(a, card, options);
                }}
                onUndo={(a) => doUndo(a.id)}
              />
            ))}
          </View>
        </View>
      ))}
      <View style={styles.footer}>
        <Text style={styles.hint}>长按图标能改它的分类</Text>
        <Pressable onPress={() => setOpen(false)} hitSlop={8} testID="care-collapse">
          <Text style={styles.link}>收起</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  collapsed: { gap: 4, backgroundColor: colors.background, borderRadius: radius.widget, paddingHorizontal: spacing.md, paddingVertical: 10 },
  collapsedTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  summary: { flexShrink: 1, fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  preview: { fontSize: fontSize.secondary, color: colors.textMuted },
  link: { fontSize: fontSize.secondary, color: colors.purpleDark },
  group: { gap: 6 },
  groupName: { fontSize: fontSize.secondary, color: colors.textSecondary, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { fontSize: fontSize.tiny, color: colors.textMuted },
  allGood: { fontSize: fontSize.body, color: colors.textMuted },
});
