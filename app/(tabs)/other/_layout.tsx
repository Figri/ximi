import { Stack } from 'expo-router';
import { colors } from '../../../constants/theme';

// "其他"tab 内部自己是一个栈：index 是列表页（自己有头部，不用系统header），
// 从列表点进未展示功能时 push 进这个栈里的子页面——因为还在"其他"这个
// Tabs.Screen 内部，底栏高亮不会变成被点开的那个功能，物理返回/头部返回键
// 回的也是 index 列表页，不是上一个 tab，正好对应文档第7节的两条跳转规则。
// 直接跳到某个子页面时，底下也垫着列表页：返回回列表，不会一下子跳出「其他」
export const unstable_settings = { initialRouteName: 'index' };

export default function OtherLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="today" options={{ title: '今天' }} />
      <Stack.Screen name="time" options={{ title: '时间' }} />
      <Stack.Screen name="chat" options={{ headerShown: false }} />
      <Stack.Screen name="schedule" options={{ title: '日程' }} />
      {/* 这三页自己带标题和返回（components/common/PageTitle），不用系统标题栏 */}
      <Stack.Screen name="review" options={{ headerShown: false }} />
      <Stack.Screen name="cats" options={{ headerShown: false }} />
      <Stack.Screen name="body" options={{ headerShown: false }} />
    </Stack>
  );
}
