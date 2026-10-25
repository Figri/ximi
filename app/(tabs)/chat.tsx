import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { room } from '../../constants/room';
import { MessageSheet } from '../../components/ling/MessageSheet';
import { LingLockGate } from '../../components/ling/LingLockGate';
import { useLingThread, type LingMessage } from '../../lib/ling/thread';
import { replyTo, NoKeyError, currentBrain } from '../../lib/ling/brain';
import { executeLingActions } from '../../lib/ling/actions';
import { deliverDue, rescheduleAll } from '../../lib/ling/proactive';
import { modelLabel } from '../../lib/ai';
import { endPlay, getPlaySession, type PlaySession } from '../../lib/play';
import { useDataBus } from '../../lib/dataBus';

// 「灵」：一条不断的对话线（需求文档 §6.7）。按天分隔，往上翻就是昨天；主动消息带时间，长按看为什么发、
// 标判词；灵给了小建议时下面出「好了 / 一点 / 没用 / 做不到」；翻篇插一条分隔线，记忆照旧。

const QUICK_REPLIES = ['好了', '一点', '没用', '做不到'];
const PROACTIVE = new Set(['miss_you', 'mention', 'reminder', 'catch', 'play_end']);

type Row = { type: 'day'; key: string; label: string } | { type: 'msg'; key: string; msg: LingMessage };

function dayLabel(d: Date, now = new Date()): string {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function LingScreen() {
  return (
    <LingLockGate>
      <LingRoom />
    </LingLockGate>
  );
}

function LingRoom() {
  const { messages, loaded, typing, load, add, setTyping, feedback } = useLingThread();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<LingMessage | null>(null);
  const [brainHint, setBrainHint] = useState<string | null>(null);
  const [play, setPlay] = useState<PlaySession | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const dataVersion = useDataBus((s) => s.version);
  const bump = useDataBus((s) => s.bump);
  const listRef = useRef<FlatList<Row>>(null);

  // 娱乐出口进行中：顶上显示「玩到几点」，点一下可以提前结束（需求文档 §8.3）
  useEffect(() => {
    getPlaySession().then(setPlay);
  }, [dataVersion]);
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const playLeft = play ? Math.ceil((new Date(play.endsAt).getTime() - tick) / 60000) : 0;

  async function stopPlay() {
    await endPlay();
    setPlay(null);
    rescheduleAll().catch(() => []);
    bump();
  }

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  useFocusEffect(
    useCallback(() => {
      deliverDue().catch(() => 0);
      getPlaySession().then(setPlay);
      setTick(Date.now());
      currentBrain().then(({ model, apiKey }) => setBrainHint(apiKey ? null : `还没接上大脑：去「设定」里填 ${modelLabel(model)} 的 key`));
    }, [])
  );

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDay = '';
    for (const m of messages) {
      const d = new Date(m.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (key !== lastDay) {
        out.push({ type: 'day', key: `day-${key}`, label: dayLabel(d) });
        lastDay = key;
      }
      out.push({ type: 'msg', key: m.id, msg: m });
    }
    return out;
  }, [messages]);

  const lastProactive = useMemo(() => [...messages].reverse().find((m) => PROACTIVE.has(m.kind)), [messages]);
  const last = messages[messages.length - 1];
  const showQuick = !!last && last.role === 'assistant' && last.suggest && !busy;

  useEffect(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [rows.length, typing]);

  async function runReply() {
    setBusy(true);
    setTyping(true);
    try {
      const reply = await replyTo(useLingThread.getState().messages);
      for (let i = 0; i < reply.bubbles.length; i++) {
        if (i > 0) await wait(450 + Math.min(1100, reply.bubbles[i].length * 25));
        await add({
          role: 'assistant',
          content: reply.bubbles[i],
          kind: 'chat',
          suggest: reply.suggest && i === reply.bubbles.length - 1,
          actions: i === 0 && reply.actions.length ? reply.actions : null,
        });
      }
      const labels = await executeLingActions(reply.actions);
      for (const l of labels) await add({ role: 'system', content: l, kind: 'note' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await add({
        role: 'system',
        kind: 'note',
        content: err instanceof NoKeyError ? msg : `灵没收到（${msg.slice(0, 80)}），点这条重发`,
        trigger: err instanceof NoKeyError ? 'settings' : 'retry',
      });
    } finally {
      setTyping(false);
      setBusy(false);
    }
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    await add({ role: 'user', content: t });
    await runReply();
  }

  async function turnPage() {
    if (busy) return;
    if (last?.kind === 'divider') return;
    await add({ role: 'system', content: '翻篇', kind: 'divider' });
  }

  function onNotePress(m: LingMessage) {
    if (m.trigger === 'settings') router.push('/ling-settings');
    else if (m.trigger === 'retry' && !busy) runReply();
  }

  function renderRow({ item }: { item: Row }) {
    if (item.type === 'day') return <Text style={styles.daySep}>{item.label}</Text>;
    const m = item.msg;
    if (m.kind === 'divider') {
      return (
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          {/* 翻篇 = 换个话题：这条线以前聊的，灵接下来就不接着说了（记录还在，长期记的事照样知道） */}
          <Text style={styles.dividerText}>翻篇 · 前面的不接着聊了</Text>
          <View style={styles.dividerLine} />
        </View>
      );
    }
    if (m.kind === 'note') {
      return (
        <Pressable onPress={() => onNotePress(m)} disabled={!m.trigger}>
          <Text style={[styles.note, m.trigger && styles.noteAction]}>{m.content}</Text>
        </Pressable>
      );
    }
    const mine = m.role === 'user';
    return (
      <View style={[styles.msgBlock, mine ? styles.msgMine : styles.msgLing]}>
        {!mine && PROACTIVE.has(m.kind) ? <Text style={styles.meta}>{hhmm(m.created_at)}</Text> : null}
        <Pressable
          onLongPress={() => !mine && setSheet(m)}
          delayLongPress={350}
          style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleLing]}
          testID={mine ? 'bubble-me' : 'bubble-ling'}
        >
          <Text style={styles.bubbleText}>{m.content}</Text>
        </Pressable>
        {!mine && m.feedback ? <Text style={styles.feedbackTag}>你标了：{m.feedback}</Text> : null}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.name}>灵</Text>
            <Text style={styles.sub}>{lastProactive ? `上次找你 ${hhmm(lastProactive.created_at)}` : '想说什么都行'}</Text>
          </View>
          <Pressable style={styles.headBtn} onPress={turnPage} hitSlop={6}>
            <Text style={styles.headBtnText}>翻篇</Text>
          </Pressable>
          <Pressable style={styles.headBtn} onPress={() => router.push('/ling-settings')} hitSlop={6}>
            <Text style={styles.headBtnText}>设定</Text>
          </Pressable>
        </View>

        {play && playLeft > 0 ? (
          <View style={styles.playBar}>
            <Text style={styles.playText}>
              玩{play.what}到 {hhmm(play.endsAt)} · 还剩 {playLeft} 分钟
            </Text>
            <Pressable onPress={stopPlay} hitSlop={8} testID="chat-play-stop">
              <Text style={styles.playStop}>提前结束</Text>
            </Pressable>
          </View>
        ) : null}

        {brainHint ? (
          <Pressable style={styles.hint} onPress={() => router.push('/ling-settings')}>
            <Text style={styles.hintText}>{brainHint}</Text>
          </Pressable>
        ) : null}

        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={loaded ? <Text style={styles.empty}>还没说过话。随便说点什么，灵都在听。</Text> : null}
          ListFooterComponent={
            <View>
              {typing ? (
                <View style={[styles.msgBlock, styles.msgLing]}>
                  <View style={[styles.bubble, styles.bubbleLing]}>
                    <Text style={styles.typing}>正在输入…</Text>
                  </View>
                </View>
              ) : null}
              {showQuick ? (
                <View style={styles.quickRow}>
                  {QUICK_REPLIES.map((q) => (
                    <Pressable key={q} style={styles.quick} onPress={() => send(q)}>
                      <Text style={styles.quickText}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          }
        />

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="说点什么……"
            placeholderTextColor={room.ink3}
            multiline
            onSubmitEditing={() => send(input)}
            blurOnSubmit={false}
          />
          <Pressable
            style={[styles.send, (!input.trim() || busy) && styles.sendDisabled]}
            onPress={() => send(input)}
            disabled={!input.trim() || busy}
          >
            <Text style={styles.sendText}>发送</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <MessageSheet
        message={sheet}
        onClose={() => setSheet(null)}
        onFeedback={async (m, tag) => {
          await feedback(m.id, tag);
          setSheet((s) => (s && s.id === m.id ? { ...s, feedback: tag } : s));
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  playBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: room.surface },
  playText: { color: room.accent, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  playStop: { color: room.ink2, fontSize: 12 },
  container: { flex: 1, backgroundColor: room.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: room.line,
  },
  name: { color: room.ink, fontSize: 17, fontWeight: '700' },
  sub: { color: room.ink3, fontSize: 11, marginTop: 2 },
  headBtn: { borderWidth: 1, borderColor: room.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  headBtnText: { color: room.ink2, fontSize: 12 },
  hint: { marginHorizontal: 16, marginTop: 10, backgroundColor: room.surface, borderRadius: 12, padding: 10 },
  hintText: { color: room.accent, fontSize: 12 },
  list: { paddingHorizontal: 14, paddingVertical: 12, gap: 6, flexGrow: 1 },
  empty: { color: room.ink3, fontSize: 13, textAlign: 'center', marginTop: 60 },
  daySep: { color: room.ink3, fontSize: 11, textAlign: 'center', marginVertical: 8 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: room.line },
  dividerText: { color: room.ink3, fontSize: 11 },
  note: { color: room.ink3, fontSize: 11, textAlign: 'center', marginVertical: 4, paddingHorizontal: 20 },
  noteAction: { color: room.accent, textDecorationLine: 'underline' },
  msgBlock: { maxWidth: '86%', gap: 3 },
  msgMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgLing: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  meta: { color: room.ink3, fontSize: 10, marginLeft: 4 },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  bubbleLing: { backgroundColor: room.ling, borderTopLeftRadius: 4 },
  bubbleMine: { backgroundColor: room.me, borderTopRightRadius: 4 },
  bubbleText: { color: room.ink, fontSize: 15, lineHeight: 21 },
  feedbackTag: { color: room.ink3, fontSize: 10, marginLeft: 4 },
  typing: { color: room.ink3, fontSize: 13 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  quick: { borderWidth: 1, borderColor: room.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  quickText: { color: room.ink2, fontSize: 13 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: room.line,
    backgroundColor: room.bg,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    backgroundColor: room.surface,
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: room.ink,
    fontSize: 15,
  },
  send: { backgroundColor: room.accent, borderRadius: 19, paddingHorizontal: 14, height: 38, justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: room.bg, fontWeight: '700', fontSize: 14 },
});
