import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { WeekDateStrip } from '../../components/timetab/WeekDateStrip';
import { MonthCalendarView } from '../../components/timetab/MonthCalendarView';
import { TodoListView } from '../../components/todotab/TodoListView';
import { TodoFormModal } from '../../components/todotab/TodoFormModal';
import { useTodoStore } from '../../lib/todoStore';
import {
  fetchCompletionsForRange,
  fetchItemCountsForRange,
  fetchItemsForDate,
  fetchItemsForDateRange,
  setItemDone,
  toDateKey,
  updateItem,
} from '../../lib/todo';
import type { TodoCategory, TodoCompletion, TodoItem } from '../../types';

type ViewMode = 'day' | 'week' | 'month';

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7; // 0=周一
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatGroupHeader(date: Date): string {
  const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 周${WEEKDAY[date.getDay()]}`;
}

export default function TodoScreen() {
  const { categories, fetchAll } = useTodoStore();
  const [mode, setMode] = useState<ViewMode>('day');
  const [date, setDate] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null); // null = 全部

  const [dayItems, setDayItems] = useState<TodoItem[]>([]);
  const [rangeItemsByDate, setRangeItemsByDate] = useState<Record<string, TodoItem[]>>({});
  const [rangeCompletions, setRangeCompletions] = useState<TodoCompletion[]>([]);
  const [monthDots, setMonthDots] = useState<Record<string, boolean>>({});

  const [editingItem, setEditingItem] = useState<TodoItem | null>(null);
  const [creating, setCreating] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const groupRefs = useRef<Record<string, View | null>>({});
  const scrollOffsetRef = useRef(0);

  useEffect(() => {
    fetchAll();
  }, []);

  const categoryById: Record<string, TodoCategory> = {};
  for (const c of categories) categoryById[c.id] = c;
  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  const weekDays = useMemo(() => {
    const start = startOfWeek(date);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [date]);

  const monthDays = useMemo(() => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
  }, [date.getFullYear(), date.getMonth()]);

  useEffect(() => {
    if (mode === 'day') {
      fetchItemsForDate(date).then(setDayItems);
      fetchCompletionsForRange([date]).then(setRangeCompletions);
    } else if (mode === 'week') {
      fetchItemsForDateRange(weekDays).then(setRangeItemsByDate);
      fetchCompletionsForRange(weekDays).then(setRangeCompletions);
    } else {
      fetchItemsForDateRange(monthDays).then((byDate) => {
        setRangeItemsByDate(byDate);
        const dots: Record<string, boolean> = {};
        for (const [key, items] of Object.entries(byDate)) dots[key] = items.length > 0;
        setMonthDots(dots);
      });
      fetchCompletionsForRange(monthDays).then(setRangeCompletions);
    }
  }, [mode, date.getTime(), refreshKey]);

  function bumpRefresh() {
    setRefreshKey((k) => k + 1);
  }

  function filterByCategory(items: TodoItem[]): TodoItem[] {
    if (!categoryFilter) return items;
    return items.filter((item) => item.category_id === categoryFilter);
  }

  function handleModalSaved() {
    setEditingItem(null);
    setCreating(false);
    bumpRefresh();
  }
  function handleModalDeleted() {
    setEditingItem(null);
    bumpRefresh();
  }

  async function handleToggleDone(item: TodoItem, done: boolean, dateKey: string) {
    await setItemDone(item, dateKey, done);
    bumpRefresh();
  }

  async function handleToggleImportant(item: TodoItem) {
    await updateItem(item.id, { important: !item.important });
    bumpRefresh();
  }

  function handleSelectMonthDate(d: Date) {
    setDate(d);
    const key = toDateKey(d);
    requestAnimationFrame(() => {
      const node = groupRefs.current[key];
      const scroller = scrollRef.current;
      if (!node || !scroller) return;
      // findNodeHandle+measureLayout在react-native-web上直接抛"not supported"，
      // 点哪天列表定位滚动这个功能会静默失效。改用.measure()分别测出目标组和
      // 滚动容器各自的屏幕绝对坐标，用两者差值+当前已滚动的距离算出目标scrollY——
      // .measure()是两端都支持的标准API，不依赖web不认的node handle
      // @ts-ignore ScrollView的ref在类型定义里没有暴露measure，但运行时实际存在
      scroller.measure((_sx: number, _sy: number, _sw: number, _sh: number, _spx: number, scrollerPageY: number) => {
        // @ts-ignore View实例的measure同理
        node.measure((_nx: number, _ny: number, _nw: number, _nh: number, _npx: number, nodePageY: number) => {
          const delta = nodePageY - scrollerPageY;
          const targetY = Math.max(0, scrollOffsetRef.current + delta - 8);
          scroller.scrollTo({ y: targetY, animated: true });
        });
      });
    });
  }

  function renderGroupedList(dates: Date[]) {
    const groups = dates
      .map((d) => ({ date: d, key: toDateKey(d), items: filterByCategory(rangeItemsByDate[toDateKey(d)] ?? []) }))
      .filter((g) => g.items.length > 0);

    if (groups.length === 0) {
      return <Text style={styles.empty}>这段时间还没有事项</Text>;
    }

    return groups.map((g) => (
      <View
        key={g.key}
        ref={(ref) => {
          groupRefs.current[g.key] = ref;
        }}
        style={styles.dateGroup}
      >
        <Text style={styles.dateGroupHeader}>{formatGroupHeader(g.date)}</Text>
        <TodoListView
          items={g.items}
          dateKey={g.key}
          categoryById={categoryById}
          completions={rangeCompletions}
          onToggleDone={(item, done) => handleToggleDone(item, done, g.key)}
          onToggleImportant={handleToggleImportant}
          onPressItem={setEditingItem}
        />
      </View>
    ));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>事项</Text>
        <View style={styles.headerIcons}>
          <Pressable style={styles.textButton} onPress={() => router.push('/todo-categories')}>
            <Text style={styles.textButtonLabel}>分类</Text>
          </Pressable>
          {(['day', 'week', 'month'] as ViewMode[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.textButton, mode === m && styles.textButtonActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.textButtonLabel, mode === m && styles.textButtonLabelActive]}>
                {m === 'day' ? '日' : m === 'week' ? '周' : '月'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {(mode === 'day' || mode === 'week') && (
        <WeekDateStrip date={date} onDateChange={setDate} refreshKey={refreshKey} fetchCounts={fetchItemCountsForRange} />
      )}

      <ScrollView
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <Pressable
          style={[styles.filterChip, categoryFilter !== null && styles.filterChipInactive]}
          onPress={() => setCategoryFilter(null)}
        >
          <Text style={[styles.filterChipText, categoryFilter === null && styles.filterChipTextActive]}>全部</Text>
        </Pressable>
        {sortedCategories.map((c) => (
          <Pressable
            key={c.id}
            style={[styles.filterChip, categoryFilter === c.id ? { backgroundColor: c.color } : styles.filterChipInactive]}
            onPress={() => setCategoryFilter(categoryFilter === c.id ? null : c.id)}
          >
            <Text style={[styles.filterChipText, categoryFilter === c.id && styles.filterChipTextActive]}>{c.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        {mode === 'day' && (
          <TodoListView
            items={filterByCategory(dayItems)}
            dateKey={toDateKey(date)}
            categoryById={categoryById}
            completions={rangeCompletions}
            onToggleDone={(item, done) => handleToggleDone(item, done, toDateKey(date))}
            onToggleImportant={handleToggleImportant}
            onPressItem={setEditingItem}
          />
        )}
        {mode === 'week' && renderGroupedList(weekDays)}
        {mode === 'month' && (
          <>
            <MonthCalendarView month={date} onMonthChange={setDate} onSelectDate={handleSelectMonthDate} cellDots={monthDots} />
            {renderGroupedList(monthDays)}
          </>
        )}
      </ScrollView>

      <Pressable
        style={styles.addFab}
        onPress={() => {
          setEditingItem(null);
          setCreating(true);
        }}
      >
        <Text style={styles.addFabText}>＋</Text>
      </Pressable>

      <TodoFormModal
        visible={creating || !!editingItem}
        item={editingItem}
        initialDate={mode === 'day' ? date : undefined}
        onClose={() => {
          setEditingItem(null);
          setCreating(false);
        }}
        onSaved={handleModalSaved}
        onDeleted={handleModalDeleted}
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
    paddingBottom: spacing.xs,
  },
  pageTitle: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  textButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.button,
    backgroundColor: colors.purpleLight,
  },
  textButtonActive: { backgroundColor: colors.purpleDark },
  textButtonLabel: { fontSize: fontSize.tiny, color: colors.purpleDark, fontWeight: '600' },
  textButtonLabelActive: { color: '#fff' },

  // 横向ScrollView不给外层一个明确高度的话，react-native-web会让它默认
  // flex撑满剩余空间(不是hug内容高度)，内容再被居中，导致整块区域出现
  // 一大截空白——这个坑CatRow.tsx早就踩过并修过，这里照抄同样的做法
  filterScroll: { height: 40, flexGrow: 0 },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: 6, paddingVertical: 6 },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.button, backgroundColor: colors.purpleDark },
  filterChipInactive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.textMuted },
  filterChipText: { fontSize: fontSize.tiny, color: colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },
  dateGroup: { marginBottom: spacing.md },
  dateGroupHeader: { fontSize: fontSize.secondary, color: colors.textMuted, fontWeight: '600', marginBottom: 6 },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, marginTop: spacing.xl },

  addFab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  addFabText: { color: '#fff', fontSize: 22 },
});
