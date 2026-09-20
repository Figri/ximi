import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import {
  addPeriodEvent,
  fetchLastWeight,
  fetchPeriodHistory,
  logExercise,
  logWeight,
  predictNextPeriod,
  type PeriodEvent,
} from '../lib/toolbox';
import { addCatEvent, fetchLastCatWeights } from '../lib/cats';
import { cancelTimerNotification, ensureNotificationPermission, scheduleTimerNotification } from '../lib/notifications';
import { useCardStore } from '../lib/store';

type ToolKind = 'weight' | 'period' | 'exercise' | 'timer' | null;

const TOOL_ITEMS: { kind: Exclude<ToolKind, null>; emoji: string; label: string }[] = [
  { kind: 'weight', emoji: '⚖️', label: '体重' },
  { kind: 'period', emoji: '🩸', label: '生理期' },
  { kind: 'exercise', emoji: '💪', label: '运动' },
  { kind: 'timer', emoji: '⏱', label: '计时器' },
];

export function ToolboxGrid({ onClose }: { onClose: () => void }) {
  const [openTool, setOpenTool] = useState<ToolKind>(null);

  return (
    <View style={styles.grid}>
      {TOOL_ITEMS.map((item) => (
        <Pressable key={item.kind} style={styles.gridItem} onPress={() => setOpenTool(item.kind)}>
          <Text style={styles.gridEmoji}>{item.emoji}</Text>
          <Text style={styles.gridLabel}>{item.label}</Text>
        </Pressable>
      ))}
      <ToolModal
        kind={openTool}
        onClose={() => {
          setOpenTool(null);
          onClose();
        }}
      />
    </View>
  );
}

function ToolModal({ kind, onClose }: { kind: ToolKind; onClose: () => void }) {
  return (
    <Modal visible={kind !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {kind === 'weight' && <WeightTool onDone={onClose} />}
          {kind === 'period' && <PeriodTool onDone={onClose} />}
          {kind === 'exercise' && <ExerciseTool onDone={onClose} />}
          {kind === 'timer' && <TimerTool onDone={onClose} />}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetTitle({ children }: { children: string }) {
  return <Text style={styles.sheetTitle}>{children}</Text>;
}

function WeightTool({ onDone }: { onDone: () => void }) {
  const cats = useCardStore((s) => s.cats);
  const [myWeight, setMyWeight] = useState('');
  const [myLast, setMyLast] = useState<{ kg: number; date: string } | null>(null);
  const [savingMy, setSavingMy] = useState(false);

  const [aloneInputs, setAloneInputs] = useState<Record<string, string>>({});
  const [heldInputs, setHeldInputs] = useState<Record<string, string>>({});
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    fetchLastWeight().then(setMyLast).catch(() => {});
  }, []);

  async function handleSaveMy() {
    const kg = Number(myWeight);
    if (!myWeight || Number.isNaN(kg) || kg <= 0) {
      Alert.alert('填个数字', '比如 55.5');
      return;
    }
    setSavingMy(true);
    try {
      await logWeight(kg);
      setMyLast({ kg, date: new Date().toISOString() });
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSavingMy(false);
    }
  }

  async function handleSaveAll() {
    const myRef = myWeight ? Number(myWeight) : myLast?.kg ?? null;
    const hasHeld = cats.some((c) => heldInputs[c.id]?.trim());
    if (hasHeld && !myRef) {
      Alert.alert('先填我的体重', '抱着称需要先知道你自己的体重才能减出猫的重量');
      return;
    }

    const toSave: { catId: string; kg: number }[] = [];
    for (const cat of cats) {
      const aloneRaw = aloneInputs[cat.id]?.trim();
      const heldRaw = heldInputs[cat.id]?.trim();
      if (aloneRaw && !Number.isNaN(Number(aloneRaw))) {
        toSave.push({ catId: cat.id, kg: Number(aloneRaw) });
      } else if (heldRaw && !Number.isNaN(Number(heldRaw))) {
        toSave.push({ catId: cat.id, kg: Math.round((Number(heldRaw) - (myRef ?? 0)) * 10) / 10 });
      }
    }
    if (toSave.length === 0) {
      Alert.alert('还没填猫的体重', '单独称/抱着称两列填一列就行');
      return;
    }

    setSavingAll(true);
    try {
      for (const item of toSave) {
        await addCatEvent(item.catId, { event_type: '体重', value: item.kg, event_date: new Date().toISOString() });
      }
      onDone();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSavingAll(false);
    }
  }

  return (
    <View>
      <View style={styles.weightTitleRow}>
        <SheetTitle>⚖️ 记录体重</SheetTitle>
        {myLast && (
          <Text style={styles.hint}>
            上次：{myLast.kg}kg（
            {new Date(myLast.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}）
          </Text>
        )}
      </View>

      <View style={styles.weightInputRow}>
        <Text style={styles.catWeightLabel}>👤 我的体重</Text>
        <TextInput
          style={[styles.input, styles.weightInputFlex]}
          value={myWeight}
          onChangeText={setMyWeight}
          placeholder="kg"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
        />
        <Pressable style={styles.weightSaveOneButton} onPress={handleSaveMy} disabled={savingMy}>
          <Text style={styles.saveButtonText}>{savingMy ? '…' : '保存'}</Text>
        </Pressable>
      </View>

      {cats.length > 0 && (
        <>
          <Text style={[styles.weightSectionLabel, { marginTop: spacing.md }]}>── 🐱 猫猫 ──</Text>
          <View style={styles.weightColumnHeaderRow}>
            <Text style={styles.catWeightLabel} />
            <Text style={styles.weightColumnHeader}>单独称</Text>
            <Text style={styles.weightColumnHeader}>抱着称</Text>
          </View>
          {cats.map((cat) => (
            <View key={cat.id} style={styles.weightInputRow}>
              <Text style={styles.catWeightLabel} numberOfLines={1}>
                😺{cat.name}
              </Text>
              <TextInput
                style={[styles.input, styles.weightInputFlex]}
                value={aloneInputs[cat.id] ?? ''}
                onChangeText={(text) => setAloneInputs((prev) => ({ ...prev, [cat.id]: text }))}
                placeholder="kg"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, styles.weightInputFlex]}
                value={heldInputs[cat.id] ?? ''}
                onChangeText={(text) => setHeldInputs((prev) => ({ ...prev, [cat.id]: text }))}
                placeholder="总重kg"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>
          ))}

          <Pressable style={styles.saveButton} onPress={handleSaveAll} disabled={savingAll}>
            <Text style={styles.saveButtonText}>{savingAll ? '保存中…' : '保存全部'}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function PeriodTool({ onDone }: { onDone: () => void }) {
  const [history, setHistory] = useState<PeriodEvent[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchPeriodHistory().then(setHistory).catch(() => {});
  }, []);

  const prediction = predictNextPeriod(history);
  const lastEvent = history[history.length - 1];
  const isOngoing = lastEvent?.type === 'start';

  async function handleMark(type: 'start' | 'end') {
    setBusy(true);
    try {
      const next = await addPeriodEvent(type);
      setHistory(next);
    } catch (err) {
      Alert.alert('记录失败', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <SheetTitle>🩸 生理期</SheetTitle>
      {prediction ? (
        <Text style={styles.hint}>
          按最近的周期算，下次大概 {prediction.nextStart.toLocaleDateString('zh-CN')} 开始（平均周期 {prediction.avgCycleDays} 天）
        </Text>
      ) : (
        <Text style={styles.hint}>记录满两次"开始"之后才能帮你预测下次时间</Text>
      )}
      {isOngoing ? (
        <Pressable style={styles.saveButton} onPress={() => handleMark('end')} disabled={busy}>
          <Text style={styles.saveButtonText}>标记结束</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.saveButton} onPress={() => handleMark('start')} disabled={busy}>
          <Text style={styles.saveButtonText}>标记开始</Text>
        </Pressable>
      )}
      <Pressable style={styles.doneButton} onPress={onDone}>
        <Text style={styles.doneButtonText}>关闭</Text>
      </Pressable>
    </View>
  );
}

const EXERCISE_PARTS = ['手臂', '腿', '腰腹', '全身', '有氧', '拉伸'];

function ExerciseTool({ onDone }: { onDone: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function toggle(part: string) {
    setSelected((prev) => (prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]));
  }

  async function handleSave() {
    if (selected.length === 0) {
      Alert.alert('选一个部位', '至少选一个练了哪里');
      return;
    }
    setSaving(true);
    try {
      await logExercise(selected);
      onDone();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <SheetTitle>💪 运动</SheetTitle>
      <View style={styles.chipRow}>
        {EXERCISE_PARTS.map((part) => (
          <Pressable
            key={part}
            onPress={() => toggle(part)}
            style={[styles.chip, selected.includes(part) && styles.chipActive]}
          >
            <Text style={[styles.chipText, selected.includes(part) && styles.chipTextActive]}>{part}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveButtonText}>{saving ? '保存中…' : '保存'}</Text>
      </Pressable>
    </View>
  );
}

function TimerTool({ onDone }: { onDone: () => void }) {
  const [minutes, setMinutes] = useState('15');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const notificationIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleStart() {
    const mins = Number(minutes);
    if (!minutes || Number.isNaN(mins) || mins <= 0) {
      Alert.alert('填个分钟数', '比如 15');
      return;
    }
    await ensureNotificationPermission();
    const seconds = Math.round(mins * 60);
    notificationIdRef.current = await scheduleTimerNotification('时间到啦', seconds);
    setRemainingSeconds(seconds);

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleCancel() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (notificationIdRef.current) await cancelTimerNotification(notificationIdRef.current);
    setRemainingSeconds(null);
  }

  if (remainingSeconds !== null) {
    const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const ss = String(remainingSeconds % 60).padStart(2, '0');
    return (
      <View>
        <SheetTitle>⏱ 计时中</SheetTitle>
        <Text style={styles.countdown}>
          {mm}:{ss}
        </Text>
        <Pressable style={styles.saveButton} onPress={handleCancel}>
          <Text style={styles.saveButtonText}>取消</Text>
        </Pressable>
        <Pressable style={styles.doneButton} onPress={onDone}>
          <Text style={styles.doneButtonText}>先关掉（计时还在后台走）</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <SheetTitle>⏱ 计时器</SheetTitle>
      <TextInput
        style={styles.input}
        value={minutes}
        onChangeText={setMinutes}
        placeholder="多少分钟"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        autoFocus
      />
      <Pressable style={styles.saveButton} onPress={handleStart}>
        <Text style={styles.saveButtonText}>开始倒计时</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.md,
  },
  gridItem: { alignItems: 'center', justifyContent: 'center', width: 64 },
  gridEmoji: { fontSize: 22, lineHeight: 26, marginBottom: 4, includeFontPadding: false },
  gridLabel: {
    fontSize: fontSize.tiny,
    lineHeight: fontSize.tiny + 2,
    color: colors.textSecondary,
    includeFontPadding: false,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(61, 53, 84, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetTitle: {
    fontSize: fontSize.pageTitle,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: fontSize.secondary,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  weightTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  weightSectionLabel: {
    fontSize: fontSize.secondary,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  weightColumnHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  weightColumnHeader: {
    flex: 1,
    fontSize: fontSize.tiny,
    color: colors.textMuted,
    textAlign: 'center',
  },
  weightInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weightInputFlex: { flex: 1, marginBottom: spacing.sm },
  weightSaveOneButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  catWeightLabel: { width: 84, fontSize: fontSize.secondary, color: colors.textPrimary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.purple },
  chipText: { fontSize: fontSize.body, color: colors.textSecondary },
  chipTextActive: { color: colors.textPrimary, fontWeight: '600' },
  saveButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.cardName, fontWeight: '600' },
  doneButton: { marginTop: spacing.sm, alignItems: 'center', paddingVertical: spacing.sm },
  doneButtonText: { color: colors.textMuted, fontSize: fontSize.body },
  countdown: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
});
