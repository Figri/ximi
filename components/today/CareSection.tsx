import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import { HabitIcon } from '../checkin/HabitIcon';
import { getActionDecay, isCompletedToday } from '../../lib/decay';
import { useCardStore } from '../../lib/store';
import type { Action, Card } from '../../types';

// 「该照顾的」：变黄、变红的例行（习惯卡片）用圆形图标，点一下就算照顾过了（再点撤销）；
// 全绿时收成一行（需求文档 §8.1 T-5）。今天刚点过的留在这里显示 ✓，方便撤销，刷新后才收走。

export function CareSection() {
  const { cards, actions, cats, lastCompletions, doComplete, doUndo } = useCardStore();
  /** 这一轮在页面上点过的：今天照顾过了也留着显示 ✓，方便撤销 */
  const [touched, setTouched] = useState<Set<string>>(() => new Set());

  const items = useMemo(() => {
    const out: { card: Card; action: Action; red: boolean }[] = [];
    for (const card of cards) {
      if (card.archived || card.display_type !== 'habit') continue;
      const primary = actions.find((a) => a.card_id === card.id && a.is_primary);
      if (!primary || primary.frequency_type === 'manual') continue;
      const last = lastCompletions[primary.id] ? new Date(lastCompletions[primary.id]) : null;
      if (isCompletedToday(last)) {
        // 今天照顾过：只有这一轮在页面上点的才留着（能撤销），别的不出现
        if (touched.has(primary.id)) out.push({ card, action: primary, red: false });
        continue;
      }
      const status = getActionDecay(primary, last).status;
      if (status !== 'green') out.push({ card, action: primary, red: status === 'red' });
    }
    return out.sort((a, b) => Number(b.red) - Number(a.red));
  }, [cards, actions, lastCompletions, touched]);

  if (!items.length) return <Text style={styles.allGood}>都照顾到了 ✓</Text>;

  return (
    <View style={styles.row}>
      {items.map(({ card, action }) => (
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  allGood: { fontSize: fontSize.body, color: colors.textMuted },
});
