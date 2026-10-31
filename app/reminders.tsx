import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { colors, fontSize, lh, radius, spacing } from '../constants/theme';
import { loadWaterSettings, saveWaterSettings } from '../lib/water';
import { WATER_SLOTS } from '../lib/waterPlan';
import { loadReminderBackup, type ReminderBackup } from '../lib/reminderReset';
import { pendingOutbox, rescheduleAll, sendTestNotification, type OutboxItem } from '../lib/ling/proactive';
import { ensureNotificationPermission } from '../lib/notifications';
import { useLingSettings } from '../lib/ling/settings';
import { KIND_LABEL } from '../lib/ling/templates';

// 「其他 → 提醒」：现在哪些提醒开着、接下来会响什么、App 关着也要收到得在手机上开哪几样。
// 10/31 起旧的事项 / 习惯 / 日程提醒先全关了，开着的只有喝水和灵发的消息；要哪条提醒就去那条里打开。

const SWITCH_TRACK = { false: '#DDD6E8', true: colors.purple };

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (that === t) return '今天';
  if (that - t === 86400000) return '明天';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type Perm = 'granted' | 'denied' | 'ask' | 'web';

export default function RemindersScreen() {
  const settings = useLingSettings((s) => s.settings);
  const updateLing = useLingSettings((s) => s.update);
  const [water, setWater] = useState(true);
  const [pending, setPending] = useState<OutboxItem[]>([]);
  const [backup, setBackup] = useState<ReminderBackup | null>(null);
  const [perm, setPerm] = useState<Perm>('ask');
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setWater((await loadWaterSettings()).remind);
    setBackup(await loadReminderBackup());
    setPending((await pendingOutbox()).slice(0, 6));
    if (Platform.OS === 'web') setPerm('web');
    else {
      try {
        const p = await Notifications.getPermissionsAsync();
        setPerm(p.granted ? 'granted' : p.canAskAgain === false ? 'denied' : 'ask');
      } catch {
        setPerm('ask');
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function toggleWater(v: boolean) {
    setWater(v);
    await saveWaterSettings({ remind: v });
    await rescheduleAll().catch(() => []);
    setPending((await pendingOutbox()).slice(0, 6));
  }

  async function toggleLing(v: boolean) {
    await updateLing({ enableMissYou: v, enableMention: v, missYouPerDay: v ? Math.max(1, settings.missYouPerDay) : settings.missYouPerDay });
    await rescheduleAll().catch(() => []);
    setPending((await pendingOutbox()).slice(0, 6));
  }

  async function askPermission() {
    if (perm === 'denied') {
      Linking.openSettings().catch(() => {});
      return;
    }
    const ok = await ensureNotificationPermission('always').catch(() => false);
    setMsg(ok ? '通知开好了' : '没开成，去系统设置里打开');
    refresh();
  }

  async function test() {
    const ok = await sendTestNotification(60).catch(() => false);
    setMsg(ok ? '1 分钟后会响一条。现在把西米OS 从最近任务里划掉，等着看响不响。' : '没拿到通知权限（或者是在网页里），先把上面的通知打开');
  }

  function openBattery() {
    if (Platform.OS !== 'android') {
      Linking.openSettings().catch(() => {});
      return;
    }
    Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(() => Linking.openSettings().catch(() => {}));
  }

  const lingOn = settings.enableMissYou || settings.enableMention;
  const offCount = backup ? backup.todos.length + backup.habits.length + backup.schedule.length : 0;
  const offNames = backup ? [...backup.todos.map((t) => t.content), ...backup.schedule.map((s) => s.title)] : [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} testID="reminders-back">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>提醒</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.section}>开着的</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>💧 喝水</Text>
              <Text style={styles.rowSub}>{WATER_SLOTS.map((h) => `${h}:00`).join('、')}，灵来叫；那会儿已经喝够了就不叫</Text>
            </View>
            <Switch value={water} onValueChange={toggleWater} trackColor={SWITCH_TRACK} thumbColor="#fff" testID="remind-water" />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>💜 灵发来的消息</Text>
              <Text style={styles.rowSub}>想你了、顺口一提。几条、免打扰在「灵的设定」里调</Text>
            </View>
            <Switch value={lingOn} onValueChange={toggleLing} trackColor={SWITCH_TRACK} thumbColor="#fff" testID="remind-ling" />
          </View>
        </View>

        <Text style={styles.section}>事项、习惯、日程的提醒</Text>
        <View style={styles.card}>
          <Text style={styles.para}>
            10/31 起先全关了{offCount ? `（关了 ${offCount} 条）` : ''}。要哪条提醒，就去那条里把提醒打开：事项点开改，习惯在「编辑习惯」里开「到日子提醒我」（还是原来的时间），日程在日程页那一行设。
          </Text>
          {offNames.length ? (
            <Text style={styles.muted} testID="reminders-off-list">
              关掉的：{offNames.slice(0, 8).join('、')}
              {offNames.length > 8 ? ` 等 ${offNames.length} 条` : ''}
              {backup && backup.habits.length ? `；习惯 ${backup.habits.length} 个` : ''}
            </Text>
          ) : null}
        </View>

        <Text style={styles.section}>接下来会响的</Text>
        <View style={styles.card} testID="reminders-pending">
          {pending.length ? (
            pending.map((p) => (
              <View key={p.id} style={styles.pendingRow}>
                <Text style={styles.pendingTime}>
                  {dayLabel(p.fireAt)} {hhmm(p.fireAt)}
                </Text>
                <Text style={styles.pendingText} numberOfLines={2}>
                  {p.trigger.startsWith('喝水') ? '喝水' : KIND_LABEL[p.kind as keyof typeof KIND_LABEL] ?? p.kind} · {p.text}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>现在没有排着的</Text>
          )}
        </View>

        <Text style={styles.section}>App 关着也要收到</Text>
        <View style={styles.card}>
          <Text style={styles.para}>
            提醒是提前排进手机里的，App 关着也会响。只有打开 App 才看到，多半是手机把它拦了。下面几样都开好：
          </Text>
          <View style={styles.step}>
            <Text style={styles.stepNo}>1</Text>
            <View style={styles.stepBody}>
              <Text style={styles.stepText}>
                通知：允许。「灵的消息」「约定提醒」两类都打开（喝水走「约定提醒」，会响）。
                {perm === 'granted' ? ' 现在：已允许 ✓' : perm === 'web' ? '' : ' 现在：还没允许'}
              </Text>
              {perm !== 'granted' && perm !== 'web' ? (
                <Pressable style={styles.btn} onPress={askPermission} testID="reminders-perm">
                  <Text style={styles.btnText}>{perm === 'denied' ? '去系统设置打开通知' : '允许通知'}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNo}>2</Text>
            <View style={styles.stepBody}>
              <Text style={styles.stepText}>电池 / 省电：西米OS 设成「不限制」（也叫「无限制」「允许后台高耗电」）。省电优化会把排好的提醒拦掉。</Text>
              <Pressable style={styles.btnGhost} onPress={openBattery} testID="reminders-battery">
                <Text style={styles.btnGhostText}>打开电池优化设置</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNo}>3</Text>
            <View style={styles.stepBody}>
              <Text style={styles.stepText}>
                自启动 / 后台运行：打开。小米、红米叫「自启动」；华为、荣耀在「应用启动管理」里改成手动、三个开关都开；OPPO、一加、vivo 叫「自启动」「后台耗电管理」。
              </Text>
              <Pressable style={styles.btnGhost} onPress={() => Linking.openSettings().catch(() => {})} testID="reminders-settings">
                <Text style={styles.btnGhostText}>打开西米OS 的系统设置</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNo}>4</Text>
            <View style={styles.stepBody}>
              <Text style={styles.stepText}>最近任务里把西米OS 往下拉一下锁住，一键清理时就不会被清掉。</Text>
            </View>
          </View>
          <Pressable style={styles.btn} onPress={test} testID="reminders-test">
            <Text style={styles.btnText}>1 分钟后发一条测试</Text>
          </Pressable>
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}
          <Text style={styles.muted}>
            准点：安卓 12 以上要分秒不差，得有「闹钟和提醒」权限，这个要重新装一次 App 才能加；现在的提醒偶尔会晚几分钟。
          </Text>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  back: { fontSize: 26, lineHeight: 28, color: colors.purpleDark, marginTop: -2 },
  title: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  body: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  section: { fontSize: fontSize.secondary, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.sm, letterSpacing: 0.5 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: fontSize.cardName, fontWeight: '600', color: colors.textPrimary },
  rowSub: { fontSize: fontSize.secondary, color: colors.textMuted, lineHeight: lh(16) },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.purpleLight },
  para: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: lh(19) },
  muted: { fontSize: fontSize.secondary, color: colors.textMuted, lineHeight: lh(16) },
  pendingRow: { flexDirection: 'row', gap: spacing.sm },
  pendingTime: { width: lh(78), fontSize: fontSize.secondary, color: colors.textSecondary, paddingTop: 1 },
  pendingText: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, lineHeight: lh(18) },
  step: { flexDirection: 'row', gap: spacing.sm },
  stepNo: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.purpleLight, color: colors.purpleDark, textAlign: 'center', fontSize: 12, lineHeight: 20, fontWeight: '700', overflow: 'hidden' },
  stepBody: { flex: 1, gap: 6 },
  stepText: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: lh(19) },
  btn: { alignSelf: 'flex-start', backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
  btnGhost: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.purple, borderRadius: radius.widget, paddingHorizontal: 12, paddingVertical: 6 },
  btnGhostText: { color: colors.purpleDark, fontSize: fontSize.secondary },
  msg: { fontSize: fontSize.secondary, color: colors.purpleDark, lineHeight: lh(16) },
});
