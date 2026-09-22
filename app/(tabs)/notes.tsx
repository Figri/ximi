import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { PromptModal } from '../../components/PromptModal';
import {
  createFolder,
  createNote,
  deleteFolder,
  fetchFolders,
  fetchNotesInFolder,
  renameFolder,
  searchNotes,
} from '../../lib/notes';
import type { Folder, Note } from '../../types';

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export default function NotesScreen() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Note[] | null>(null);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<Folder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const allFolders = await fetchFolders();
      setFolders(allFolders);
      const notesHere = await fetchNotesInFolder(currentFolder?.id ?? null);
      setNotes(notesHere);
    } finally {
      setLoading(false);
    }
  }, [currentFolder]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      searchNotes(q).then(setSearchResults);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const subFolders = currentFolder
    ? folders.filter((f) => f.parent_id === currentFolder.id)
    : folders.filter((f) => !f.parent_id);

  async function handleQuickNewNote() {
    const note = await createNote(currentFolder?.id ?? null);
    router.push(`/note/${note.id}`);
  }

  async function handleCreateFolder(name: string) {
    setNewFolderOpen(false);
    await createFolder(name);
    load();
  }

  async function handleRenameFolder(name: string) {
    if (!renameFolderTarget) return;
    await renameFolder(renameFolderTarget.id, name);
    setRenameFolderTarget(null);
    load();
  }

  function handleFolderLongPress(folder: Folder) {
    Alert.alert(folder.name, undefined, [
      { text: '取消', style: 'cancel' },
      { text: '重命名', onPress: () => setRenameFolderTarget(folder) },
      {
        text: '删除（连里面的笔记一起删）',
        style: 'destructive',
        onPress: async () => {
          await deleteFolder(folder.id);
          load();
        },
      },
    ]);
  }

  const displayNotes = searchResults ?? notes;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        {currentFolder ? (
          <Pressable onPress={() => setCurrentFolder(null)} style={styles.backButton}>
            <Text style={styles.backText}>‹ 笔记</Text>
          </Pressable>
        ) : (
          <Text style={styles.pageTitle}>笔记</Text>
        )}
        <Pressable
          style={styles.addButton}
          onPress={currentFolder ? handleQuickNewNote : () => setNewFolderOpen(true)}
        >
          <Text style={styles.addButtonText}>＋</Text>
        </Pressable>
      </View>

      {currentFolder && <Text style={styles.folderTitle}>📁 {currentFolder.name}</Text>}

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="搜索笔记标题或内容"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />
      ) : (
        <FlatList
          data={searchResults ? [] : subFolders}
          keyExtractor={(f) => f.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            searchResults ? (
              <Text style={styles.sectionLabel}>搜索结果（{searchResults.length}）</Text>
            ) : subFolders.length > 0 ? (
              <Text style={styles.sectionLabel}>文件夹</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => setCurrentFolder(item)}
              onLongPress={() => handleFolderLongPress(item)}
            >
              <Text style={styles.rowEmoji}>📁</Text>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
            </Pressable>
          )}
          ListFooterComponent={
            <>
              {!searchResults && displayNotes.length > 0 && <Text style={styles.sectionLabel}>笔记</Text>}
              {displayNotes.map((note) => (
                <Pressable key={note.id} style={styles.row} onPress={() => router.push(`/note/${note.id}`)}>
                  <Text style={styles.rowEmoji}>📄</Text>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {note.title}
                  </Text>
                  <Text style={styles.rowMeta}>{formatUpdated(note.updated_at)}</Text>
                </Pressable>
              ))}
              {!searchResults && subFolders.length === 0 && displayNotes.length === 0 && (
                <Text style={styles.empty}>
                  {currentFolder ? '这个文件夹还没有笔记，点右上角＋加一条' : '还没有文件夹，点右上角＋建一个'}
                </Text>
              )}
              {searchResults && searchResults.length === 0 && <Text style={styles.empty}>没找到相关笔记</Text>}
            </>
          }
        />
      )}

      <PromptModal
        visible={newFolderOpen}
        title="新建文件夹"
        placeholder="比如：学习"
        onCancel={() => setNewFolderOpen(false)}
        onSubmit={handleCreateFolder}
      />
      <PromptModal
        visible={!!renameFolderTarget}
        title="重命名文件夹"
        initialValue={renameFolderTarget?.name ?? ''}
        onCancel={() => setRenameFolderTarget(null)}
        onSubmit={handleRenameFolder}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  pageTitle: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  backButton: { paddingVertical: 4 },
  backText: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: radius.avatar,
    backgroundColor: colors.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: colors.purpleDark, fontSize: 18, fontWeight: '600', marginTop: -2 },
  folderTitle: { fontSize: fontSize.body, color: colors.textSecondary, paddingHorizontal: spacing.lg, marginTop: 2 },
  searchRow: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl * 3 },
  sectionLabel: { fontSize: fontSize.secondary, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  rowEmoji: { fontSize: 18 },
  rowTitle: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary },
  rowMeta: { fontSize: fontSize.tiny, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, marginTop: spacing.xl },
});
