import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, TextInput, View, ScrollView, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
export function Editor({ visible, title, value, onClose, onSave, onDelete, children }: {
    visible: boolean;
    title: string;
    value: string;
    onClose: () => void;
    onSave: (text: string) => Promise<void> | void;
    onDelete?: () => Promise<void> | void;children?:ReactNode;
}) { const [text, setText] = useState(value), [busy, setBusy] = useState(false), [error, setError] = useState(''); useEffect(() => { setText(value); setError(''); }, [value, visible]); const run = async (fn: () => Promise<void> | void) => { setBusy(true); try {
    await fn();
    onClose();
}
catch (e) {
    setError(String(e instanceof Error ? e.message : e));
}
finally {
    setBusy(false);
} }; return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><KeyboardAvoidingView behavior="padding" style={e.backdrop}><View style={e.sheet}><Text style={e.title}>{title}</Text><TextInput testID="ling-editor-text" multiline value={text} onChangeText={setText} style={e.input} textAlignVertical="top"/>{children}<Text style={e.error}>{error}</Text><View style={e.row}>{onDelete ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => run(onDelete)} testID="ling-editor-delete"><Text style={e.danger}>删除</Text></Pressable> : null}<View style={{ flex: 1 }}/><Pressable disabled={busy} onPress={onClose}><Text style={e.secondary}>取消</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => run(() => onSave(text))} testID="ling-editor-save"><Text style={e.primary}>{busy ? '保存中…' : '保存'}</Text></Pressable></View></View></KeyboardAvoidingView></Modal>; }
export const e = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: 20 }, sheet: { backgroundColor: colors.card, borderRadius: 20, padding: 20, gap: 12, maxHeight: '85%' }, title: { fontSize: fontSize.cardName, fontWeight: '600', color: colors.textPrimary }, input: { fontSize: fontSize.body, lineHeight: 24, color: colors.textPrimary, minHeight: 130, maxHeight: 350, borderRadius: 12, padding: 12, backgroundColor: colors.background }, row: { flexDirection: 'row', alignItems: 'center', gap: 24, paddingVertical: 8 }, primary: { color: colors.purpleDark, fontWeight: '600', fontSize: fontSize.body }, secondary: { color: colors.textSecondary, fontSize: fontSize.body }, danger: { color: colors.redDark, fontSize: fontSize.body }, error: { color: colors.redDark, fontSize: fontSize.secondary } });
export function Reader({visible,title,text,onClose,onRestore,children}:{visible:boolean;title:string;text:string;onClose:()=>void;onRestore?:()=>Promise<void>;children?:ReactNode}){return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><View style={{flex:1,backgroundColor:colors.background,paddingTop:40}}><View style={[e.row,{paddingHorizontal:20}]}><Pressable onPress={onClose}><Text style={e.primary}>返回</Text></Pressable><Text style={[e.title,{flex:1}]} numberOfLines={1}>{title}</Text>{onRestore?<Pressable onPress={async()=>{await onRestore();onClose();}}><Text style={e.primary}>采用此版</Text></Pressable>:null}</View><ScrollView contentContainerStyle={{padding:20,paddingBottom:60}}><Text selectable style={{fontSize:fontSize.body,lineHeight:25,color:colors.textPrimary}}>{text}</Text>{children}</ScrollView></View></Modal>;}
