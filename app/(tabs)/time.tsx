import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fixedFontSize as fontSize, radius, spacing } from '../../constants/theme';
// 布局卡死的地方：字号不跟着「其他 → 字号」放大（fixedFontSize）
import { WeekDateStrip } from '../../components/timetab/WeekDateStrip';
import { TimeBlockView } from '../../components/timetab/TimeBlockView';
import { TimeAxisView } from '../../components/timetab/TimeAxisView';
import { MonthCalendarView } from '../../components/timetab/MonthCalendarView';
import { StatsView } from '../../components/timetab/StatsView';
import { PointsStatsView } from '../../components/timetab/PointsStatsView';
import { fetchLogCountsForRange, fetchMonthStats } from '../../lib/timelog';
import { fetchMonthSummaries } from '../../lib/timeline';
import { fetchTodayPoints } from '../../lib/points';
import { formatPoints } from '../../lib/pointsCalc';
import { useDataBus } from '../../lib/dataBus';
import { usePushedPage } from '../../components/common/PageTitle';

type ViewMode = 'day' | 'month' | 'stats' | 'points';
type DayView = 'block' | 'axis'; // block=时间块, axis=时间轴

const SUB_TITLES: Record<Exclude<ViewMode, 'day'>, string> = { points: '积分统计', stats: '时间统计', month: '月历' };

export default function TimelineScreen() {
  const pushed = usePushedPage();
  const [mode, setMode] = useState<ViewMode>('day');
  const [dayView, setDayView] = useState<DayView>('block');
  const [date, setDate] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  // 顶栏下沿离页面顶有多远（含状态栏留白）：菜单从这儿往下展开
  const [headerBottom, setHeaderBottom] = useState(0);
  const [todayPoints, setTodayPoints] = useState<number | null>(null);

  // 月历格子的底色/摘要——MonthCalendarView本身不跟任何数据源绑死，
  // 数据在这个页面自己算好再传下去
  const [monthColors, setMonthColors] = useState<Record<string, string>>({});
  const [monthSummaries, setMonthSummaries] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mode !== 'month') return;
    fetchMonthSummaries(date.getFullYear(), date.getMonth()).then(setMonthSummaries);
    fetchMonthStats(date.getFullYear(), date.getMonth()).then((stats) => {
      const colorsByDay: Record<string, string> = {};
      for (const [day, v] of Object.entries(stats)) colorsByDay[day] = v.color + '38';
      setMonthColors(colorsByDay);
    });
  }, [mode, date.getFullYear(), date.getMonth(), refreshKey]);

  function bumpRefresh() {
    setRefreshKey((k) => k + 1);
  }

  // ＋ 里记了时间块、今天页结束了娱乐出口：这边跟着刷新
  const dataVersion = useDataBus((s) => s.version);
  useEffect(() => {
    if (dataVersion) bumpRefresh();
  }, [dataVersion]);

  // 顶上「今日 +N」：改了记录、切回这一页（可能过了早上 5 点换了一天）都重算
  useEffect(() => {
    fetchTodayPoints().then(setTodayPoints).catch(() => {});
  }, [refreshKey]);

  // 离开这一页时菜单收起；在积分统计、时间统计、月历里按安卓返回键回到格子，不直接离开时间页。
  // 返回键里读的是 ref：这个监听只在进出这一页时挂上、拿掉，菜单开关不会让它重挂（重挂时的清理会把刚打开的菜单又关掉）
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useFocusEffect(
    useCallback(() => {
      fetchTodayPoints().then(setTodayPoints).catch(() => {});
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (menuOpenRef.current) {
          setMenuOpen(false);
          return true;
        }
        if (modeRef.current !== 'day') {
          setMode('day');
          return true;
        }
        return false;
      });
      return () => {
        sub.remove();
        setMenuOpen(false);
      };
    }, [])
  );

  function openSub(next: ViewMode) {
    setMenuOpen(false);
    setMode(next);
  }

  function openPage(path: '/timelog-categories' | '/timelog-tags') {
    setMenuOpen(false);
    router.push(path);
  }

  const chipColor = todayPoints == null || todayPoints === 0 ? colors.textMuted : todayPoints > 0 ? colors.greenDark : colors.redDark;
  const chipBg = todayPoints == null || todayPoints === 0 ? colors.purpleLight : todayPoints > 0 ? '#E3F2E8' : '#F6E3E3';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow} onLayout={(e: LayoutChangeEvent) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
        {mode === 'day' ? (
          <>
            {/* 左边：日期 + 今；右边：今日积分 + ⋯（分类、标签、月历、统计都收进 ⋯） */}
            <View style={styles.dateBox}>
              {pushed ? (
                <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10}>
                  <Text style={styles.back}>‹</Text>
                </Pressable>
              ) : null}
              <Text style={styles.dateText}>{`${date.getMonth() + 1}月${date.getDate()}日`}</Text>
              <Pressable style={styles.todayButton} onPress={() => setDate(new Date())} hitSlop={6} testID="time-today">
                <Text style={styles.todayButtonText}>今</Text>
              </Pressable>
            </View>
            <View style={styles.headerIcons}>
              <Pressable style={[styles.pointsChip, { backgroundColor: chipBg }]} onPress={() => openSub('points')} hitSlop={4} testID="time-points-chip">
                <Text style={[styles.pointsChipText, { color: chipColor }]}>今日 {formatPoints(todayPoints ?? 0)}</Text>
              </Pressable>
              <Pressable style={styles.moreButton} onPress={() => setMenuOpen((v) => !v)} hitSlop={6} testID="time-more">
                <Text style={styles.moreButtonText}>⋯</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.subHeader}>
            <Pressable onPress={() => setMode('day')} hitSlop={10} testID="time-sub-back">
              <Text style={styles.backText}>‹ 返回</Text>
            </Pressable>
            <Text style={styles.subTitle}>{SUB_TITLES[mode]}</Text>
          </View>
        )}
      </View>

      {mode === 'day' && (
        <WeekDateStrip date={date} onDateChange={setDate} refreshKey={refreshKey} fetchCounts={fetchLogCountsForRange} hideDateRow />
      )}

      {mode === 'day' &&
        (dayView === 'block' ? (
          <TimeBlockView date={date} refreshKey={refreshKey} onChanged={bumpRefresh} />
        ) : (
          <TimeAxisView date={date} refreshKey={refreshKey} onChanged={bumpRefresh} />
        ))}
      {mode === 'month' && (
        <MonthCalendarView
          month={date}
          onMonthChange={setDate}
          onSelectDate={(d) => {
            setDate(d);
            setMode('day');
          }}
          cellBackgroundColors={monthColors}
          cellExtraText={monthSummaries}
        />
      )}
      {mode === 'stats' && <StatsView />}
      {mode === 'points' && <PointsStatsView refreshKey={refreshKey} onChanged={bumpRefresh} />}

      {mode === 'day' && (
        <Pressable style={styles.viewToggleFab} onPress={() => setDayView((v) => (v === 'block' ? 'axis' : 'block'))} testID="time-view-toggle">
          <Text style={styles.viewToggleFabText}>{dayView === 'block' ? '☰' : '田'}</Text>
        </Pressable>
      )}

      {/* ⋯ 的小菜单：点外面就收起 */}
      {menuOpen ? (
        <View style={styles.menuLayer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} testID="time-menu-backdrop" />
          <View style={[styles.menu, { top: headerBottom + 2 }]}>
            {(
              [
                ['🏅', '积分统计', () => openSub('points'), 'menu-points'],
                ['📊', '时间统计', () => openSub('stats'), 'menu-stats'],
                ['📅', '月历', () => openSub('month'), 'menu-month'],
                ['🗂️', '分类管理', () => openPage('/timelog-categories'), 'menu-categories'],
                ['🏷️', '标签管理', () => openPage('/timelog-tags'), 'menu-tags'],
              ] as const
            ).map(([icon, label, onPress, id]) => (
              <Pressable key={id} style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={onPress} testID={id}>
                <Text style={styles.menuIcon}>{icon}</Text>
                <Text style={styles.menuText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
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
    minHeight: 44,
  },
  dateBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { fontSize: 26, lineHeight: 28, color: colors.purpleDark, marginTop: -2, marginRight: 2 },
  dateText: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  todayButton: { width: 26, height: 26, borderRadius: radius.avatar, backgroundColor: colors.blueLight, alignItems: 'center', justifyContent: 'center' },
  todayButtonText: { fontSize: fontSize.secondary, color: colors.blueDark, fontWeight: '700' },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pointsChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.button },
  pointsChipText: { fontSize: fontSize.body, fontWeight: '700' },
  moreButton: {
    width: 36,
    height: 32,
    borderRadius: radius.button,
    backgroundColor: colors.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButtonText: { fontSize: 18, lineHeight: 20, color: colors.purpleDark, fontWeight: '800' },
  subHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  backText: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '600' },
  subTitle: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  viewToggleFab: {
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
  viewToggleFabText: { color: '#fff', fontSize: 22 },
  menuLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, elevation: 20 },
  menu: {
    position: 'absolute',
    right: spacing.lg,
    minWidth: 150,
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  menuItemPressed: { backgroundColor: colors.purpleLight },
  menuIcon: { fontSize: 15 },
  menuText: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
});
