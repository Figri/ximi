import { useEffect, useState } from 'react';
import { Animated, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { SLOTS } from '../../lib/schedule';
import type { ScheduleSlot } from '../../types';

type SubMenu = null | 'slot' | 'recurring' | 'reminder';

interface Props {
  starred: boolean;
  onToggleStar: () => void;
  onChangeSlot: (slot: ScheduleSlot) => void;
  onSetRecurring: (rule: string | null) => void;
  onSetReminder: (minutesBefore: number | null) => void;
  onDelete: () => void;
}

const SLOT_LABELS: Record<ScheduleSlot, string> = {
  allday: '全天',
  '08': '08',
  '10': '10',
  '12': '12',
  '14': '14',
  '16': '16',
  '18': '18',
  '20': '20',
  '22': '22',
};

// 全部5个功能的二级选项都在工具条内部横向展开，零弹窗——这是文档4.2的
// 硬要求。用一个 subMenu 状态控制展开哪个，展开态替换掉整排图标，点了具体
// 选项或者再点一次同一个图标就收回。
export function ScheduleToolbar({ starred, onToggleStar, onChangeSlot, onSetRecurring, onSetReminder, onDelete }: Props) {
  const [subMenu, setSubMenu] = useState<SubMenu>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const translateY = useState(new Animated.Value(40))[0];

  useEffect(() => {
    Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  function toggleSub(menu: SubMenu) {
    setSubMenu((cur) => (cur === menu ? null : menu));
  }

  return (
    <Animated.View style={[styles.bar, { bottom: keyboardHeight, transform: [{ translateY }] }]}>
      {subMenu === null && (
        <View style={styles.row}>
          <Pressable style={styles.btn} onPress={onToggleStar}>
            <Text style={[styles.icon, starred && styles.iconActive]}>★</Text>
            <Text style={styles.label}>星标</Text>
          </Pressable>
          <Pressable style={styles.btn} onPress={() => toggleSub('slot')}>
            <Text style={styles.icon}>🕐</Text>
            <Text style={styles.label}>改时段</Text>
          </Pressable>
          <Pressable style={styles.btn} onPress={() => toggleSub('recurring')}>
            <Text style={styles.icon}>🔁</Text>
            <Text style={styles.label}>转重复</Text>
          </Pressable>
          <Pressable style={styles.btn} onPress={() => toggleSub('reminder')}>
            <Text style={styles.icon}>⏰</Text>
            <Text style={styles.label}>提醒</Text>
          </Pressable>
          <Pressable style={styles.btn} onPress={onDelete}>
            <Text style={styles.icon}>🗑</Text>
            <Text style={styles.label}>删除</Text>
          </Pressable>
        </View>
      )}

      {subMenu === 'slot' && (
        <View style={styles.subRow}>
          <Pressable onPress={() => setSubMenu(null)} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          {(['allday', ...SLOTS] as ScheduleSlot[]).map((s) => (
            <Pressable
              key={s}
              style={styles.chip}
              onPress={() => {
                onChangeSlot(s);
                setSubMenu(null);
              }}
            >
              <Text style={styles.chipText}>{SLOT_LABELS[s]}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {subMenu === 'recurring' && (
        <View style={styles.subRow}>
          <Pressable onPress={() => setSubMenu(null)} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => { onSetRecurring(null); setSubMenu(null); }}>
            <Text style={styles.chipText}>不重复</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => { onSetRecurring('weekly:1,2,3,4,5'); setSubMenu(null); }}>
            <Text style={styles.chipText}>每周一到五</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => { onSetRecurring('weekly:0,6'); setSubMenu(null); }}>
            <Text style={styles.chipText}>每周末</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => { onSetRecurring('monthly:1'); setSubMenu(null); }}>
            <Text style={styles.chipText}>每月1号</Text>
          </Pressable>
        </View>
      )}

      {subMenu === 'reminder' && (
        <View style={styles.subRow}>
          <Pressable onPress={() => setSubMenu(null)} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => { onSetReminder(0); setSubMenu(null); }}>
            <Text style={styles.chipText}>准点</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => { onSetReminder(10); setSubMenu(null); }}>
            <Text style={styles.chipText}>提前10分</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => { onSetReminder(30); setSubMenu(null); }}>
            <Text style={styles.chipText}>提前30分</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => { onSetReminder(null); setSubMenu(null); }}>
            <Text style={styles.chipText}>取消提醒</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.background,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    ...Platform.select({ web: { boxShadow: '0 -2px 8px rgba(0,0,0,0.06)' }, default: { elevation: 10 } }),
  },
  row: { flexDirection: 'row', justifyContent: 'space-around' },
  btn: { alignItems: 'center', gap: 2, paddingVertical: 2, paddingHorizontal: spacing.sm },
  icon: { fontSize: 18, color: colors.textSecondary },
  iconActive: { color: colors.yellowDark },
  label: { fontSize: fontSize.tiny, color: colors.textMuted },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  backBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  backText: { fontSize: 20, color: colors.purpleDark, fontWeight: '700' },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.purpleLight, borderRadius: radius.button },
  chipText: { fontSize: fontSize.secondary, color: colors.purpleDark, fontWeight: '600' },
});
