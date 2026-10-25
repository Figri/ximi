import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchActionHistory } from '../../lib/cards';
import { describeFrequency } from '../../lib/decay';
import type { Action, Card, Cat, Completion } from '../../types';

// 长按一个习惯：以前哪天做的（新的在上面），选了猫的带上是哪几只。底下能去改这个习惯。

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function ago(d: Date, now: Date): string {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const n = Math.round((b - a) / 86400000);
  return n === 0 ? '今天' : n === 1 ? '昨天' : `${n} 天前`;
}

interface Props {
  target: { card: Card; action: Action } | null;
  cats: Cat[];
  onClose: () => void;
  onEdit: (card: Card) => void;
}

export function HabitHistorySheet({ target, cats, onClose, onEdit }: Props) {
  const [rows, setRows] = useState<Completion[] | null>(null);

  useEffect(() => {
    setRows(null);
    if (!target) return;
    fetchActionHistory(target.action.id)
      .then(setRows)
      .catch(() => setRows([]));
  }, [target?.action.id]);

  const now = new Date();
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  let lastDay = '';

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="history-backdrop">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {target ? (
            <>
              <View style={styles.head}>
                <Text style={styles.title} numberOfLines={2}>
                  {target.card.emoji || '⭐'} {target.card.name}
                </Text>
                <Pressable onPress={() => onEdit(target.card)} hitSlop={8} testID="history-edit">
                  <Text style={styles.link}>改这个习惯 ›</Text>
                </Pressable>
              </View>
              <Text style={styles.freq}>
                {describeFrequency(target.action)}
                {rows && rows.length ? ` · 上次 ${ago(new Date(rows[0].completed_at), now)}` : ''}
              </Text>
              <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
                {rows == null ? <Text style={styles.empty}>读取中…</Text> : null}
                {rows && !rows.length ? <Text style={styles.empty}>还没做过。做了点一下圆圈就会记在这儿。</Text> : null}
                {(rows ?? []).map((r) => {
                  const d = new Date(r.completed_at);
                  const k = dayKey(d);
                  const firstOfDay = k !== lastDay;
                  lastDay = k;
                  const who = (r.selected_cats ?? []).map((id) => catName.get(id)).filter(Boolean).join('、');
                  return (
                    <View key={r.id} style={styles.row} testID="history-row">
                      <Text style={[styles.date, !firstOfDay && styles.dateRepeat]}>
                        {firstOfDay ? `${d.getMonth() + 1}/${d.getDate()} ${WEEK[d.getDay()]}` : ''}
                      </Text>
                      <Text style={styles.time}>
                        {`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`}
                      </Text>
                      <Text style={styles.note} numberOfLines={1}>
                        {[who, r.notes].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
              {rows && rows.length >= 60 ? <Text style={styles.empty}>只列最近 60 次</Text> : null}
              <Pressable style={styles.close} onPress={onClose} testID="history-close">
                <Text style={styles.closeText}>关上</Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm, maxHeight: '75%' },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  title: { flex: 1, fontSize: fontSize.cardName + 1, fontWeight: '700', color: colors.textPrimary },
  link: { fontSize: fontSize.secondary, color: colors.purpleDark, paddingTop: 3 },
  freq: { fontSize: fontSize.secondary, color: colors.textSecondary },
  list: { flexGrow: 0 },
  listInner: { gap: 2, paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  date: { width: 78, fontSize: fontSize.body, color: colors.textPrimary },
  dateRepeat: { color: 'transparent' },
  time: { width: 44, fontSize: fontSize.body, color: colors.textSecondary },
  note: { flex: 1, fontSize: fontSize.secondary, color: colors.textMuted },
  empty: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 19 },
  close: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8, borderRadius: radius.widget, backgroundColor: colors.background },
  closeText: { fontSize: fontSize.body, color: colors.textSecondary },
});
