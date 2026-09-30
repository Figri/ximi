import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Updates from 'expo-updates';
import { colors } from '../constants/theme';
import { useDecayNotifications } from '../lib/useDecayNotifications';
import { flushSync } from '../lib/timelogSync';

export default function RootLayout() {
  useDecayNotifications();

  useEffect(() => {
    flushSync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushSync();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    async function silentUpdateCheck() {
      // 不再跳过开发模式——西米平时测试装的就是开发模式包，跳过会导致这段
      // 自动检查从来跑不起来，只能靠设置页手动按钮
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        Alert.alert('有新版本', '已下载完成，重启即可使用', [
          { text: '稍后', style: 'cancel' },
          { text: '立即重启', onPress: () => Updates.reloadAsync() },
        ]);
      } catch {}
    }
    silentUpdateCheck();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="card/[id]"
            options={{
              headerShown: true,
              title: '',
              presentation: 'card',
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.textPrimary,
            }}
          />
          <Stack.Screen
            name="cat/[id]"
            options={{
              headerShown: true,
              title: '',
              presentation: 'card',
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.textPrimary,
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              headerShown: true,
              title: '设置',
              presentation: 'modal',
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.textPrimary,
            }}
          />
          <Stack.Screen
            name="memory"
            options={{
              headerShown: true,
              title: 'AI 记忆',
              presentation: 'modal',
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.textPrimary,
            }}
          />
          <Stack.Screen name="timelog-categories" options={{ presentation: 'modal' }} />
          <Stack.Screen name="timelog-tags" options={{ presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
