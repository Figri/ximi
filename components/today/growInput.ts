import { Platform, type TextInputProps } from 'react-native';

// 随心记、事项的输入框：字多了往下长（最多 4 行，由各自样式里的 maxHeight 管，再多在框里滚），
// 回车还是「记 / 加」，不换行。
// 安卓：multiline 本来就跟着内容长高（灵的对话输入框也是这么写的）；submitBehavior="submit" = 回车提交、键盘不收。
// 网页（只在沙盒里测用）：react-native-web 的多行框回车是换行，这里拦下来当提交；正在打拼音时按的回车不算。

export function growInputProps(submit: () => void): Partial<TextInputProps> {
  return {
    multiline: true,
    submitBehavior: 'submit',
    onSubmitEditing: submit,
    onKeyPress:
      Platform.OS === 'web'
        ? (e: any) => {
            const n = e?.nativeEvent ?? {};
            if (n.key !== 'Enter' || n.shiftKey || n.isComposing || n.keyCode === 229) return;
            e.preventDefault?.();
            submit();
          }
        : undefined,
  };
}
