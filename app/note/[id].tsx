import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { deleteNote, fetchNote, updateNote } from '../../lib/notes';
import { pickImage, uploadChatImage } from '../../lib/chatImages';
import type { Note } from '../../types';

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchNote(id).then((n) => {
      if (n) {
        setNote(n);
        setTitle(n.title);
        setContent(n.content);
        setSavedAt(n.updated_at);
      }
      setLoading(false);
    });
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [id]);

  const scheduleSave = useCallback(
    (nextTitle: string, nextContent: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await updateNote(id, { title: nextTitle.trim() || '无标题', content: nextContent });
        setSavedAt(new Date().toISOString());
      }, 600);
    },
    [id]
  );

  function handleTitleChange(text: string) {
    setTitle(text);
    scheduleSave(text, content);
  }

  function handleContentChange(text: string) {
    setContent(text);
    scheduleSave(title, text);
  }

  async function handleInsertImage(source: 'camera' | 'library') {
    const uri = await pickImage(source);
    if (!uri) return;
    setUploading(true);
    try {
      const url = await uploadChatImage(uri);
      const next = content ? `${content}\n![图片](${url})\n` : `![图片](${url})\n`;
      setContent(next);
      scheduleSave(title, next);
    } catch (err) {
      Alert.alert('插入图片失败', err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function handleDelete() {
    Alert.alert('删除这条笔记？', title, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteNote(id);
          router.back();
        },
      },
    ]);
  }

  async function handleBack() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      await updateNote(id, { title: title.trim() || '无标题', content });
    }
    router.back();
  }

  if (loading || !note) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>加载中…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleBack}>
            <Text style={styles.backText}>‹ 返回</Text>
          </Pressable>
          <Text style={styles.savedText}>{savedAt ? `已保存 · ${formatUpdated(savedAt)}` : ''}</Text>
          <Pressable onPress={handleDelete}>
            <Text style={styles.deleteText}>删除</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={handleTitleChange}
          placeholder="标题"
          placeholderTextColor={colors.textMuted}
        />

        <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentInner}>
          <TextInput
            style={styles.contentInput}
            value={content}
            onChangeText={handleContentChange}
            placeholder="写点什么…"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>

        <View style={styles.toolbar}>
          {uploading ? (
            <ActivityIndicator color={colors.purpleDark} />
          ) : (
            <>
              <Pressable style={styles.toolButton} onPress={() => handleInsertImage('library')}>
                <Text style={styles.toolButtonText}>🖼 插入图片</Text>
              </Pressable>
              <Pressable style={styles.toolButton} onPress={() => handleInsertImage('camera')}>
                <Text style={styles.toolButtonText}>📷 拍照插入</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { textAlign: 'center', marginTop: spacing.xl, color: colors.textMuted },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  backText: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '600' },
  savedText: { fontSize: fontSize.tiny, color: colors.textMuted },
  deleteText: { fontSize: fontSize.body, color: colors.redDark },
  titleInput: {
    fontSize: fontSize.pageTitle,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  contentScroll: { flex: 1 },
  contentInner: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  contentInput: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 22, minHeight: 200 },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
  },
  toolButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: colors.background,
  },
  toolButtonText: { fontSize: fontSize.secondary, color: colors.textSecondary },
});
