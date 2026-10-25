import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { room } from '../constants/room';
import { AI_MODELS, type AIModel } from '../lib/ai';
import { getApiKey, getModelOption, maskKey, setApiKey, setModelOption } from '../lib/aiSettings';
import { isValidHHMM, lingDayKey, useLingSettings } from '../lib/ling/settings';
import {
  DEFAULT_IN_OS,
  getInOsText,
  LAYER_TITLES,
  loadInOsVersions,
  loadLayers,
  resetInOsText,
  saveInOsText,
  type InOsVersion,
  type Layers,
} from '../lib/ling/prompt';
import { trySamples } from '../lib/ling/brain';
import { useLingThread } from '../lib/ling/thread';
import { pendingOutbox, rescheduleAll, sendTestNotification, type OutboxItem } from '../lib/ling/proactive';
import { KIND_LABEL } from '../lib/ling/templates';
import { pushInOsToNotion } from '../lib/notion/sync';
import { useLingLock } from '../lib/ling/lock';
import { LingLockGate } from '../components/ling/LingLockGate';
import { PinPad } from '../components/ling/PinPad';

type SampleKind = 'miss_you' | 'mention' | 'reminder' | 'catch';
const SWITCH_TRACK = { false: room.line, true: '#C4B5D8' };
const SWITCH_THUMB = room.accent;
const SAMPLE_KINDS: SampleKind[] = ['miss_you', 'catch', 'reminder', 'mention'];

function fmt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <Pressable key={String(o.v)} style={[styles.segItem, o.v === value && styles.segOn]} onPress={() => onChange(o.v)}>
          <Text style={[styles.segText, o.v === value && styles.segTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function LingSettingsScreen() {
  return (
    <LingLockGate>
      <LingSettingsBody />
    </LingLockGate>
  );
}

function LingSettingsBody() {
  const { settings, model, load, update, setModel } = useLingSettings();
  const messages = useLingThread((s) => s.messages);
  const [layers, setLayers] = useState<Layers>({});
  const [inOs, setInOs] = useState<{ text: string; source: string; updatedAt: string | null }>({ text: DEFAULT_IN_OS, source: 'default', updatedAt: null });
  const [editing, setEditing] = useState<string | null>(null);
  const [versions, setVersions] = useState<InOsVersion[] | null>(null);
  const [samples, setSamples] = useState<{ kind: SampleKind; list: string[]; error?: string } | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [doubaoModel, setDoubaoModel] = useState('');
  const [quiet, setQuiet] = useState({ start: settings.quietStart, end: settings.quietEnd });
  const [pending, setPending] = useState<OutboxItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  /** 灵空间锁：set = 设新密码，off = 关之前先输现在的，change = 改之前先输现在的 */
  const [pinFlow, setPinFlow] = useState<'set' | 'off' | 'change' | null>(null);
  const lock = useLingLock();

  const refresh = useCallback(async () => {
    const s = await load();
    setQuiet({ start: s.quietStart, end: s.quietEnd });
    setLayers(await loadLayers());
    setInOs(await getInOsText());
    setPending(await pendingOutbox());
    setDoubaoModel((await getModelOption('doubao')) ?? '');
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    getApiKey(model).then((k) => setSavedKey(k));
    setKeyDraft('');
  }, [model]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  async function changeAndReschedule(patch: Parameters<typeof update>[0]) {
    await update(patch);
    await rescheduleAll().catch(() => []);
    setPending(await pendingOutbox());
  }

  async function saveKey() {
    await setApiKey(model, keyDraft);
    setSavedKey(keyDraft.trim() || null);
    setKeyDraft('');
    flash(keyDraft.trim() ? '存好了' : '已清除');
  }

  async function saveEditing() {
    if (editing == null) return;
    await saveInOsText(editing, '在 App 里改');
    setInOs(await getInOsText());
    setEditing(null);
    pushInOsToNotion().catch(() => {});
    flash('改好了，下一句就生效');
  }

  async function runSamples(kind: SampleKind, draft?: string) {
    setSampleBusy(true);
    setSamples({ kind, list: [] });
    try {
      const list = await trySamples(kind, draft ?? inOs.text, messages);
      setSamples({ kind, list });
    } catch (err) {
      setSamples({ kind, list: [], error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSampleBusy(false);
    }
  }

  const layerRows: { key: 'persona' | 'rules' | 'archive' | 'recent' }[] = [{ key: 'persona' }, { key: 'rules' }, { key: 'archive' }, { key: 'recent' }];
  const pausedToday = settings.pausedOn === lingDayKey(new Date(), settings.dayStartHour);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>灵的设定</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>灵读到的提示词</Text>
        <View style={styles.card}>
          {layerRows.map(({ key }) => {
            const snap = layers[key];
            return (
              <View key={key} style={styles.layerRow}>
                <Text style={styles.layerName}>{LAYER_TITLES[key]}</Text>
                <Text style={styles.layerSrc}>{snap?.text ? `Notion · ${fmt(snap.updatedAt)}` : '还没连 Notion，用默认版'}</Text>
              </View>
            );
          })}
          <View style={styles.layerRowCol}>
            <View style={styles.layerHead}>
              <Text style={styles.layerName}>{LAYER_TITLES.inOs}</Text>
              <Text style={styles.layerSrc}>
                {inOs.source === 'default' ? '默认版' : `改过 · ${fmt(inOs.updatedAt)}`}
              </Text>
            </View>
            <Text style={styles.preview} numberOfLines={3}>
              {inOs.text}
            </Text>
            <View style={styles.actionsRow}>
              <Pressable onPress={() => setEditing(inOs.text)}>
                <Text style={styles.link}>编辑</Text>
              </Pressable>
              <Pressable onPress={async () => setVersions(await loadInOsVersions())}>
                <Text style={styles.link}>历史版本</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  await resetInOsText();
                  setInOs(await getInOsText());
                  pushInOsToNotion().catch(() => {});
                  flash('回到默认版了');
                }}
              >
                <Text style={styles.link}>恢复默认</Text>
              </Pressable>
            </View>
          </View>
          <Pressable style={styles.notionRow} onPress={() => router.push('/memory')}>
            <Text style={styles.link}>让灵一直记住的事（存在这台手机上）›</Text>
          </Pressable>
          <Pressable style={styles.notionRow} onPress={() => router.push('/notion-connect')}>
            <Text style={styles.link}>连接 Notion，让灵读到人设、规矩和你的档案 ›</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>让灵试一句</Text>
        <View style={styles.card}>
          <View style={styles.chips}>
            {SAMPLE_KINDS.map((k) => (
              <Pressable key={k} style={[styles.chip, samples?.kind === k && styles.chipOn]} onPress={() => runSamples(k)} disabled={sampleBusy}>
                <Text style={[styles.chipText, samples?.kind === k && styles.chipTextOn]}>{KIND_LABEL[k]}</Text>
              </Pressable>
            ))}
          </View>
          {sampleBusy ? <Text style={styles.muted}>灵在想……</Text> : null}
          {samples?.error ? <Text style={styles.error}>{samples.error}</Text> : null}
          {samples?.list.map((s, i) => (
            <View key={i} style={styles.sample}>
              <Text style={styles.sampleText}>{s}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>什么时候找你</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>想你了，每天最多</Text>
            <Seg value={settings.enableMissYou ? settings.missYouPerDay : 0} options={[{ v: 0, label: '不发' }, { v: 1, label: '1 条' }, { v: 2, label: '2 条' }]} onChange={(v) => changeAndReschedule({ missYouPerDay: v, enableMissYou: v > 0 })} />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>顺口一提（每天最多一件）</Text>
            <Switch trackColor={SWITCH_TRACK} thumbColor={SWITCH_THUMB} value={settings.enableMention} onValueChange={(v) => changeAndReschedule({ enableMention: v })} />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>点了难过时接住你</Text>
            <Switch trackColor={SWITCH_TRACK} thumbColor={SWITCH_THUMB} value={settings.enableCatch} onValueChange={(v) => update({ enableCatch: v })} />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>今天别找我</Text>
            <Switch trackColor={SWITCH_TRACK} thumbColor={SWITCH_THUMB} value={pausedToday} onValueChange={(v) => changeAndReschedule({ pausedOn: v ? lingDayKey(new Date(), settings.dayStartHour) : null })} />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>免打扰</Text>
            <View style={styles.quietRow}>
              <TextInput
                style={styles.timeInput}
                value={quiet.start}
                onChangeText={(t) => setQuiet((q) => ({ ...q, start: t }))}
                onEndEditing={() => (isValidHHMM(quiet.start) ? changeAndReschedule({ quietStart: quiet.start }) : setQuiet((q) => ({ ...q, start: settings.quietStart })))}
                placeholder="00:30"
                placeholderTextColor={room.ink3}
              />
              <Text style={styles.muted}>到</Text>
              <TextInput
                style={styles.timeInput}
                value={quiet.end}
                onChangeText={(t) => setQuiet((q) => ({ ...q, end: t }))}
                onEndEditing={() => (isValidHHMM(quiet.end) ? changeAndReschedule({ quietEnd: quiet.end }) : setQuiet((q) => ({ ...q, end: settings.quietEnd })))}
                placeholder="10:30"
                placeholderTextColor={room.ink3}
              />
            </View>
          </View>
          <Text style={styles.hint}>约定提醒（你自己设的时间）不受免打扰和「今天别找我」影响，到点就响。</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>锁屏显示</Text>
            <Seg value={settings.lockScreen} options={[{ v: 'full', label: '全文' }, { v: 'hidden', label: '只显示「灵」' }]} onChange={(v) => changeAndReschedule({ lockScreen: v })} />
          </View>
        </View>

        <Text style={styles.section}>隐私</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>灵空间锁{lock.enabled ? '（开着）' : ''}</Text>
            {lock.enabled ? (
              <View style={styles.inlineLinks}>
                <Pressable onPress={() => setPinFlow('change')} hitSlop={8}>
                  <Text style={styles.link}>改密码</Text>
                </Pressable>
                <Pressable onPress={() => setPinFlow('off')} hitSlop={8} testID="lock-off">
                  <Text style={styles.link}>关掉</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setPinFlow('set')} hitSlop={8} testID="lock-set">
                <Text style={styles.link}>设密码</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.hint}>进「灵」和这一页要先输 4 位密码；App 一到后台就重新锁上。忘了密码可以在密码盘上点「忘了」，等 60 秒锁就关掉。</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>对话每月存进 Notion</Text>
            <Switch trackColor={SWITCH_TRACK} thumbColor={SWITCH_THUMB} value={settings.archiveChatToNotion} onValueChange={(v) => update({ archiveChatToNotion: v })} testID="archive-switch" />
          </View>
        </View>

        <Text style={styles.section}>接下来排了什么</Text>
        <View style={styles.card}>
          {pending.length === 0 ? <Text style={styles.muted}>现在没排。离开 App 时会按规矩排好。</Text> : null}
          {pending.map((p) => (
            <View key={p.id} style={styles.pendingRow}>
              <Text style={styles.pendingTime}>{fmt(p.fireAt)}</Text>
              <View style={styles.flex}>
                <Text style={styles.pendingKind}>{KIND_LABEL[p.kind as keyof typeof KIND_LABEL] ?? p.kind}</Text>
                <Text style={styles.pendingText} numberOfLines={2}>
                  {p.text}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.section}>大脑</Text>
        <View style={styles.card}>
          <Seg value={model} options={AI_MODELS.filter((m) => m.id !== 'gemini-flash').map((m) => ({ v: m.id, label: m.label }))} onChange={(v) => setModel(v as AIModel)} />
          <Text style={styles.hint}>
            {AI_MODELS.find((m) => m.id === model)?.needsProxy ? '这个在国内要开代理才能用。' : '国内直连，不用开代理。'}
            {savedKey ? ` 已填 key：${maskKey(savedKey)}` : ' 还没填 key。'}
          </Text>
          <View style={styles.keyRow}>
            <TextInput
              style={styles.keyInput}
              value={keyDraft}
              onChangeText={setKeyDraft}
              placeholder={AI_MODELS.find((m) => m.id === model)?.keyHint}
              placeholderTextColor={room.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Pressable style={styles.smallBtn} onPress={saveKey}>
              <Text style={styles.smallBtnText}>{keyDraft.trim() ? '保存' : '清除'}</Text>
            </Pressable>
          </View>
          {model === 'doubao' ? (
            <View style={styles.keyRow}>
              <TextInput
                style={styles.keyInput}
                value={doubaoModel}
                onChangeText={setDoubaoModel}
                onEndEditing={() => setModelOption('doubao', doubaoModel)}
                placeholder="模型名或接入点 ID（ep- 开头）"
                placeholderTextColor={room.ink3}
                autoCapitalize="none"
              />
            </View>
          ) : null}
        </View>

        <Text style={styles.section}>提醒自检</Text>
        <View style={styles.card}>
          <Pressable
            style={styles.wideBtn}
            onPress={async () => {
              const ok = await sendTestNotification().catch(() => false);
              flash(ok ? '10 秒后会响一条，先把 App 切到后台看看' : '没拿到通知权限，或者是在网页里');
            }}
          >
            <Text style={styles.wideBtnText}>10 秒后发一条测试通知</Text>
          </Pressable>
          <Text style={styles.hint}>
            收不到的话：系统设置 → 应用 → 西米OS，把「自启动」打开、「电池优化」改成「不限制」，通知里把「灵的消息」「约定提醒」都允许。小米、华为、OPPO、vivo 的叫法略有不同。
          </Text>
          <Pressable onPress={() => Linking.openSettings().catch(() => {})}>
            <Text style={styles.link}>打开 App 的系统设置 ›</Text>
          </Pressable>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={editing != null} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.header}>
              <Pressable onPress={() => setEditing(null)} hitSlop={10}>
                <Text style={styles.back}>取消</Text>
              </Pressable>
              <Text style={styles.title}>在西米OS里</Text>
              <Pressable onPress={saveEditing} hitSlop={10}>
                <Text style={styles.back}>保存</Text>
              </Pressable>
            </View>
            <View style={styles.editorTools}>
              <Pressable onPress={() => runSamples('miss_you', editing ?? '')} disabled={sampleBusy}>
                <Text style={styles.link}>用这版让灵试一句「想你了」</Text>
              </Pressable>
            </View>
            {samples && editing != null ? (
              <View style={styles.editorSamples}>
                {sampleBusy ? <Text style={styles.muted}>灵在想……</Text> : null}
                {samples.error ? <Text style={styles.error}>{samples.error}</Text> : null}
                {samples.list.map((s, i) => (
                  <Text key={i} style={styles.sampleText}>
                    · {s}
                  </Text>
                ))}
              </View>
            ) : null}
            <TextInput style={styles.editor} value={editing ?? ''} onChangeText={setEditing} multiline textAlignVertical="top" />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={versions != null} transparent animationType="fade" onRequestClose={() => setVersions(null)}>
        <Pressable style={styles.backdrop} onPress={() => setVersions(null)}>
          <Pressable style={styles.versionSheet} onPress={() => {}}>
            <Text style={styles.title}>历史版本</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {(versions ?? []).length === 0 ? <Text style={styles.muted}>还没改过。</Text> : null}
              {(versions ?? []).map((v, i) => (
                <Pressable
                  key={i}
                  style={styles.versionRow}
                  onPress={async () => {
                    await saveInOsText(v.text, `回到 ${fmt(v.savedAt)} 的版本`);
                    setInOs(await getInOsText());
                    setVersions(null);
                    pushInOsToNotion().catch(() => {});
                    flash('换回去了');
                  }}
                >
                  <Text style={styles.pendingTime}>
                    {fmt(v.savedAt)} · {v.note}
                  </Text>
                  <Text style={styles.pendingText} numberOfLines={2}>
                    {v.text}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.hint}>点一个版本就换回那一版。</Text>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={pinFlow != null} animationType="fade" onRequestClose={() => setPinFlow(null)}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          {pinFlow === 'set' ? (
            <PinPad
              key="set"
              mode="set"
              onCancel={() => setPinFlow(null)}
              onDone={async (pin) => {
                await lock.setPin(pin);
                setPinFlow(null);
                flash('锁好了，下次进来要输密码');
              }}
            />
          ) : pinFlow ? (
            <PinPad
              key="verify"
              mode="verify"
              onCancel={() => setPinFlow(null)}
              onDone={async () => {
                if (pinFlow === 'off') {
                  await lock.clearPin();
                  setPinFlow(null);
                  flash('锁关掉了');
                } else {
                  setPinFlow('set');
                }
              }}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: room.bg },
  inlineLinks: { flexDirection: 'row', gap: 16 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  back: { color: room.accent, fontSize: 14 },
  title: { color: room.ink, fontSize: 16, fontWeight: '700' },
  body: { paddingHorizontal: 16, paddingBottom: 30 },
  section: { color: room.ink3, fontSize: 12, marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: room.surface, borderRadius: 16, padding: 14, gap: 10 },
  layerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  layerRowCol: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: room.line, paddingTop: 10 },
  layerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  layerName: { color: room.ink, fontSize: 14, fontWeight: '600' },
  layerSrc: { color: room.ink3, fontSize: 11, flexShrink: 1, textAlign: 'right' },
  preview: { color: room.ink2, fontSize: 12, lineHeight: 18 },
  actionsRow: { flexDirection: 'row', gap: 16 },
  link: { color: room.accent, fontSize: 13 },
  notionRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: room.line, paddingTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: room.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: room.accent, backgroundColor: room.inset },
  chipText: { color: room.ink2, fontSize: 13 },
  chipTextOn: { color: room.accent },
  sample: { backgroundColor: room.inset, borderRadius: 12, borderTopLeftRadius: 4, padding: 10 },
  sampleText: { color: room.ink, fontSize: 14, lineHeight: 20 },
  muted: { color: room.ink3, fontSize: 12 },
  error: { color: room.danger, fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  rowLabel: { color: room.ink, fontSize: 14, flexShrink: 1 },
  hint: { color: room.ink3, fontSize: 11, lineHeight: 16 },
  seg: { flexDirection: 'row', backgroundColor: room.inset, borderRadius: 10, padding: 2, flexWrap: 'wrap' },
  segItem: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  segOn: { backgroundColor: room.accent },
  segText: { color: room.ink2, fontSize: 12 },
  segTextOn: { color: room.bg, fontWeight: '700' },
  quietRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeInput: { backgroundColor: room.inset, color: room.ink, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, width: 64, textAlign: 'center' },
  pendingRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  pendingTime: { color: room.ink3, fontSize: 11, width: 78 },
  pendingKind: { color: room.accent, fontSize: 11 },
  pendingText: { color: room.ink2, fontSize: 12 },
  keyRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  keyInput: { flex: 1, backgroundColor: room.inset, color: room.ink, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  smallBtn: { backgroundColor: room.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: room.bg, fontWeight: '700', fontSize: 13 },
  wideBtn: { backgroundColor: room.inset, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  wideBtnText: { color: room.ink, fontSize: 14 },
  toast: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: room.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  toastText: { color: room.bg, fontWeight: '700' },
  editorTools: { paddingHorizontal: 16, paddingBottom: 6 },
  editorSamples: { paddingHorizontal: 16, gap: 4, paddingBottom: 8 },
  editor: { flex: 1, margin: 12, backgroundColor: room.surface, borderWidth: 1, borderColor: room.line, color: room.ink, borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 21 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  versionSheet: { backgroundColor: room.surface, borderRadius: 16, padding: 16, gap: 10 },
  versionRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: room.line, gap: 2 },
});
