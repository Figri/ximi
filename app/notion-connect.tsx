import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { getNotionToken, notionRequest, setNotionToken } from '../lib/notion/client';
import { allRequiredOk, discover, loadNotionIds, runChecks, saveNotionIds, EMPTY_IDS, type CheckItem } from '../lib/notion/discover';
import { backupToNotion, JOB_LABELS, listBackups, loadSyncStatus, readBackup, syncAll, type BackupRow, type JobKey, type SyncStatus } from '../lib/notion/sync';
import { importBackup, parseBackup } from '../lib/backup';

// Notion 连接向导（需求文档 §8.10）+ 同步状态 + 备份与恢复。
// OS 不改 Notion 的结构（D10），只检查：缺什么告诉你在哪加、叫什么、选什么类型。

const INTEGRATIONS_URL = 'https://www.notion.so/profile/integrations';

function fmt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function NotionConnectScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<CheckItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [backups, setBackups] = useState<BackupRow[] | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BackupRow | null>(null);
  const [showAllChecks, setShowAllChecks] = useState(false);

  const refresh = useCallback(async () => {
    setToken(await getNotionToken());
    setStatus(await loadSyncStatus());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function saveToken() {
    const t = draft.trim();
    if (!t) return;
    setError(null);
    setChecking(true);
    try {
      await notionRequest('/users/me', { token: t });
      await setNotionToken(t);
      setToken(t);
      setDraft('');
      await runCheck();
    } catch (err) {
      setError(`这个密钥用不了：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setChecking(false);
    }
  }

  async function runCheck() {
    setChecking(true);
    setError(null);
    try {
      const ids = await discover();
      setChecks(await runChecks(ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  async function runSync() {
    setSyncing(true);
    try {
      setStatus(await syncAll(true));
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    await setNotionToken(null);
    await saveNotionIds({ ...EMPTY_IDS });
    setToken(null);
    setChecks(null);
  }

  async function doRestore(row: BackupRow) {
    setConfirmRestore(null);
    setRestoreMsg('正在读备份……');
    try {
      const json = await readBackup(row.id);
      parseBackup(json);
      const { counts } = await importBackup(json);
      const n = Object.values(counts).reduce((a, b) => a + b, 0);
      setRestoreMsg(`恢复好了，一共 ${n} 条。马上重开一下 App。`);
      setTimeout(() => {
        if (Platform.OS === 'web') (globalThis as any).location?.reload();
        else Updates.reloadAsync().catch(() => {});
      }, 1500);
    } catch (err) {
      setRestoreMsg(`恢复失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const ready = checks ? allRequiredOk(checks) : false;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>Notion</Text>
        <View style={{ width: 50 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!token ? (
          <>
            <Text style={styles.lead}>连上之后：灵读得到你的人设、规矩和档案；状态、每天的数字、对话和备份自动进 Notion。</Text>
            <View style={styles.step}>
              <Text style={styles.stepNo}>1</Text>
              <View style={styles.flex}>
                <Text style={styles.stepText}>在 Notion 新建一个内部集成，名字叫「西米OS」，复制它的密钥（secret_ 或 ntn_ 开头）。</Text>
                <Pressable onPress={() => Linking.openURL(INTEGRATIONS_URL).catch(() => {})}>
                  <Text style={styles.link}>打开 Notion 集成页 ›</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNo}>2</Text>
              <Text style={[styles.stepText, styles.flex]}>打开「💓 2026」，右上角 ⋯ → 连接 → 选「西米OS」。下面的库和页面会一起连上。</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNo}>3</Text>
              <View style={styles.flex}>
                <Text style={styles.stepText}>把密钥粘贴到这里：</Text>
                <View style={styles.keyRow}>
                  <TextInput
                    style={styles.input}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="secret_… 或 ntn_…"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />
                  <Pressable style={styles.btn} onPress={saveToken} disabled={checking || !draft.trim()}>
                    <Text style={styles.btnText}>连接</Text>
                  </Pressable>
                </View>
              </View>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNo}>4</Text>
              <Text style={[styles.stepText, styles.flex]}>App 自动找到日记、状态日志、计划与待办、系统规则、灵·人设这些，逐条检查。缺什么会告诉你去哪加。</Text>
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>已连接</Text>
            <View style={styles.row}>
              <Pressable style={styles.btnGhost} onPress={runCheck} disabled={checking}>
                <Text style={styles.btnGhostText}>{checks ? '再检查一次' : '检查一下'}</Text>
              </Pressable>
              <Pressable style={styles.btnGhost} onPress={disconnect}>
                <Text style={styles.btnGhostText}>断开</Text>
              </Pressable>
            </View>
          </View>
        )}

        {checking ? <ActivityIndicator color={colors.purpleDark} style={{ marginTop: 12 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {checks ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{ready ? '都齐了，可以同步' : '还差几样'}</Text>
            {/* 没问题的那几十项默认收起来，只摆出缺的 */}
            {checks
              .filter((c) => showAllChecks || !c.ok)
              .map((c) => (
                <View key={c.key} style={styles.checkRow}>
                  <Text style={[styles.mark, c.ok ? styles.ok : c.required ? styles.bad : styles.warn]}>{c.ok ? '✓' : c.required ? '✗' : '·'}</Text>
                  <View style={styles.flex}>
                    <Text style={styles.checkLabel}>{c.label}</Text>
                    {!c.ok && c.hint ? <Text style={styles.checkHint}>{c.hint}</Text> : null}
                  </View>
                </View>
              ))}
            <Pressable onPress={() => setShowAllChecks((v) => !v)} hitSlop={6}>
              <Text style={styles.link}>{showAllChecks ? '收起' : `其余 ${checks.filter((c) => c.ok).length} 项都没问题 ›`}</Text>
            </Pressable>
          </View>
        ) : null}

        {token ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>同步</Text>
            <Text style={styles.muted}>{status?.lastRunAt ? `上次 ${fmt(status.lastRunAt)}` : '还没同步过'}</Text>
            {(Object.keys(JOB_LABELS) as JobKey[]).map((k) => {
              const j = status?.jobs[k];
              return (
                <View key={k} style={styles.checkRow}>
                  <Text style={[styles.mark, !j ? styles.warn : j.ok ? styles.ok : styles.bad]}>{!j ? '·' : j.ok ? '✓' : '✗'}</Text>
                  <View style={styles.flex}>
                    <Text style={styles.checkLabel}>{JOB_LABELS[k]}</Text>
                    {j ? <Text style={styles.checkHint}>{j.ok ? j.detail : j.error}</Text> : null}
                  </View>
                </View>
              );
            })}
            <Pressable style={styles.btn} onPress={runSync} disabled={syncing}>
              <Text style={styles.btnText}>{syncing ? '同步中……' : '立即同步'}</Text>
            </Pressable>
          </View>
        ) : null}

        {token ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>备份与恢复</Text>
            <Text style={styles.muted}>每周自动备份一次到「💾 西米OS 备份」。换手机或清了数据，从这里选一份恢复。</Text>
            <View style={styles.row}>
              <Pressable
                style={styles.btnGhost}
                onPress={async () => {
                  setRestoreMsg('备份中……');
                  try {
                    setRestoreMsg(await backupToNotion(true));
                  } catch (err) {
                    setRestoreMsg(`备份失败：${err instanceof Error ? err.message : String(err)}`);
                  }
                }}
              >
                <Text style={styles.btnGhostText}>现在备份一次</Text>
              </Pressable>
              <Pressable
                style={styles.btnGhost}
                onPress={async () => {
                  try {
                    setBackups(await listBackups());
                  } catch (err) {
                    setRestoreMsg(err instanceof Error ? err.message : String(err));
                  }
                }}
              >
                <Text style={styles.btnGhostText}>从 Notion 恢复</Text>
              </Pressable>
            </View>
            {restoreMsg ? <Text style={styles.muted}>{restoreMsg}</Text> : null}
            {backups?.map((b) => (
              <View key={b.id} style={styles.backupRow}>
                <Text style={[styles.checkLabel, styles.flex]}>{b.title || b.date}</Text>
                {confirmRestore?.id === b.id ? (
                  <View style={styles.row}>
                    <Pressable onPress={() => doRestore(b)}>
                      <Text style={styles.danger}>确定替换</Text>
                    </Pressable>
                    <Pressable onPress={() => setConfirmRestore(null)}>
                      <Text style={styles.link}>算了</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setConfirmRestore(b)}>
                    <Text style={styles.link}>用这份</Text>
                  </Pressable>
                )}
              </View>
            ))}
            {backups && !backups.length ? <Text style={styles.muted}>还没有备份。</Text> : null}
            {confirmRestore ? <Text style={styles.checkHint}>恢复会用这份备份替换手机里现在的数据（替换前会自动留一份底）。</Text> : null}
          </View>
        ) : null}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 10 },
  back: { color: colors.purpleDark, fontSize: 14 },
  title: { color: colors.textPrimary, fontSize: fontSize.pageTitle, fontWeight: '700' },
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
  lead: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  step: { flexDirection: 'row', gap: 10, backgroundColor: colors.card, borderRadius: radius.card, padding: 12 },
  stepNo: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.purpleLight, color: colors.purpleDark, textAlign: 'center', lineHeight: 22, fontWeight: '700', overflow: 'hidden' },
  stepText: { color: colors.textPrimary, fontSize: 13, lineHeight: 20 },
  link: { color: colors.purpleDark, fontSize: 13, marginTop: 6 },
  danger: { color: colors.redDark, fontSize: 13, marginTop: 6, fontWeight: '700' },
  keyRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  input: { flex: 1, backgroundColor: colors.background, borderRadius: radius.widget, paddingHorizontal: 10, paddingVertical: 8, color: colors.textPrimary, fontSize: 13 },
  btn: { backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnGhost: { borderWidth: 1, borderColor: colors.purple, borderRadius: radius.widget, paddingHorizontal: 12, paddingVertical: 7 },
  btnGhostText: { color: colors.purpleDark, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 14, gap: 10 },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  checkRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  mark: { width: 16, fontWeight: '700', fontSize: 14 },
  ok: { color: colors.greenDark },
  bad: { color: colors.redDark },
  warn: { color: colors.textMuted },
  checkLabel: { color: colors.textPrimary, fontSize: 13 },
  checkHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  muted: { color: colors.textMuted, fontSize: 12 },
  error: { color: colors.redDark, fontSize: 12 },
  backupRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
});
