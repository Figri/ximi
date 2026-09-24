import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { SIDEBAR_ITEMS, SIDEBAR_TO_TIMELINE_CATEGORY, type SidebarKey } from '../../components/record/CategoryConfig';
import { TodayView } from '../../components/record/TodayView';
import { CategoryTimelineView } from '../../components/record/CategoryTimelineView';
import { WorriesView } from '../../components/record/WorriesView';
import { CollectionsView } from '../../components/record/CollectionsView';
import { ProjectsView } from '../../components/record/ProjectsView';
import { AddTimelineModal } from '../../components/record/AddTimelineModal';
import { AddWorryModal } from '../../components/record/AddWorryModal';
import { AddCollectionModal } from '../../components/record/AddCollectionModal';
import { AddProjectModal } from '../../components/record/AddProjectModal';

export default function RecordScreen() {
  const [selected, setSelected] = useState<SidebarKey>('今日');
  const [addOpen, setAddOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function bumpRefresh() {
    setRefreshKey((k) => k + 1);
    setAddOpen(false);
  }

  const timelineCategory = SIDEBAR_TO_TIMELINE_CATEGORY[selected];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Pressable style={styles.backRow} onPress={() => router.push('/')}>
        <Text style={styles.backText}>‹ 打卡</Text>
      </Pressable>
      <View style={styles.body}>
        <View style={styles.sidebarWrap}>
          <ScrollView style={styles.sidebar} contentContainerStyle={styles.sidebarContent} showsVerticalScrollIndicator={false}>
            {SIDEBAR_ITEMS.map((item) => (
              <Pressable
                key={item.key}
                style={[styles.sidebarItem, selected === item.key && styles.sidebarItemActive]}
                onPress={() => setSelected(item.key)}
              >
                <Text style={styles.sidebarEmoji}>{item.emoji}</Text>
                <Text style={styles.sidebarLabel}>{item.key}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          {selected === '今日' && <TodayView refreshKey={refreshKey} />}
          {selected === '烦恼' && <WorriesView refreshKey={refreshKey} />}
          {selected === '收藏' && <CollectionsView refreshKey={refreshKey} />}
          {selected === '项目' && <ProjectsView refreshKey={refreshKey} />}
          {timelineCategory && <CategoryTimelineView category={timelineCategory} refreshKey={refreshKey} />}
        </ScrollView>

        <Pressable style={styles.fab} onPress={() => setAddOpen(true)}>
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      </View>

      {selected === '烦恼' ? (
        <AddWorryModal visible={addOpen} onClose={() => setAddOpen(false)} onAdded={bumpRefresh} />
      ) : selected === '收藏' ? (
        <AddCollectionModal visible={addOpen} onClose={() => setAddOpen(false)} onAdded={bumpRefresh} />
      ) : selected === '项目' ? (
        <AddProjectModal visible={addOpen} onClose={() => setAddOpen(false)} onAdded={bumpRefresh} />
      ) : (
        <AddTimelineModal
          visible={addOpen}
          defaultCategory={timelineCategory ?? 'other'}
          onClose={() => setAddOpen(false)}
          onAdded={bumpRefresh}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  backRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  backText: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '600' },
  body: { flex: 1, flexDirection: 'row' },
  sidebarWrap: { width: 64 },
  sidebar: { flex: 1 },
  sidebarContent: { paddingTop: spacing.sm, paddingBottom: spacing.xl },
  sidebarItem: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  sidebarItemActive: { backgroundColor: colors.purpleLight, borderRadius: radius.widget },
  sidebarEmoji: { fontSize: 18, lineHeight: 22, includeFontPadding: false },
  sidebarLabel: {
    fontSize: fontSize.tiny,
    lineHeight: fontSize.tiny + 2,
    color: colors.textSecondary,
    marginTop: 2,
    includeFontPadding: false,
  },
  content: {
    flex: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
  },
  contentInner: { padding: spacing.lg, paddingBottom: spacing.xl * 3 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: radius.avatar,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 26, fontWeight: '300', marginTop: -2 },
});
