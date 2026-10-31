import { forwardRef, useEffect, useRef, useState } from 'react';
import { Animated, NativeSyntheticEvent, Pressable, StyleSheet, Text, TextInput, TextInputKeyPressEventData, View } from 'react-native';
import { colors, fixedFontSize as fontSize, spacing } from '../../constants/theme';
// 布局卡死的地方：字号不跟着「其他 → 字号」放大（fixedFontSize）
import type { ScheduleRow } from '../../lib/schedule';

interface Props {
  row: ScheduleRow;
  selected: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
  onChangeTitle: (text: string) => void;
  onEnter: () => void;
  onEmptyBackspace: () => void;
  onMergeBackspace: (currentText: string) => void;
  onDrag?: () => void;
  autoFocus?: boolean;
}

// RN 没有网页的 contenteditable，这里用单行 TextInput 模拟同等体验：
// 回车不是换行，是"新建下一行"(onSubmitEditing)；清空+失焦删行；
// 光标在行首按退格跟上一行合并——这几条都是文档4.1明确要的行为，不是
// TextInput 默认自带的，得自己接 onKeyPress + 选区位置判断。
export const ScheduleRowView = forwardRef<TextInput, Props>(function ScheduleRowView(
  { row, selected, onSelect, onToggleCheck, onChangeTitle, onEnter, onEmptyBackspace, onMergeBackspace, onDrag, autoFocus },
  ref
) {
  const [text, setText] = useState(row.title);
  const [cursorAtStart, setCursorAtStart] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkAnim = useRef(new Animated.Value(row.done ? 1 : 0)).current;

  useEffect(() => {
    setText(row.title);
  }, [row.title]);

  useEffect(() => {
    Animated.timing(checkAnim, { toValue: row.done ? 1 : 0, duration: 280, useNativeDriver: false }).start();
  }, [row.done]);

  function handleChangeText(next: string) {
    setText(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChangeTitle(next), 500);
  }

  function flushCommit() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onChangeTitle(text);
  }

  function handleBlur() {
    flushCommit();
  }

  function handleKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === 'Backspace' && cursorAtStart) {
      if (text.length === 0) {
        onEmptyBackspace();
      } else {
        onMergeBackspace(text);
      }
    }
  }

  const canEdit = row.source === 'item';
  const opacity = checkAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] });

  return (
    <Pressable style={[styles.row, selected && styles.rowSelected]} onPress={onSelect}>
      {canEdit ? (
        <Pressable onLongPress={onDrag} delayLongPress={150} hitSlop={8} style={styles.handle}>
          <Text style={styles.handleText}>⠿</Text>
        </Pressable>
      ) : (
        <View style={styles.handle} />
      )}

      <Pressable onPress={onToggleCheck} hitSlop={8} style={styles.checkbox}>
        <Text style={styles.checkboxText}>
          {row.shape === 'square' ? (row.done ? '☑' : '☐') : row.done ? '●' : '○'}
        </Text>
      </Pressable>

      <Animated.View style={{ flex: 1, opacity }}>
        {canEdit ? (
          <TextInput
            ref={ref}
            style={[styles.input, row.done && styles.inputDone]}
            value={text}
            onChangeText={handleChangeText}
            onBlur={handleBlur}
            onSubmitEditing={onEnter}
            onKeyPress={handleKeyPress}
            onSelectionChange={(e) => setCursorAtStart(e.nativeEvent.selection.start === 0 && e.nativeEvent.selection.end === 0)}
            autoFocus={autoFocus}
            returnKeyType="next"
            blurOnSubmit={false}
            placeholder="写点什么…"
            placeholderTextColor={colors.textMuted}
          />
        ) : (
          <Text style={[styles.input, row.done && styles.inputDone]} numberOfLines={1}>
            {text}
          </Text>
        )}
      </Animated.View>

      {row.starred && <Text style={styles.star}>★</Text>}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderRadius: 8,
  },
  rowSelected: { backgroundColor: colors.purpleLight },
  handle: { width: 20, alignItems: 'center', justifyContent: 'center' },
  handleText: { fontSize: 15, color: colors.textMuted },
  checkbox: { width: 22, alignItems: 'center', justifyContent: 'center' },
  checkboxText: { fontSize: 16, color: colors.textSecondary },
  input: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, padding: 0 },
  inputDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  star: { fontSize: 13, color: colors.yellowDark },
});
