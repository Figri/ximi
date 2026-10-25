import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { endedRecently, endPlay, extendPlay, getPlaySession, PLAY_DURATIONS, PLAY_WHATS, startPlay, type PlaySession, type PlayWhat } from '../../lib/play';
import { PLAY_AGAIN_LINE } from '../../lib/ling/templates';

// 娱乐出口（需求文档 §8.3）：开始前定个结束点（默认 30 分钟），到点灵来叫你；能再 10 分钟一次；
// 结束时自动记一段「玩」的时间块。刚结束不到 5 分钟又要开始，灵问一句要不要先歇两分钟——只问一次，照样能开始。
// 从点「开始玩」到开始计时最多 3 下：开始玩 → 选玩什么（多久默认 30 分钟）→ 开始。

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
}

export function PlaySection({ onChanged, version }: Props) {
  const [session, setSession] = useState<PlaySession | null>(null);
  const [picking, setPicking] = useState(false);
  const [what, setWhat] = useState<PlayWhat | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [askedAgain, setAskedAgain] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setSession(await getPlaySession());
    setNow(Date.now());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, version]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  async function openPicker() {
    setPicking(true);
    setAskedAgain(false);
    setMinutes(30);
    try {
      const last = (await AsyncStorage.getItem(K_LAST_WHAT)) as PlayWhat | null;
      setWhat(last && PLAY_WHATS.includes(last) ? last : null);
    } catch {
      setWhat(null);
    }
  }

  async function begin() {
    if (!what) return;
    if (!askedAgain && (await endedRecently())) {
      setAskedAgain(true);
      return;
    }
    const s = await startPlay(what, minutes);
    AsyncStorage.setItem(K_LAST_WHAT, what).catch(() => {});
    setSession(s);
    setPicking(false);
    setNow(Date.now());
    onChanged();
  }

  async function finish(msg: string) {
    const r = await endPlay();
    setSession(null);
    setToast(r && r.loggedMinutes >= 1 ? `${msg}（记了 ${r.loggedMinutes} 分钟「玩」）` : msg);
    setTimeout(() => setToast(null), 3000);
    onChanged();
  }

  async function more() {
    const s = await extendPlay();
    setSession(s);
    setNow(Date.now());
    onChanged();
  }

  if (session) {
    const left = Math.ceil((new Date(session.endsAt).getTime() - now) / 60000);
    if (left > 0) {
      return (
        <View style={styles.playing}>
          <Text style={styles.playingText}>
            玩{session.what}到 {hhmm(session.endsAt)} · 还剩 {left} 分钟
          </Text>
          <Pressable onPress={() => finish('好，不玩了')} hitSlop={8} testID="play-stop">
            <Text style={styles.link}>提前结束</Text>
          </Pressable>
        </View>
      );
    }
    return (
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
    );
  }

  if (!picking) {
    return (
      <View>
        <Pressable style={styles.start} onPress={openPicker} testID="play-open">
          <Text style={styles.startText}>开始玩 · 先定个出口</Text>
        </Pressable>
        {toast ? <Text style={styles.muted}>{toast}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.label}>玩什么</Text>
      <View style={styles.row}>
        {PLAY_WHATS.map((w) => (
          <Pressable key={w} style={[styles.chip, what === w && styles.chipOn]} onPress={() => setWhat(w)} testID={`play-what-${w}`}>
            <Text style={[styles.chipText, what === w && styles.chipTextOn]}>{w}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>多久</Text>
      <View style={styles.row}>
        {PLAY_DURATIONS.map((d) => (
          <Pressable key={d.label} style={[styles.chip, minutes === d.minutes && styles.chipOn]} onPress={() => setMinutes(d.minutes)}>
            <Text style={[styles.chipText, minutes === d.minutes && styles.chipTextOn]}>{d.label}</Text>
          </Pressable>
        ))}
      </View>
      {askedAgain ? <Text style={styles.ling}>灵：{PLAY_AGAIN_LINE}</Text> : null}
      <View style={styles.row}>
        <Pressable style={[styles.btn, !what && styles.btnOff]} onPress={begin} disabled={!what} testID="play-start">
          <Text style={styles.btnText}>{askedAgain ? '还是开始' : '开始'}</Text>
        </Pressable>
        <Pressable onPress={() => setPicking(false)} hitSlop={8}>
          <Text style={styles.cancel}>{askedAgain ? '那歇会儿' : '算了'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  start: { borderWidth: 1, borderColor: colors.purple, borderStyle: 'dashed', borderRadius: radius.widget, paddingVertical: 10, alignItems: 'center' },
  startText: { color: colors.purpleDark, fontSize: fontSize.body, fontWeight: '600' },
  playing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.purpleLight, borderRadius: radius.widget, paddingHorizontal: spacing.md, paddingVertical: 10 },
  playingText: { color: colors.purpleDark, fontSize: fontSize.body, fontWeight: '600', flexShrink: 1 },
  box: { backgroundColor: colors.background, borderRadius: radius.widget, padding: spacing.md, gap: spacing.sm },
  label: { fontSize: fontSize.secondary, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.button, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.purpleDark },
  chipText: { fontSize: fontSize.body, color: colors.textPrimary },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  ling: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 19 },
  btn: { backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 16, paddingVertical: 8 },
  btnOff: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
  btnGhost: { borderWidth: 1, borderColor: colors.purple, borderRadius: radius.widget, paddingHorizontal: 12, paddingVertical: 7 },
  btnGhostText: { color: colors.purpleDark, fontSize: fontSize.body },
  link: { color: colors.purpleDark, fontSize: fontSize.secondary },
  cancel: { color: colors.textMuted, fontSize: fontSize.body },
  muted: { color: colors.textMuted, fontSize: fontSize.secondary, marginTop: 6 },
});
