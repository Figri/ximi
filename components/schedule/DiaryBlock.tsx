import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';

interface Props {
  content: string;
  onChange: (text: string) => void;
}

// 日记区跟普通行同一套编辑体验，唯一区别：multiline(回车真的换行，不是"新建行")，
// 不带勾选框不带握把。自动撑高用 onContentSizeChange，不设滚动。
export function DiaryBlock({ content, onChange }: Props) {
  const [text, setText] = useState(content);
  const [height, setHeight] = useState(24);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(content);
  }, [content]);

  function handleChangeText(next: string) {
    setText(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(next), 500);
  }

  function handleBlur() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onChange(text);
  }

  return (
    <TextInput
      style={[styles.input, { height: Math.max(24, height) }]}
      value={text}
      onChangeText={handleChangeText}
      onBlur={handleBlur}
      onContentSizeChange={(e) => setHeight(e.nativeEvent.contentSize.height)}
      multiline
      placeholder="今天怎么样？"
      placeholderTextColor={colors.textMuted}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    lineHeight: 20,
  },
});
