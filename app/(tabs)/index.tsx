import { Fragment as Keyed, useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontSize, radius, spacing, lh } from '../../constants/theme';
import { WeekDateStrip } from '../../components/timetab/WeekDateStrip';
import { NextStepsSection } from '../../components/today/NextStepsSection';
import { AgendaSection } from '../../components/today/AgendaSection';
import { RecordEditModal } from '../../components/common/RecordEditModal';
import { db } from '../../lib/localdb';
import { CareSection } from '../../components/today/CareSection';
import { PlaySection } from '../../components/today/PlaySection';
import { FragmentsSection } from '../../components/today/FragmentsSection';
import { BodySection } from '../../components/today/BodySection';
import { WaterSection } from '../../components/today/WaterSection';
import { OsReviews } from '../../components/today/OsReviews';
import { WeightSheet } from '../../components/today/WeightSheet';
import { TodoFormModal } from '../../components/todotab/TodoFormModal';
import { CaptureFab } from '../../components/capture/CaptureFab';
import { agendaCount, loadAgenda, setAgendaDone, type AgendaRow } from '../../lib/today';
import { addFragment, deleteFragment, fragmentsBetween, type Fragment } from '../../lib/fragments';
import { addStateEvent, STATE_REPLACE_MS, stateEventsBetween } from '../../lib/states';
import { moodLine, moodNote, type MoodFace } from '../../lib/moods';
import { deleteBody, endPeriod, importLegacyBody, listBody, startPeriod, type BodyRecord } from '../../lib/body';
import { isCompletedToday } from '../../lib/decay';
import { buildDayDigest, dayWindow } from '../../lib/dayDigest';
import { getPlaySession } from '../../lib/play';
import { addCup, cupsToday, removeCup } from '../../lib/water';
import { WATER_SLOTS } from '../../lib/waterPlan';
import { cardsForDay, dayKindOf, DEFAULT_TODAY_LAYOUT, type TodayCardKey, type TodayLayout } from '../../lib/todayCards';
import { loadTodayLayout } from '../../lib/todayLayout';
import { updateItem } from '../../lib/todo';
import { updateItem as updateScheduleItem } from '../../lib/schedule';
import { useDataBus } from '../../lib/dataBus';
import { useCardStore } from '../../lib/store';
import { useTodoStore } from '../../lib/todoStore';
import { quickAddTodo, removeSaved } from '../../lib/capture';
import { routeForFeature } from '../../lib/layoutStore';
import { getNotionToken } from '../../lib/notion/client';
import { completeNextStep, loadNextSteps, loadSyncStatus, removeStateEvent, syncAll, syncStatesSoon, type NextStep } from '../../lib/notion/sync';
import { lingDayKey, useLingSettings } from '../../lib/ling/settings';
import { useLingThread } from '../../lib/ling/thread';
import { writeTodayLine } from '../../lib/ling/brain';
import { onStateTapped, undoStateTap, type CatchHandle } from '../../lib/ling/catch';
import { rescheduleAll } from '../../lib/ling/proactive';
import { ruleTodayLine, type TodayLineContext } from '../../lib/ling/templates';
import type { ScheduleSlot, TodoItem } from '../../types';

// 今天（需求文档 §8.1）：一页放下一天要用的东西，不用跳来跳去。从上到下：
// 灵的一句话 → 随心记（直接写；「现在怎么样」也在这儿：选个表情，单独记或者表情 + 一段话）→ 喝水（4 杯）→ 项目的下一步
// → 事项 → 娱乐出口（默认收着，正在玩时打开）→ 身体（体重、经期）→ 该照顾的（默认收着）。
// 11/1 起这个顺序和显示隐藏她自己调（右上角「调整」，lib/todayCards.ts）；翻到以前的日子看那天的随心记、喝水、事项。
// 日期条上每天的数字是那天记了几条随心记。
// 全部读本地，断网也一样快；Notion 的「下一步」用上次同步的缓存，后台再去拉新的。
// 一天从 5 点算起（灵的设定里能改）：凌晨还没睡时这里还是前一天。

const WEIGH_WORDS = /称体重|量体重|体重/;

const EMPTY: Record<ScheduleSlot, AgendaRow[]> = { allday: [], '08': [], '10': [], '12': [], '14': [], '16': [], '18': [], '20': [], '22': [] };
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const K_LINE = 'ling_today_line_v1';
const LINE_TTL_MS = 3 * 3600 * 1000;

function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Toast {
  text: string;
  undo?: () => void;
  /** 没撤销、5 秒到了才做的事（比如把「这一步做完了」写进 Notion） */
  commit?: () => void;
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export default function TodayScreen() {
  const settings = useLingSettings((s) => s.settings);
  const loadSettings = useLingSettings((s) => s.load);
  const settingsLoaded = useLingSettings((s) => s.loaded);
  const version = useDataBus((s) => s.version);
  const bump = useDataBus((s) => s.bump);
  const fetchCards = useCardStore((s) => s.fetchAll);
  const cats = useCardStore((s) => s.cats);
  const fetchTodoMeta = useTodoStore((s) => s.fetchAll);

  const [now, setNow] = useState(() => new Date());
  const todayKey = lingDayKey(now, settings.dayStartHour);
  const [selected, setSelected] = useState<string | null>(null);
  const dayKey = selected ?? todayKey;
  const isToday = dayKey === todayKey;

  const [agenda, setAgenda] = useState<Record<ScheduleSlot, AgendaRow[]>>(EMPTY);
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [steps, setSteps] = useState<NextStep[]>([]);
  const [pendingStep, setPendingStep] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [notionLine, setNotionLine] = useState<string | null>(null);
  const [line, setLine] = useState<string>('');
  const [catchText, setCatchText] = useState<string | null>(null);
  /** 随心记里每条带表情的，灵那边的「接住你」（按状态日志那行的 id）：删掉那条时一起撤掉 */
  const catchHandles = useRef(new Map<string, CatchHandle>());
  /** 卡片里显示的那句「接住你」是回哪一条的：记了新的表情，旧的那句就不再冒出来 */
  const catchFor = useRef<string | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [waterCups, setWaterCups] = useState(0);
  /** 卡片顺序和显示隐藏（「调整」页里改，回到这页时重读） */
  const [layout, setLayout] = useState<TodayLayout>(DEFAULT_TODAY_LAYOUT);
  /** 娱乐出口：她说不太用，默认收起来；有一局在玩（没到点或者到点了等她点）时自动打开 */
  const [playOpen, setPlayOpen] = useState(false);
  const [weights, setWeights] = useState<BodyRecord[]>([]);
  const [periods, setPeriods] = useState<BodyRecord[]>([]);
  const [weighOpen, setWeighOpen] = useState(false);
  const [editingFragment, setEditingFragment] = useState<Fragment | null>(null);
  const [editingAgenda, setEditingAgenda] = useState<AgendaRow | null>(null);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  /** 这一页自己加 / 改 / 删了事项：日期条上每天的件数跟着重算（别处改的走 dataBus 的 version） */
  const [stripKey, setStripKey] = useState(0);
  const toastRef = useRef<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const starQueue = useRef<Promise<unknown>>(Promise.resolve());
  const lineBusy = useRef(false);

  useEffect(() => {
    if (!settingsLoaded) loadSettings();
  }, [settingsLoaded, loadSettings]);

  const loadAgendaFor = useCallback(
    async (key: string) => {
      setAgenda(await loadAgenda(key, { includeCarried: key === lingDayKey(new Date(), settings.dayStartHour), dayStartHour: settings.dayStartHour, withRoutines: false }));
    },
    [settings.dayStartHour]
  );

  const loadNotion = useCallback(async () => {
    setSteps(await loadNextSteps());
    if (!(await getNotionToken())) {
      setNotionLine(null);
      return;
    }
    const st = await loadSyncStatus();
    const failed = Object.values(st.jobs).filter((j) => j && !j.ok).length;
    setNotionLine(st.lastRunAt ? `Notion 已同步 ${hhmm(st.lastRunAt)}${failed ? ` · ${failed} 项没成功` : ''}` : 'Notion 还没同步');
  }, []);

  /** 页头那句：先用规则写一句马上显示，过期了（3 小时）再让灵重写 */
  const loadLine = useCallback(
    async (key: string, left: number) => {
      const t = new Date();
      const { start } = dayWindow(key, settings.dayStartHour);
      const [digest, states, play] = await Promise.all([
        buildDayDigest(key, settings.dayStartHour).catch(() => null),
        stateEventsBetween(new Date(t.getTime() - 2 * 3600 * 1000), new Date(t.getTime() + 60000)).catch(() => []),
        getPlaySession(),
      ]);
      const ctx: TodayLineContext = {
        now: t,
        dayStartHour: settings.dayStartHour,
        sleepHours: digest?.sleepHours ?? null,
        playingUntil: play && new Date(play.endsAt).getTime() > t.getTime() ? hhmm(play.endsAt) : null,
        recentState: states.length && new Date(states[states.length - 1].at) >= start ? states[states.length - 1].state : null,
        left,
      };
      const rule = ruleTodayLine(ctx);
      // 正在玩、刚点了难受的状态：就说眼前这件事，不用灵另写
      if (ctx.playingUntil || ctx.recentState) {
        setLine(rule);
        return;
      }
      let cached: { dayKey: string; text: string; at: string } | null = null;
      try {
        const raw = await AsyncStorage.getItem(K_LINE);
        cached = raw ? JSON.parse(raw) : null;
      } catch {}
      if (cached && cached.dayKey === key && Date.now() - new Date(cached.at).getTime() < LINE_TTL_MS) {
        setLine(cached.text);
        return;
      }
      setLine(cached && cached.dayKey === key ? cached.text : rule);
      if (lineBusy.current) return;
      lineBusy.current = true;
      try {
        const thread = useLingThread.getState();
        if (!thread.loaded) await thread.load();
        const text = await writeTodayLine(useLingThread.getState().messages, rule);
        if (text) {
          setLine(text);
          await AsyncStorage.setItem(K_LINE, JSON.stringify({ dayKey: key, text, at: new Date().toISOString() }));
        }
      } finally {
        lineBusy.current = false;
      }
    },
    [settings.dayStartHour]
  );

  const loadAll = useCallback(async () => {
    const t = new Date();
    setNow(t);
    const key = lingDayKey(t, settings.dayStartHour);
    const { start, end } = dayWindow(key, settings.dayStartHour);
    const shownKey = selected ?? key;
    const ag = await loadAgenda(shownKey, { includeCarried: shownKey === key, dayStartHour: settings.dayStartHour, withRoutines: false });
    setAgenda(ag);
    const shown = shownKey === key ? { start, end } : dayWindow(shownKey, settings.dayStartHour);
    setFragments(await fragmentsBetween(shown.start, shown.end));
    setWaterCups(await cupsToday(shownKey, settings.dayStartHour).catch(() => 0));
    setLayout(await loadTodayLayout());
    // 有一局在玩（包括已经到点、等她点「起来啦 / 再玩 10 分钟」的）就打开，不然到点的按钮看不见
    if (await getPlaySession().catch(() => null)) setPlayOpen(true);
    fetchCards();
    loadNotion();
    loadBody();
    const c = agendaCount(ag);
    loadLine(key, shownKey === key ? c.total - c.done : 0).catch(() => {});
  }, [settings.dayStartHour, selected, fetchCards, loadNotion, loadLine]);

  /** 翻到哪天：那天的事项、随心记、喝水 */
  const loadDay = useCallback(
    async (key: string) => {
      await loadAgendaFor(key);
      const w = dayWindow(key, settings.dayStartHour);
      setFragments(await fragmentsBetween(w.start, w.end));
      setWaterCups(await cupsToday(key, settings.dayStartHour).catch(() => 0));
    },
    [loadAgendaFor, settings.dayStartHour]
  );

  const loadBody = useCallback(async () => {
    // 旧版工具箱里记的体重、生理期，第一次打开时搬进「身体」（搬过的不会重复）
    await importLegacyBody().catch(() => 0);
    setWeights(await listBody('weight'));
    setPeriods(await listBody('period'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAll();
      // 后台把 Notion 的下一步拉新（30 分钟内只跑一次），拉完刷新这一块
      syncAll()
        .then(() => loadNotion())
        .catch(() => {});
    }, [loadAll, loadNotion])
  );

  useEffect(() => {
    if (version) loadAll();
  }, [version]);

  // 页面被卸掉时还有没到 5 秒的：没撤销就当确定了
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (pushTimer.current) clearTimeout(pushTimer.current);
      toastRef.current?.commit?.();
      toastRef.current = null;
    },
    []
  );

  function showToast(t: Toast) {
    // 上一条还没到 5 秒：它没被撤销，就当确定了
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastRef.current?.commit?.();
    toastRef.current = t;
    setToast(t);
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null;
      toastRef.current = null;
      setToast(null);
      t.commit?.();
    }, 5000);
  }

  function undoToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = null;
    const t = toastRef.current;
    toastRef.current = null;
    setToast(null);
    t?.undo?.();
  }

  async function onToggle(row: AgendaRow) {
    const next = !row.done;
    await setAgendaDone(row, dayKey, next);
    await loadAgendaFor(dayKey);
    if (row.kind === 'todo') rescheduleAll().catch(() => []);
    if (next) {
      showToast({
        text: `做完了：${row.title}`,
        undo: async () => {
          await setAgendaDone(row, dayKey, false);
          await loadAgendaFor(dayKey);
        },
      });
    }
  }

  function onStepDone(step: NextStep) {
    setStepError(null);
    setPendingStep(step.id);
    showToast({
      text: '这一步做完了',
      undo: () => setPendingStep(null),
      commit: async () => {
        try {
          await completeNextStep(step);
          setSteps(await loadNextSteps());
        } catch (err) {
          setStepError(`没写进 Notion：${err instanceof Error ? err.message : String(err)}。下次打开再点一次就行。`);
        } finally {
          setPendingStep(null);
        }
      },
    });
  }

  /**
   * 事项右边的 ☆：收藏 / 取消收藏。页面上马上变（位置不动），写进存储按顺序排队，
   * 连点好几个也不会两次读改写互相覆盖；长按打开的编辑弹窗拿到的也是改过的。
   */
  function onStar(row: AgendaRow) {
    const next = !row.starred;
    setAgenda((prev) => {
      const out = { ...prev };
      for (const slot of Object.keys(out) as ScheduleSlot[]) {
        out[slot] = out[slot].map((r) => (r.key === row.key ? { ...r, starred: next, todo: r.todo ? { ...r.todo, important: next } : r.todo } : r));
      }
      return out;
    });
    starQueue.current = starQueue.current
      .catch(() => {})
      .then(async () => {
        if (row.kind === 'todo' && row.todo) await updateItem(row.todo.id, { important: next });
        else if (row.source === 'item' && row.refId) await updateScheduleItem(row.refId, { starred: next });
      })
      .catch(() => loadAgendaFor(dayKey));
  }

  /** 以前没做完的那条点了 ↑：挪到今天（日期改成今天），5 秒内能撤销 */
  async function onPullToToday(row: AgendaRow) {
    if (!row.todo) return;
    const from = row.todo.date;
    await updateItem(row.todo.id, { date: todayKey });
    await loadAgendaFor(dayKey);
    rescheduleAll().catch(() => []);
    showToast({
      text: `挪到今天了：${row.title}`,
      undo: async () => {
        await updateItem(row.todo!.id, { date: from });
        await loadAgendaFor(dayKey);
        rescheduleAll().catch(() => []);
      },
    });
  }

  /** 「事项」里直接写的一句 → 事项（记在正在看的那天；说了哪天就记哪天），给 5 秒撤销 */
  async function onQuickAddTodo(text: string) {
    const saved = await quickAddTodo(text, dayKey);
    await loadAgendaFor(dayKey);
    setStripKey((k) => k + 1);
    rescheduleAll().catch(() => []);
    showToast({
      text: `加好了：${saved.label}`,
      undo: async () => {
        await removeSaved(saved);
        await loadAgendaFor(dayKey);
        setStripKey((k) => k + 1);
        rescheduleAll().catch(() => []);
      },
    });
  }

  /** 点了一个空杯子：喝了一杯，5 秒内能撤销；杯数变了喝水提醒跟着重排（喝够了的那个点就不叫了） */
  async function onDrink() {
    // 翻到以前的日子是补记：算在那天第几杯对应的那个点
    let at = new Date();
    if (!isToday) {
      at = keyToDate(dayKey);
      at.setHours(WATER_SLOTS[Math.min(waterCups, WATER_SLOTS.length - 1)], 0, 0, 0);
    }
    const entry = await addCup(at);
    setWaterCups((n) => n + 1);
    rescheduleAll().catch(() => []);
    showToast({
      text: isToday ? '喝了一杯 · 500ml' : `补记了一杯 · ${mdLabel}`,
      undo: async () => {
        await removeCup(entry.id);
        setWaterCups((n) => Math.max(0, n - 1));
        rescheduleAll().catch(() => []);
      },
    });
  }

  /** 随心记记一条：选了表情的，同时记进状态日志（5 分钟后写进 Notion），难受的那几种让灵来接住 */
  async function onAddFragment(text: string, mood: MoodFace | null) {
    if (!mood) {
      const f = await addFragment(text);
      setFragments((prev) => [...prev, f]);
      setStripKey((k) => k + 1);
      return;
    }
    const note = moodNote(mood, text);
    const ev = await addStateEvent(mood.state, { note });
    const f = await addFragment(moodLine(mood, text), new Date(ev.at), { face: mood.face, state: mood.state, state_event_id: ev.id });
    setFragments((prev) => [...prev, f]);
    setStripKey((k) => k + 1);
    setCatchText(null);
    catchFor.current = ev.id;
    const handle: CatchHandle = { cancelled: false, ids: [] };
    catchHandles.current.set(ev.id, handle);
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => syncStatesSoon(), STATE_REPLACE_MS + 20000);
    onStateTapped(mood.state, note, handle)
      .then((reply) => {
        if (reply && !handle.cancelled && catchFor.current === ev.id) setCatchText(reply);
      })
      .catch(() => {})
      .finally(() => loadLine(todayKey, 0).catch(() => {}));
  }

  /** 弹窗里删除一条：5 秒内能撤销；带表情的，没撤销才把状态日志那行（已经进 Notion 的归档）和灵的那句接住一起拿掉 */
  async function onDeleteFragment(f: Fragment) {
    await deleteFragment(f.id);
    setFragments((prev) => prev.filter((x) => x.id !== f.id));
    setStripKey((k) => k + 1);
    const evId = f.state_event_id ?? null;
    if (evId && catchFor.current === evId) {
      catchFor.current = null;
      setCatchText(null);
    }
    showToast({
      text: '删了一条随心记',
      undo: async () => {
        const back = await addFragment(f.text, new Date(f.at), evId ? { face: f.face, state: f.state, state_event_id: evId } : undefined);
        setFragments((prev) => [...prev, back].sort((a, b) => a.at.localeCompare(b.at)));
        setStripKey((k) => k + 1);
      },
      commit: evId
        ? () => {
            const handle = catchHandles.current.get(evId);
            catchHandles.current.delete(evId);
            if (handle) undoStateTap(handle).catch(() => {});
            removeStateEvent(evId)
              .catch(() => {})
              .finally(() => loadLine(todayKey, 0).catch(() => {}));
          }
        : undefined,
    });
  }

  /** 记了体重：「称体重」这个习惯今天还没做的话，顺手算做了 */
  function completeWeighHabit(catIds: string[]) {
    const st = useCardStore.getState();
    const card = st.cards.find((c) => !c.archived && c.display_type === 'habit' && WEIGH_WORDS.test(c.name));
    const action = card ? st.actions.find((a) => a.card_id === card.id && a.is_primary) : null;
    if (!card || !action) return;
    const last = st.lastCompletions[action.id] ? new Date(st.lastCompletions[action.id]) : null;
    if (isCompletedToday(last)) return;
    st.doComplete(action, card, catIds.length ? { selectedCats: catIds } : undefined);
  }

  function calendarKey(): string {
    return dateToKey(new Date());
  }

  async function onPeriodStart() {
    const r = await startPeriod(calendarKey());
    await loadBody();
    showToast({
      text: '记下了：经期来了',
      undo: async () => {
        await deleteBody(r.id);
        await loadBody();
      },
    });
  }

  async function onPeriodEnd(r: BodyRecord) {
    await endPeriod(r.id, calendarKey());
    await loadBody();
    showToast({
      text: '记下了：经期结束',
      undo: async () => {
        await endPeriod(r.id, null);
        await loadBody();
      },
    });
  }

  const selectedDate = keyToDate(dayKey);
  const todayDate = keyToDate(todayKey);
  const todayWindow = dayWindow(todayKey, settings.dayStartHour);
  const dayKind = dayKindOf(dayKey, todayKey);
  const mdLabel = `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}`;
  /** 以前 / 以后的日子标题前面带上日期 */
  const titled = (name: string) => (isToday ? name : `${mdLabel} 的${name}`);

  function renderCard(k: TodayCardKey) {
    switch (k) {
      case 'ling':
        return (
          <Pressable style={styles.lingLine} onPress={() => router.push(routeForFeature('chat') as any)} testID="today-line">
            <Text style={styles.lingName}>灵</Text>
            <Text style={styles.lingText}>{line || ' '}</Text>
          </Pressable>
        );
      case 'fragments':
        return (
          <Section title={titled('随心记')}>
            <FragmentsSection fragments={fragments} onAdd={onAddFragment} onEdit={setEditingFragment} readOnly={!isToday} />

          </Section>
        );
      case 'water':
        return (
          <Section title={titled('喝水')}>
            <WaterSection cups={waterCups} onDrink={onDrink} past={!isToday} />
          </Section>
        );
      case 'next':
        return steps.length ? (
          <Section title="项目的下一步">
            <NextStepsSection steps={steps.slice(0, 3)} pendingId={pendingStep} error={stepError} onDone={onStepDone} />
          </Section>
        ) : null;
      case 'agenda':
        return (
          <Section
            title={titled('事项')}
            right={
              <Pressable onPress={() => router.push(routeForFeature('schedule') as any)} hitSlop={8}>
                <Text style={styles.headLink}>排一排 ›</Text>
              </Pressable>
            }
          >
            <AgendaSection
              rows={agenda}
              onToggle={onToggle}
              onQuickAdd={onQuickAddTodo}
              onPullToToday={onPullToToday}
              onStar={onStar}
              onEdit={(row) => {
                if (!row.todo) { setEditingAgenda(row); return; }
                fetchTodoMeta();
                setEditingTodo(row.todo);
              }}
            />
          </Section>
        );
      case 'play':
        return (
          <Section
            title="娱乐出口"
            right={
              <Pressable onPress={() => setPlayOpen((v) => !v)} hitSlop={8} testID="play-toggle">
                <Text style={styles.headLink}>{playOpen ? '收起' : '展开 ›'}</Text>
              </Pressable>
            }
          >
            {playOpen ? (
              <PlaySection
                version={version}
                dayStart={todayWindow.start}
                dayEnd={todayWindow.end}
                onChanged={() => {
                  rescheduleAll().catch(() => []);
                  loadLine(todayKey, 0).catch(() => {});
                  bump();
                }}
              />
            ) : null}
          </Section>
        );
      case 'body':
        return (
          <Section
            title="身体"
            right={
              <Pressable onPress={() => router.push(routeForFeature('body') as any)} hitSlop={8} testID="body-more">
                <Text style={styles.headLink}>全部 ›</Text>
              </Pressable>
            }
          >
            <BodySection
              todayKey={dateToKey(now)}
              weights={weights}
              periods={periods}
              onWeigh={() => setWeighOpen(true)}
              onPeriodStart={onPeriodStart}
              onPeriodEnd={onPeriodEnd}
            />
          </Section>
        );
      case 'care':
        return (
          <Section title="该照顾的">
            <CareSection />
          </Section>
        );
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>
          今日 <Text style={styles.headerSub}>{`${todayDate.getMonth() + 1}月${todayDate.getDate()}日 ${WEEK[todayDate.getDay()]}`}</Text>
        </Text>
        <View style={styles.headerRight}>
          {notionLine ? (
            <Pressable onPress={() => router.push('/notion-connect')} hitSlop={8} style={styles.notionBox}>
              <Text style={styles.notion} numberOfLines={1}>
                {notionLine}
              </Text>
            </Pressable>
          ) : null}

        </View>
      </View>
      <WeekDateStrip
        date={selectedDate}
        today={todayDate}
        hideDateRow
        onDateChange={(d) => {
          const k = dateToKey(d);
          setSelected(k === todayKey ? null : k);
          loadDay(k);
        }}
        refreshKey={version + stripKey}
        fetchCounts={async (dates) => {
          // 每天记了几条随心记（按 5 点换日算那一天）
          const out: Record<string, number> = {};
          for (const d of dates) {
            const k = dateToKey(d);
            const w = dayWindow(k, settings.dayStartHour);
            out[k] = (await fragmentsBetween(w.start, w.end)).length;
          }
          return out;
        }}
      />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!isToday ? (
          <View style={styles.otherDay}>
            <Text style={styles.otherDayText}>正在看 {mdLabel}{dayKind === 'past' ? '（以前）' : ''}</Text>
            <Pressable
              onPress={() => {
                setSelected(null);
                loadDay(todayKey);
              }}
              hitSlop={8}
            >
              <Text style={styles.headLink}>回到今天</Text>
            </Pressable>
          </View>
        ) : null}

        {(['fragments', 'agenda'] as TodayCardKey[]).map((k) => (
          <Keyed key={k}>{renderCard(k)}</Keyed>
        ))}

        <OsReviews date={dayKey} />
        <View style={{ height: 96 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText} numberOfLines={1}>
            {toast.text}
          </Text>
          {toast.undo ? (
            <Pressable onPress={undoToast} hitSlop={10} testID="toast-undo">
              <Text style={styles.toastUndo}>撤销</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <WeightSheet
        visible={weighOpen}
        cats={cats}
        onClose={() => setWeighOpen(false)}
        onSaved={({ catIds }) => {
          setWeighOpen(false);
          completeWeighHabit(catIds);
          loadBody();
        }}
      />
      <RecordEditModal
        visible={!!editingFragment} title="编辑随心记" text={editingFragment?.text ?? ''}
        onClose={() => setEditingFragment(null)}
        onSave={async (text) => {
          if (!editingFragment) return;
          const { error } = await db.from('fragments').update({ text, updated_at: new Date().toISOString() }).eq('id', editingFragment.id);
          if (error) throw new Error(error.message);
          await loadDay(dayKey); bump();
        }}
        onDelete={async () => { if (editingFragment) await onDeleteFragment(editingFragment); }}
      />
      <RecordEditModal
        visible={!!editingAgenda} title="编辑事项" text={editingAgenda?.title ?? ''}
        onClose={() => setEditingAgenda(null)}
        onSave={async (text) => { if (editingAgenda?.refId) await updateScheduleItem(editingAgenda.refId, { title: text }); await loadAgendaFor(dayKey); bump(); }}
        onDelete={async () => { if (editingAgenda?.refId) { const { deleteItem } = await import('../../lib/schedule'); await deleteItem(editingAgenda.refId); } await loadAgendaFor(dayKey); bump(); }}
      />
      <TodoFormModal
        visible={!!editingTodo}
        item={editingTodo}
        onClose={() => setEditingTodo(null)}
        onSaved={() => {
          setEditingTodo(null);
          loadAgendaFor(dayKey);
          setStripKey((k) => k + 1);
          rescheduleAll().catch(() => []);
        }}
        onDeleted={() => {
          setEditingTodo(null);
          loadAgendaFor(dayKey);
          setStripKey((k) => k + 1);
          rescheduleAll().catch(() => []);
        }}
      />
      <CaptureFab />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xs, gap: spacing.sm },
  headerRight: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, flexShrink: 1 },
  notionBox: { flexShrink: 1 },
  layoutLink: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '600' },
  otherDay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.blueLight, borderRadius: radius.widget, paddingHorizontal: spacing.md, paddingVertical: 8 },
  otherDayText: { fontSize: fontSize.body, color: colors.blueDark, fontWeight: '600' },
  pageTitle: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  headerSub: { fontSize: fontSize.body, fontWeight: '400', color: colors.textSecondary },
  notion: { fontSize: fontSize.tiny, color: colors.textMuted },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  lingLine: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.purpleLight, borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.md, alignItems: 'flex-start' },
  lingName: { color: colors.purpleDark, fontWeight: '700', fontSize: fontSize.body, lineHeight: lh(20) },
  lingText: { flex: 1, color: colors.textPrimary, fontSize: fontSize.cardName, lineHeight: lh(20) },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.lg, gap: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: fontSize.cardName, fontWeight: '700', color: colors.textPrimary, letterSpacing: 0 },
  headLinks: { flexDirection: 'row', gap: spacing.md },
  headLink: { fontSize: fontSize.secondary, color: colors.purpleDark },
  catch: { backgroundColor: colors.purpleLight, borderRadius: radius.widget, padding: spacing.sm, gap: 4 },
  catchText: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: lh(19) },
  catchLink: { fontSize: fontSize.secondary, color: colors.purpleDark, alignSelf: 'flex-end' },
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: 84,
    bottom: spacing.lg + 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.textPrimary,
    borderRadius: radius.button,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
  },
  toastText: { flex: 1, color: '#fff', fontSize: fontSize.body },
  toastUndo: { color: '#D8B4E2', fontSize: fontSize.body, fontWeight: '700' },
});
