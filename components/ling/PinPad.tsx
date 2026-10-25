import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { room } from '../../constants/room';
import { FORGET_WAIT_MS, useLingLock } from '../../lib/ling/lock';

// 4 位密码盘（深色，跟灵的空间一样）。三种用法：
// unlock = 进门；set = 设新密码（输两次）；verify = 关锁 / 改密码前先确认现在的密码。

type Mode = 'unlock' | 'set' | 'verify';

interface Props {
  mode: Mode;
  onDone: (pin: string) => void;
  onCancel?: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
const MAX_TRIES = 5;
const COOLDOWN_MS = 30 * 1000;

export function PinPad({ mode, onDone, onCancel }: Props) {
  const check = useLingLock((s) => s.check);
  const clearPin = useLingLock((s) => s.clearPin);
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [coolUntil, setCoolUntil] = useState(0);
  const [forgetAt, setForgetAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  // 「忘了」：等够 60 秒就把锁关掉
  useEffect(() => {
    if (forgetAt && now >= forgetAt) {
      setForgetAt(null);
      clearPin().then(() => onDone(''));
    }
  }, [forgetAt, now, clearPin, onDone]);

  const cooling = now < coolUntil;

  async function submit(p: string) {
    if (mode === 'set') {
      if (!first) {
        setFirst(p);
        setPin('');
        setError(null);
        return;
      }
      if (p !== first) {
        setFirst(null);
        setPin('');
        setError('两次不一样，重新来');
        return;
      }
      onDone(p);
      return;
    }
    if (await check(p)) {
      setTries(0);
      onDone(p);
      return;
    }
    const n = tries + 1;
    setTries(n);
    setPin('');
    if (n >= MAX_TRIES) {
      setCoolUntil(Date.now() + COOLDOWN_MS);
      setTries(0);
      setError('错了好几次，等 30 秒再试');
    } else {
      setError('不对，再试一次');
    }
  }

  function press(k: string) {
    if (cooling || !k) return;
    if (k === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) submit(next);
  }

  const title = mode === 'set' ? (first ? '再输一次' : '设一个 4 位密码') : mode === 'verify' ? '先输一下现在的密码' : '输密码进来';

  return (
    <View style={styles.wrap} testID="pin-pad">
      <Text style={styles.name}>灵</Text>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotOn]} />
        ))}
      </View>
      <Text style={styles.error}>{cooling ? `等 ${Math.ceil((coolUntil - now) / 1000)} 秒再试` : error ?? ' '}</Text>
      <View style={styles.pad}>
        {KEYS.map((k, i) => (
          <Pressable key={i} style={[styles.key, !k && styles.keyEmpty]} onPress={() => press(k)} disabled={!k || cooling} testID={k ? `pin-${k === '⌫' ? 'del' : k}` : undefined}>
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.footer}>
        {mode === 'unlock' ? (
          forgetAt ? (
            <Text style={styles.link}>{Math.ceil((forgetAt - now) / 1000)} 秒后锁会关掉</Text>
          ) : (
            <Pressable onPress={() => setForgetAt(Date.now() + FORGET_WAIT_MS)} hitSlop={10} testID="pin-forgot">
              <Text style={styles.link}>忘了？</Text>
            </Pressable>
          )
        ) : null}
        {onCancel ? (
          <Pressable onPress={onCancel} hitSlop={10}>
            <Text style={styles.link}>算了</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: room.bg, paddingHorizontal: 32, gap: 14 },
  name: { color: room.accent, fontSize: 22, fontWeight: '700' },
  title: { color: room.ink, fontSize: 15 },
  dots: { flexDirection: 'row', gap: 16, marginTop: 6 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: room.ink3 },
  dotOn: { backgroundColor: room.accent, borderColor: room.accent },
  error: { color: '#E5A3B5', fontSize: 12, minHeight: 16 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 252, justifyContent: 'space-between', rowGap: 14 },
  key: { width: 72, height: 56, borderRadius: 16, backgroundColor: room.surface, alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { backgroundColor: 'transparent' },
  keyText: { color: room.ink, fontSize: 22 },
  footer: { flexDirection: 'row', gap: 28, marginTop: 8, minHeight: 20 },
  link: { color: room.ink3, fontSize: 13 },
});
