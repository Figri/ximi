import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { db } from '../../lib/localdb';
import { useDataBus } from '../../lib/dataBus';
import { colors, radius, spacing } from '../../constants/theme';

export function OsReviews({ date }: { date: string }) {
  const version = useDataBus((s) => s.version);
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setPage(0); }, [date, query]);
  useEffect(() => {
    let active = true;
    const q = db.from('os_reviews').select('*').eq('date', date).order('at', { ascending: true });
    if (query.trim()) q.ilike('body', `%${query.trim()}%`);
    q.range(0, (page + 1) * 10).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message); else { setRows(data ?? []); setError(''); }
    });
    return () => { active = false; };
  }, [date, version, page, query]);
  return <View testID="os-reviews" style={s.card}>
    <Text style={s.title}>今日复盘</Text>
    <TextInput testID="review-search" value={query} onChangeText={setQuery} placeholder="搜索这一天的复盘正文" style={s.search} />
    {error ? <Text style={s.note}>{error}</Text> : null}
    {!rows.length ? <Text style={s.note}>这一天还没有复盘。ChatGPT 写回并同步后会显示在这里。</Text> : null}
    {rows.slice(0, (page + 1) * 10).map((r) => <Review key={r.id} row={r} />)}
    {rows.length > (page + 1) * 10 ? <Pressable onPress={() => setPage((n) => n + 1)}><Text style={s.link}>继续查看</Text></Pressable> : null}
  </View>;
}
function Review({ row }: { row: any }) {
  const [open, setOpen] = useState(true);
  return <View style={s.record}>
    <Pressable onPress={() => setOpen((v) => !v)}><Text style={s.link}>{row.title || '复盘'} · {row.category || '记录'} {open ? '⌃' : '⌄'}</Text></Pressable>
    {open ? <Text testID={`review-body-${row.id}`} selectable style={s.text}>{row.body}</Text> : null}
  </View>;
}
const s = StyleSheet.create({
  card: { padding: spacing.md, marginBottom: spacing.md, borderRadius: radius.card, backgroundColor: colors.card, gap: spacing.sm },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '600' }, text: { color: colors.textPrimary, lineHeight: 24, fontSize: 15 },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 20 }, link: { color: colors.purpleDark, fontSize: 14 },
  record: { gap: spacing.sm, paddingVertical: spacing.sm }, search: { padding: 10, backgroundColor: colors.background, borderRadius: radius.widget, color: colors.textPrimary },
});
