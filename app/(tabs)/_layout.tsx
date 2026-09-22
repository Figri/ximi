import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../constants/theme';

const TAB_ICONS: Record<string, string> = {
  index: '💬',
  life: '📌',
  timeline: '🕐',
  notes: '📁',
  record: '📋',
  data: '📊',
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.purpleDark,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 0,
          elevation: 8,
        },
        tabBarIcon: () => <Text style={{ fontSize: 18 }}>{TAB_ICONS[route.name]}</Text>,
      })}
    >
      <Tabs.Screen name="index" options={{ title: '聊天' }} />
      <Tabs.Screen name="life" options={{ title: '打卡' }} />
      <Tabs.Screen name="timeline" options={{ title: '时间' }} />
      <Tabs.Screen name="notes" options={{ title: '笔记' }} />
      <Tabs.Screen name="record" options={{ title: '记录' }} />
      <Tabs.Screen name="data" options={{ title: '数据' }} />
    </Tabs>
  );
}
