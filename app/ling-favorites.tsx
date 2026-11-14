import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View, Linking, Clipboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { favorites, put, toggleReply, type Favorite } from '../lib/ling/repository';
import { useCompanionEvents } from '../lib/ling/events';
import { LingLockGate } from '../components/ling/LingLockGate';
import { Editor } from '../components/ling/Editor';
import { s } from './ling-settings';
export default function Screen() { return <LingLockGate><Favorites /></LingLockGate>; }
function Favorites() {
    const [items, setItems] = useState<Favorite[]>([]), [query, setQuery] = useState(''), [selected, setSelected] = useState<Favorite | null>(null), [editing, setEditing] = useState<Favorite | null>(null);
    const version = useCompanionEvents(v => v.version);
    useEffect(() => { favorites().then(setItems); }, [version]);
    return <SafeAreaView style={s.page} edges={['top', 'bottom']}><View style={s.header}><Pressable onPress={() => router.back()}><Text style={s.link}>‹ 返回</Text></Pressable><Text style={s.title}>收藏</Text><View /></View><ScrollView contentContainerStyle={s.body}><TextInput testID="ling-favorites-search" style={s.single} placeholder="搜索标题或原文" value={query} onChangeText={setQuery}/>{items.filter(f => (f.title + f.text).includes(query)).map(f => <Pressable key={f.id} style={s.card} onPress={() => setSelected(f)} onLongPress={() => setEditing(f)} testID={`favorite-card-${f.id}`}><Text style={s.label}>{f.title}</Text><Text style={s.secondary}>{f.type === 'letter' ? '信' : f.type === 'script' ? '剧本' : '片段'} · {f.created_at.slice(0, 10)}</Text><Text style={s.text} numberOfLines={4}>{f.text}</Text></Pressable>)}{!items.length ? <Text style={s.secondary}>收藏的完整回复会保存在这里。</Text> : null}</ScrollView>
 <Editor visible={!!editing} title="编辑收藏标题" value={editing?.title ?? ''} onClose={() => setEditing(null)} onSave={async (title) => { if (editing)
        await put('ling_favorites', { ...editing, title }); }} onDelete={editing ? async () => { const {readTable}=await import('../lib/localdb');const m=(await readTable('ling_messages')).find(r=>editing.message_ids.includes(r.id));if(m?.favorite)await toggleReply(m.id,'favorite');else await put('ling_favorites', { ...editing, favorite:false,deleted: true }); } : undefined}/>
 <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}><SafeAreaView style={s.page}><View style={s.header}><Pressable onPress={() => setSelected(null)}><Text style={s.link}>返回</Text></Pressable><Pressable testID="ling-favorite-copy" onPress={() => Clipboard.setString(selected?.text ?? '')}><Text style={s.link}>复制全文</Text></Pressable></View><ScrollView contentContainerStyle={s.body}><Text style={s.title}>{selected?.title}</Text><Text selectable testID="ling-favorite-fulltext" style={s.text}>{selected?.text}</Text>{selected?.notion_url ? <Pressable onPress={() => Linking.openURL(selected.notion_url!)}><Text style={s.link}>Notion原文</Text></Pressable> : null}<Text style={s.secondary}>来源：{selected?.message_ids.join('、')}</Text><Text style={s.label}>内容类型</Text><View style={s.wrap}>{(['chat', 'letter', 'script'] as const).map((type, i) => <Pressable key={type} style={s.chip} onPress={async () => { if (!selected)
        return; await put('ling_favorites', { ...selected, type }); const { readTable } = await import('../lib/localdb'); const src = (await readTable('ling_sources')).find(r => r.id === selected.source_id); if (src)
        await put('ling_sources', { ...src, type }); setSelected({ ...selected, type }); }}><Text style={s.link}>{['片段', '信', '剧本'][i]}{selected?.type === type ? ' ✓' : ''}</Text></Pressable>)}</View></ScrollView></SafeAreaView></Modal>
 </SafeAreaView>;
}
