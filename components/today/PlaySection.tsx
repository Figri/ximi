import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import {
  endedRecently,
  endPlay,
  extendPlay,
  getPlaySession,
  playHistoryBetween,
  PLAY_DURATIONS,
  PLAY_WHATS,
  startPlay,
  type PlayRecord,
  type PlaySession,
  type PlayWhat,
} from '../../lib/play';
import { PLAY_AGAIN_LINE } from '../../lib/ling/templates';

// 娱乐出口（需求文档 §8.3）：开始前定个结束点（默认 30 分钟），到点灵来叫你；能再 10 分钟一次；
// 结束时自动记一段「玩」的时间块，底下列出今天每一局几点开始、几点结束。
// 不用先点开：玩什么、多久直接摆着，选好点「开始」。刚结束不到 5 分钟又要开始，灵问一句要不要先歇两分钟——只问一次，照样能开始。

const K_LAST_WHAT = 'play_last_what_v1';

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Props {
  /** 开始 / 延长 / 结束之后：重排灵的到点提醒、刷新时间块 */
  onChanged: () => void;
  /** 父页面的「数据变了」版本号：在别处（比如灵的窗口顶上）结束了，这里跟着刷新 */
  version: number;
  /** 今天从几点到几点（一天从几点算起），用来挑今天玩过的 */
  dayStart: Date;
  dayEnd: Date;
}

export function PlaySection({ onChanged, version, dayStart, dayEnd }: Props) {
  const [session, setSession] = useState<PlaySession | null>(null);
  const [what, setWhat] = useState<PlayWhat | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [askedAgain, setAskedAgain] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [history, setHistory] = useState<PlayRecord[]>([]);
  const [justEnded, setJustEnded] = useState<string | null>(null);

  const startKey = dayStart.getTime();
  const endKey = dayEnd.getTime();
  const refresh = useCallback(async () => {
    setSession(await getPlaySession());
    setHistory(await playHistoryBetween(new Date(startKey), new Date(endKey)));
    setNow(Date.now());
  }, [startKey, endKey]);

  useEffect(() => {
    refresh();
  }, [refresh, version]);

  useEffect(() => {
    AsyncStorage.getItem(K_LAST_WHAT)
      .then((last) => {
        if (last && PLAY_WHATS.includes(last as PlayWhat)) setWhat((cur) => cur ?? (last as PlayWhat));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  async function begin() {
    if (!what) return;
    if (!askedAgain && (await endedRecently())) {
      setAskedAgain(true);
      return;
    }
    const s = await startPlay(what, minutes);
    AsyncStorage.setItem(K_LAST_WHAT, what).catch(() => {});
    setSession(s);
    setAskedAgain(false);
    setJustEnded(null);
    setMinutes(30);
    setNow(Date.now());
    onChanged();
  }

  async function finish(msg: string) {
    const r = await endPlay();
    setSession(null);
    setJustEnded(r?.record ? `${msg}。记下了 ${hhmm(r.record.startedAt)}–${hhmm(r.record.endedAt)}，${r.record.minutes} 分钟` : msg);
    setHistory(await playHistoryBetween(new Date(startKey), new Date(endKey)));
    onChanged();
  }

  async function more() {
    const s = await extendPlay();
    setSession(s);
    setNow(Date.now());
    onChanged();
  }

  const total = history.reduce((n, r) => n + r.minutes, 0);
  const historyList = history.length ? (
    <View style={styles.history} testID="play-history">
      <Text style={styles.historyHead}>今天玩过 · 一共 {total} 分钟</Text>
      {history.map((r) => (
        <View key={r.id} style={styles.historyRow}>
          <Text style={styles.historyTime}>
            {hhmm(r.startedAt)}–{hhmm(r.endedAt)}
          </Text>
          <Text style={styles.historyText}>
            {r.what} · {r.minutes} 分钟
          </Text>
        </View>
      ))}
    </View>
  ) : null;

  if (session) {
    const left = Math.ceil((new Date(session.endsAt).getTime() - now) / 60000);
    if (left > 0) {
      return (
        <View style={styles.wrap}>
          <View style={styles.playing}>
            <Text style={styles.playingText}>
              {hhmm(session.startedAt)} 开始玩{session.what} · 到 {hhmm(session.endsAt)}，还剩 {left} 分钟
            </Text>
            <Pressable onPress={() => finish('好，不玩了')} hitSlop={8} testID="play-stop">
              <Text style={styles.link}>提前结束</Text>
            </Pressable>
          </View>
          {historyList}
        </View>
      );
    }
    return (
      <View style={styles.wrap}>
        <View style={styles.box}>
          <Text style={styles.ling}>灵：到点啦，起来走两步。</Text>
          <View style={styles.row}>
            <Pressable style={styles.btn} onPress={() => finish('起来啦')} testID="play-up">
              <Text style={styles.btnText}>起来了</Text>
            </Pressable>
            {!session.extended ? (
              <Pressable style={styles.btnGhost} onPress={more} testID="play-more">
                <Text style={styles.btnGhostText}>再 10 分钟</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.btnGhost} onPress={() => finish('好，今天就这样')} testID="play-enough">
              <Text style={styles.btnGhostText}>今天就这样</Text>
            </Pressable>
          </View>
        </View>
        {historyList}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {justEnded ? <Text style={styles.ended}>{justEnded}</Text> : null}
      <View style={styles.pickRow}>
        <Text style={styles.label}>玩什么</Text>
        <View style={styles.row}>
          {PLAY_WHATS.map((w) => (
            <Pressable key={w} style={[styles.chip, what === w && styles.chipOn]} onPress={() => setWhat(w)} testID={`play-what-${w}`}>
              <Text style={[styles.chipText, what === w && styles.chipTextOn]}>{w}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.pickRow}>
        <Text style={styles.label}>多久</Text>
        <View style={styles.row}>
          {PLAY_DURATIONS.map((d) => (
            <Pressable key={d.label} style={[styles.chip, minutes === d.minutes && styles.chipOn]} onPress={() => setMinutes(d.minutes)} testID={`play-min-${d.minutes}`}>
              <Text style={[styles.chipText, minutes === d.minutes && styles.chipTextOn]}>{d.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {askedAgain ? <Text style={styles.ling}>灵：{PLAY_AGAIN_LINE}</Text> : null}
      <View style={styles.row}>
        <Pressable style={[styles.btn, !what && styles.btnOff]} onPress={begin} disabled={!what} testID="play-start">
          <Text style={styles.btnText}>{askedAgain ? '还是开始' : what ? `开始玩${what}` : '先选玩什么'}</Text>
        </Pressable>
        {askedAgain ? (
          <Pressable onPress={() => setAskedAgain(false)} hitSlop={8}>
            <Text style={styles.cancel}>那歇会儿</Text>
          </Pressable>
        ) : null}
      </View>
      {historyList}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  playing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, backgroundColor: colors.purpleLight, borderRadius: radius.widget, paddingHorizontal: spacing.md, paddingVertical: 10 },
  playingText: { color: colors.purpleDark, fontSize: fontSize.body, fontWeight: '600', flexShrink: 1, lineHeight: 19 },
  box: { backgroundColor: colors.background, borderRadius: radius.widget, padding: spacing.md, gap: spacing.sm },
  label: { width: 40, fontSize: fontSize.secondary, color: colors.textSecondary },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.button, backgroundColor: colors.background },
  chipOn: { backgroundColor: colors.purpleDark },
  chipText: { fontSize: fontSize.body, color: colors.textPrimary },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  ling: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 19 },
  ended: { fontSize: fontSize.secondary, color: colors.textSecondary, lineHeight: 18 },
  btn: { backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 16, paddingVertical: 8 },
  btnOff: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
  btnGhost: { borderWidth: 1, borderColor: colors.purple, borderRadius: radius.widget, paddingHorizontal: 12, paddingVertical: 7 },
  btnGhostText: { color: colors.purpleDark, fontSize: fontSize.body },
  link: { color: colors.purpleDark, fontSize: fontSize.secondary },
  cancel: { color: colors.textMuted, fontSize: fontSize.body },
  history: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.purple, paddingTop: spacing.sm, gap: 4 },
  historyHead: { fontSize: fontSize.secondary, color: colors.textSecondary, fontWeight: '600' },
  historyRow: { flexDirection: 'row', gap: spacing.sm },
  historyTime: { width: 92, fontSize: fontSize.body, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  historyText: { flex: 1, fontSize: fontSize.body, color: colors.textSecondary },
});
