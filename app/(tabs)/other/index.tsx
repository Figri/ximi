import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import * as Updates from 'expo-updates';
import { colors, currentFontScale, FONT_SCALES, fontSize, lh, radius, spacing, type FontScaleKey } from '../../../constants/theme';
import { loadUiSettings, saveUiSettings } from '../../../lib/uiSettings';
import { ASSIGNABLE_KEYS, FEATURE_BY_KEY, type Feature } from '../../../lib/features';
import { useLayoutStore } from '../../../lib/layoutStore';
import { getMigrationState, localLegacyCounts, runLegacyMigration } from '../../../lib/legacyMigration';
import { CaptureFab } from '../../../components/capture/CaptureFab';
import { clearCrashes, loadCrashes, markSessionBackground, type CrashEntry } from '../../../lib/crashLog';
import { loadNotionIds } from '../../../lib/notion/discover';

const ICON_SIZE = 60;
const DIVIDER_SENTINEL = '__divider__';

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatTime(date: Date | null) {
  if (!date) return '未知';
  return date.toLocaleString('zh-CN', { hour12: false });
}

/** 浏览态用的圆形图标——视觉对齐今天页「该照顾的」的格子，纯展示+点击跳转，不做完成态 */
function FeatureIcon({ feature, onPress }: { feature: Feature; onPress: () => void }) {
  return (
    <Pressable style={styles.iconWrapper} onPress={onPress}>
      <View style={styles.iconCircle}>
        <Text style={styles.iconEmoji}>{feature.icon}</Text>
      </View>
      <Text style={styles.iconLabel} numberOfLines={1}>
        {feature.label}
      </Text>
    </Pressable>
  );
}

export default function OtherScreen() {
  const { topKeys, save } = useLayoutStore();
  const [mode, setMode] = useState<'browse' | 'edit'>('browse');
  const [editData, setEditData] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const [checking, setChecking] = useState(false);
  // 检查更新的结果写在按钮下面，不弹系统框；下好了多一个「现在重启」
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

  const [migrationText, setMigrationText] = useState('读取中……');
  const [migrating, setMigrating] = useState(false);
  const [crashes, setCrashes] = useState<CrashEntry[]>([]);
  // 字号：选了就存，重启后生效（页面样式是打开时按当时的字号生成的）
  const [fontKey, setFontKey] = useState<FontScaleKey>('standard');
  const appliedKey = FONT_SCALES.find((f) => f.scale === currentFontScale())?.key ?? 'standard';
  useEffect(() => {
    loadUiSettings().then((s) => setFontKey(s.fontScale));
  }, []);
  async function pickFont(k: FontScaleKey) {
    setFontKey(k);
    await saveUiSettings({ fontScale: k });
  }

  // 出错记录：每次回到这一页都重新读，刚出的错马上能看到
  useFocusEffect(
    useCallback(() => {
      loadCrashes().then(setCrashes);
    }, [])
  );

  useEffect(() => {
    loadMigration();
  }, []);

  async function loadMigration() {
    const state = await getMigrationState();
    const local = await localLegacyCounts();
    const have = `手机里现在有：习惯卡片 ${local.cards}、打卡记录 ${local.completions}、猫 ${local.cats}、旧聊天 ${local.messages}。`;
    if (!state) setMigrationText(`还没搬过。${have}`);
    else if (state.status === 'done') setMigrationText(`${fmtTime(state.at)} 搬完了。${have}旧 Supabase 库可以去控制台删掉了。`);
    else if (state.status === 'skipped') setMigrationText(`不搬了（${state.error ?? ''}）。${have}`);
    else setMigrationText(`还没搬成功，下次打开会再试（${state.error ?? '连不上'}）。${have}`);
  }

  async function handleRemigrate() {
    setMigrating(true);
    try {
      await runLegacyMigration(true);
      await loadMigration();
    } finally {
      setMigrating(false);
    }
  }

  async function handleCheckUpdate() {
    if (checking) return;
    setChecking(true);
    setUpdateMsg(null);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setUpdateMsg('已经是最新的了');
        return;
      }
      await Updates.fetchUpdateAsync();
      setUpdateReady(true);
      setUpdateMsg('新版本下好了，重启一下就用上');
    } catch (err) {
      setUpdateMsg(`没检查成：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setChecking(false);
    }
  }

  const bottomKeys = ASSIGNABLE_KEYS.filter((k) => !topKeys.includes(k));

  function enterEdit() {
    setEditData([...topKeys, DIVIDER_SENTINEL, ...bottomKeys]);
    setMode('edit');
  }

  function handleCancelEdit() {
    setMode('browse');
  }

  function showToast(text: string) {
    setToast(text);
    toastOpacity.setValue(1);
    Animated.timing(toastOpacity, { toValue: 0, duration: 400, delay: 1200, useNativeDriver: true }).start(() => setToast(null));
  }

  async function handleSaveEdit() {
    const top3 = editData.filter((k) => k !== DIVIDER_SENTINEL).slice(0, 3);
    await save(top3);
    setMode('browse');
    showToast('已保存');
  }

  // 插入式拖动：divider哨兵始终被过滤掉再按"前3/其余"重新切一刀插回原位置，
  // 它自己从不参与拖拽判定（renderItem没给它接onLongPress={drag}），纯靠这里
  // 每次重新摆放位置来"钉"在第3项后面——不管前面拖成什么样，它永远紧跟在
  // 当前的前3个后面，天然实现"挤出第3个→新的候选自动顶上来"
  function handleDragEnd({ data }: { data: string[] }) {
    const withoutDivider = data.filter((k) => k !== DIVIDER_SENTINEL);
    const top3 = withoutDivider.slice(0, 3);
    const rest = withoutDivider.slice(3);
    setEditData([...top3, DIVIDER_SENTINEL, ...rest]);
  }

  function renderEditItem({ item, drag, isActive }: RenderItemParams<string>) {
    if (item === DIVIDER_SENTINEL) {
      return (
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>更多功能</Text>
          <View style={styles.dividerLine} />
        </View>
      );
    }
    const feature = FEATURE_BY_KEY[item];
    return (
      <ScaleDecorator>
        <Pressable
          style={[styles.editRow, isActive && styles.editRowActive]}
          onLongPress={drag}
          delayLongPress={150}
        >
          <Text style={styles.editRowEmoji}>{feature.icon}</Text>
          <Text style={styles.editRowLabel}>{feature.label}</Text>
          <Text style={styles.editRowHandle}>⠿</Text>
        </Pressable>
      </ScaleDecorator>
    );
  }

  if (mode === 'edit') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleCancelEdit}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
          <Text style={styles.pageTitle}>调整底栏</Text>
          <Pressable onPress={handleSaveEdit}>
            <Text style={styles.saveText}>保存</Text>
          </Pressable>
        </View>
        <DraggableFlatList
          data={editData}
          keyExtractor={(k) => k}
          renderItem={renderEditItem}
          onDragEnd={handleDragEnd}
          contentContainerStyle={styles.editListContent}
          ListHeaderComponent={<Text style={styles.sectionLabel}>底栏显示（长按拖动排序，拖到下面会被换下去）</Text>}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>其他</Text>
        <Pressable onPress={enterEdit}>
          <Text style={styles.editText}>编辑</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionLabel}>底栏显示</Text>
        <View style={styles.grid}>
          {topKeys.map((k) => (
            <FeatureIcon key={k} feature={FEATURE_BY_KEY[k]} onPress={() => router.push(FEATURE_BY_KEY[k].route as any)} />
          ))}
        </View>

        <View style={styles.sectionDivider} />

        <Text style={styles.sectionLabel}>更多功能</Text>
        <View style={styles.grid}>
          {bottomKeys.map((k) => (
            <FeatureIcon key={k} feature={FEATURE_BY_KEY[k]} onPress={() => router.push(FEATURE_BY_KEY[k].otherRoute as any)} />
          ))}
        </View>

        <View style={styles.sectionDivider} />

        <Text style={styles.sectionLabel}>笔记</Text>
        <Pressable
          style={styles.templateLinkRow}
          onPress={async () => {
            // 笔记不在 App 里记了，直接去 Notion「知识 / 笔记」；没连上那个库就打开 Notion 首页
            const ids = await loadNotionIds();
            Linking.openURL(ids.notesDb ? `https://www.notion.so/${ids.notesDb.replace(/-/g, '')}` : 'https://www.notion.so').catch(() => {});
          }}
          testID="open-notion-notes"
        >
          <Text style={styles.templateLinkText}>📝 笔记在 Notion「知识 / 笔记」里记</Text>
          <Text style={styles.moreArrow}>›</Text>
        </Pressable>

        <View style={styles.sectionDivider} />

        <Text style={styles.sectionLabel}>设置</Text>
        <View style={styles.fontRow}>
          <Text style={styles.templateLinkText}>🔠 字号</Text>
          <View style={styles.fontChips}>
            {FONT_SCALES.map((f) => (
              <Pressable key={f.key} style={[styles.fontChip, fontKey === f.key && styles.fontChipOn]} onPress={() => pickFont(f.key)} testID={`font-${f.key}`} aria-selected={fontKey === f.key}>
                <Text style={[styles.fontChipText, fontKey === f.key && styles.fontChipTextOn]}>{f.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {fontKey !== appliedKey ? (
          <View style={styles.fontNote}>
            <Text style={styles.updateMsg}>重启一下 App 就换成「{FONT_SCALES.find((f) => f.key === fontKey)?.label}」了（格子、日期条、底栏这些不跟着变）</Text>
            <Pressable
              style={styles.checkButton}
              onPress={() => {
                markSessionBackground();
                if (typeof window !== 'undefined' && (window as any).location?.reload && !Updates.isEnabled) (window as any).location.reload();
                else Updates.reloadAsync().catch((err) => setUpdateMsg(`没重启成：${err instanceof Error ? err.message : String(err)}，手动关掉再打开就行`));
              }}
              testID="font-restart"
            >
              <Text style={styles.checkButtonText}>现在重启</Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable style={styles.templateLinkRow} onPress={() => router.push('/reminders')} testID="open-reminders">
          <Text style={styles.templateLinkText}>🔔 提醒（喝水、收不到怎么办）</Text>
          <Text style={styles.moreArrow}>›</Text>
        </Pressable>
        <Pressable style={styles.templateLinkRow} onPress={() => router.push('/schedule-template')}>
          <Text style={styles.templateLinkText}>📅 日常作息模板</Text>
          <Text style={styles.moreArrow}>›</Text>
        </Pressable>
        <Pressable style={styles.templateLinkRow} onPress={() => router.push('/ling-settings')}>
          <Text style={styles.templateLinkText}>💜 灵的设定（大脑、频率、提示词、提醒自检）</Text>
          <Text style={styles.moreArrow}>›</Text>
        </Pressable>
        <Pressable style={styles.templateLinkRow} onPress={() => router.push('/notion-connect')}>
          <Text style={styles.templateLinkText}>🗂 Notion 连接、同步、备份与恢复</Text>
          <Text style={styles.moreArrow}>›</Text>
        </Pressable>
        <Pressable style={styles.templateLinkRow} onPress={() => router.push('/memory')}>
          <Text style={styles.templateLinkText}>🧠 让灵一直记住的事（本机）</Text>
          <Text style={styles.moreArrow}>›</Text>
        </Pressable>

        <Text style={[styles.settingsSubLabel, { marginTop: spacing.lg }]}>旧数据搬家</Text>
        <View style={styles.versionCard}>
          <Text style={styles.versionValue}>{migrationText}</Text>
          <Pressable style={styles.checkButton} onPress={handleRemigrate} disabled={migrating}>
            {migrating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.checkButtonText}>再搬一次</Text>}
          </Pressable>
        </View>

        {crashes.length ? (
          <>
            <Text style={[styles.settingsSubLabel, { marginTop: spacing.lg }]}>出错记录（截图发给灵，对着修）</Text>
            <View style={styles.versionCard}>
              {crashes.slice(0, 5).map((c, i) => (
                <View key={`${c.at}-${i}`} style={styles.crashRow}>
                  <Text style={styles.crashHead}>
                    {fmtTime(c.at)} · {c.kind === 'render' ? '页面出错' : c.kind === 'fatal' ? '程序出错' : '突然退出'} · {c.route}
                  </Text>
                  <Text style={styles.crashMsg} selectable>
                    {c.message}
                  </Text>
                  {c.stack ? (
                    <Text style={styles.crashStack} selectable numberOfLines={6}>
                      {c.stack}
                    </Text>
                  ) : null}
                </View>
              ))}
              <Pressable
                style={styles.checkButton}
                onPress={async () => {
                  await clearCrashes();
                  setCrashes([]);
                }}
                testID="crash-clear"
              >
                <Text style={styles.checkButtonText}>清空记录</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        <Text style={[styles.settingsSubLabel, { marginTop: spacing.lg }]}>版本信息</Text>
        <View style={styles.versionCard}>
          <View style={styles.versionRow}>
            <Text style={styles.versionKey}>更新时间</Text>
            <Text style={styles.versionValue}>{formatTime(Updates.createdAt)}</Text>
          </View>
          {Updates.isEmbeddedLaunch && (
            <Text style={styles.versionWarning}>⚠️ 当前运行的是安装包自带版本，还没有应用过任何 OTA 更新</Text>
          )}
          <Pressable style={styles.checkButton} onPress={handleCheckUpdate} disabled={checking} testID="check-update">
            {checking ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.checkButtonText}>检查更新</Text>}
          </Pressable>
          {updateMsg ? <Text style={styles.updateMsg}>{updateMsg}</Text> : null}
          {updateReady ? (
            <Pressable
              style={styles.checkButton}
              onPress={() => {
                // 自己点的重启不算「用着用着没了」
                markSessionBackground();
                Updates.reloadAsync().catch((err) => setUpdateMsg(`没重启成：${err instanceof Error ? err.message : String(err)}`));
              }}
              testID="update-restart"
            >
              <Text style={styles.checkButtonText}>现在重启</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {toast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}
      <CaptureFab />
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
    paddingBottom: spacing.sm,
  },
  pageTitle: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  editText: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '600' },
  cancelText: { fontSize: fontSize.body, color: colors.textMuted },
  saveText: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '700' },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 3 },
  sectionLabel: { fontSize: fontSize.secondary, color: colors.textSecondary, marginBottom: spacing.sm, fontWeight: '600' },
  settingsSubLabel: { fontSize: fontSize.secondary, color: colors.textSecondary, marginBottom: spacing.sm },
  sectionDivider: { height: 1, backgroundColor: colors.card, marginVertical: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  iconWrapper: { width: ICON_SIZE + 16, alignItems: 'center' },
  iconCircle: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: radius.avatar,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: { fontSize: 26, lineHeight: 30, includeFontPadding: false },
  iconLabel: {
    fontSize: fontSize.tiny,
    color: colors.textSecondary,
    marginTop: 4,
    maxWidth: ICON_SIZE + 16,
    textAlign: 'center',
  },
  templateLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  templateLinkText: { fontSize: fontSize.body, color: colors.textPrimary },
  moreArrow: { fontSize: fontSize.cardName, color: colors.textMuted },
  versionCard: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  versionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  versionKey: { fontSize: fontSize.secondary, color: colors.textMuted },
  versionValue: { fontSize: fontSize.secondary, color: colors.textPrimary, fontWeight: '600' },
  versionWarning: { fontSize: fontSize.secondary, color: colors.redDark, lineHeight: lh(18) },
  checkButton: { marginTop: spacing.xs, backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingVertical: spacing.sm, alignItems: 'center' },
  crashRow: { gap: 3, paddingBottom: spacing.sm, marginBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.purpleLight },
  crashHead: { fontSize: fontSize.tiny, color: colors.textMuted },
  crashMsg: { fontSize: fontSize.secondary, color: colors.redDark, lineHeight: lh(16) },
  crashStack: { fontSize: 10, color: colors.textSecondary, lineHeight: 14 },
  checkButtonText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
  updateMsg: { fontSize: fontSize.secondary, color: colors.textSecondary, lineHeight: lh(18) },
  fontRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  fontChips: { flexDirection: 'row', gap: 6 },
  fontChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.button, backgroundColor: colors.background },
  fontChipOn: { backgroundColor: colors.purpleDark },
  fontChipText: { fontSize: 13, color: colors.textSecondary },
  fontChipTextOn: { color: '#fff', fontWeight: '700' },
  fontNote: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs, marginBottom: spacing.sm },

  // 编辑态：单列表（react-native-draggable-flatlist 这个版本不支持numColumns网格拖拽，
  // 浏览态照常是网格，编辑态为了保证"插入式"拖拽判定准确可靠，改成单列——这是经过
  // 核实的库限制，不是图省事砍掉的，交付说明里会说清楚）
  editListContent: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    marginBottom: spacing.xs,
    gap: spacing.md,
  },
  editRowActive: { opacity: 0.85 },
  editRowEmoji: { fontSize: 20 },
  editRowLabel: { flex: 1, fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  editRowHandle: { fontSize: 18, color: colors.textMuted },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.card },
  dividerLabel: { fontSize: fontSize.secondary, color: colors.textSecondary, fontWeight: '600' },

  toast: {
    position: 'absolute',
    bottom: spacing.xl * 2,
    alignSelf: 'center',
    backgroundColor: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
  },
  toastText: { color: '#fff', fontSize: fontSize.body },
});
