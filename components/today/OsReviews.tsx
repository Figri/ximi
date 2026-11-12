import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RecordEditModal } from '../common/RecordEditModal';
import { db } from '../../lib/localdb';
import { useDataBus } from '../../lib/dataBus';
import { colors, fontSize, lh, radius, spacing } from '../../constants/theme';

export function OsReviews({ date }: { date: string }) {
  const version = useDataBus((s) => s.version);
  const [editing, setEditing] = useState<any>(null);
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
    {!rows.length ? <Text style={s.note}>暂无复盘</Text> : null}
    {rows.slice(0, (page + 1) * 10).map((r) => <Review key={r.id} row={r} onEdit={() => setEditing(r)} />)}
    {rows.length > (page + 1) * 10 ? <Pressable onPress={() => setPage((n) => n + 1)}><Text style={s.link}>继续查看</Text></Pressable> : null}
    <RecordEditModal visible={!!editing} title="编辑复盘" heading={editing?.title ?? ''} text={editing?.body ?? ''}
      onClose={() => setEditing(null)}
      onSave={async (body, title) => {
        const { error } = await db.from('os_reviews').update({ body, title, updated_at: new Date().toISOString() }).eq('id', editing.id);
        if (error) throw new Error(error.message);
        useDataBus.getState().bump();
      }}
      onDelete={async () => {
        const { error } = await db.from('os_reviews').delete().eq('id', editing.id);
        if (error) throw new Error(error.message);
        useDataBus.getState().bump();
      }}
    />
  </View>;
}
function Review({ row, onEdit }: { row: any; onEdit: () => void }) {
  const [open, setOpen] = useState(true);
  return <Pressable style={s.record} onLongPress={onEdit} delayLongPress={400} testID={`review-${row.id}`}>
    <Pressable onLongPress={onEdit} delayLongPress={400} onPress={() => setOpen((v) => !v)}><Text style={s.link}>{row.title || '复盘'} · {row.category || '记录'} {open ? '⌃' : '⌄'}</Text></Pressable>
    {open ? <Pressable onLongPress={onEdit} delayLongPress={400}><Text testID={`review-body-${row.id}`} style={s.text}>{row.body}</Text></Pressable> : null}
  </Pressable>;
}
const s = StyleSheet.create({
  card: { padding: spacing.lg, marginBottom: 0, borderRadius: radius.card, backgroundColor: colors.card, gap: spacing.md },
  title: { color: colors.textPrimary, fontSize: fontSize.cardName, fontWeight: '600' }, text: { color: colors.textPrimary, lineHeight: lh(24), fontSize: fontSize.reading },
  note: { color: colors.textMuted, fontSize: fontSize.secondary, lineHeight: 20 }, link: { color: colors.purpleDark, fontSize: fontSize.body },
  record: { gap: spacing.sm, paddingVertical: spacing.sm }, search: { padding: 12, fontSize: fontSize.body, backgroundColor: colors.background, borderRadius: radius.widget, color: colors.textPrimary },
});
