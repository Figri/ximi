import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from '../../constants/theme';

const TAB_ICONS: Record<string, string> = {
  chat: '💬',
  life: '📌',
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
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          position: 'absolute',
          elevation: 0,
        },
        tabBarBackground: () => (
          <BlurView intensity={60} tint="light" style={{ flex: 1 }} />
        ),
        tabBarIcon: () => <Text style={{ fontSize: 18 }}>{TAB_ICONS[route.name]}</Text>,
      })}
    >
      <Tabs.Screen name="chat" options={{ title: '聊天' }} />
      <Tabs.Screen name="life" options={{ title: '生活' }} />
      <Tabs.Screen name="record" options={{ title: '记录' }} />
      <Tabs.Screen name="data" options={{ title: '数据' }} />
    </Tabs>
  );
}
