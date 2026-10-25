import { useEffect, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Updates from 'expo-updates';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { room } from '../constants/room';
import { useLingRuntime } from '../lib/ling/useLingRuntime';
import { flushSync } from '../lib/timelogSync';
import { runLegacyMigration } from '../lib/legacyMigration';
import { useCardStore } from '../lib/store';
import { checkLastSession, installGlobalErrorHandler, markSessionBackground, recordCrash, setCrashRoute, useCrashBanner } from '../lib/crashLog';

// 越早越好：第一屏渲染之前就接管全局错误
installGlobalErrorHandler();

/** 现在在哪个页面（出错记录用）：AppState 回到前台时要用，放在组件外面 */
const pathnameRef = { current: '/' };

/**
 * 哪个页面渲染出错都在这里接住：不退出 App，显示出错原因（截图发给灵就能对着修），可以重试或回到今天。
 * 出错的信息同时记进「其他 → 出错记录」。
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    recordCrash({ kind: 'render', message: error?.message ?? String(error), stack: error?.stack ?? '' });
  }, [error]);
  return (
    <SafeAreaView style={boundary.wrap}>
      <ScrollView contentContainerStyle={boundary.body}>
        <Text style={boundary.title}>这个页面出错了</Text>
        <Text style={boundary.text}>App 没退出，已经把原因记下来了。可以先重试一下，或者回到今天。</Text>
        <View style={boundary.row}>
          <Pressable style={boundary.btn} onPress={() => retry()}>
            <Text style={boundary.btnText}>重试</Text>
          </Pressable>
          <Pressable
            style={boundary.btnGhost}
            onPress={() => {
              try {
                router.replace('/');
              } catch {}
              retry();
            }}
          >
            <Text style={boundary.btnGhostText}>回到今天</Text>
          </Pressable>
        </View>
        <Text style={boundary.label}>出错原因（截图发给灵）</Text>
        <Text style={boundary.code} selectable>
          {String(error?.message ?? error)}
          {'\n'}
          {String(error?.stack ?? '').split('\n').slice(0, 8).join('\n')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function CrashBanner() {
  const { text, hide } = useCrashBanner();
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(hide, 6000);
    return () => clearTimeout(t);
  }, [text, hide]);
  if (!text) return null;
  return (
    <SafeAreaView edges={['top']} style={boundary.bannerWrap} pointerEvents="box-none">
      <Pressable style={boundary.banner} onPress={hide}>
        <Text style={boundary.bannerText}>{text}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

export default function RootLayout() {
  useLingRuntime();

  // 出错记录：先看上次是不是用着用着没了，再开始记现在在哪个页面
  const pathname = usePathname();
  const [sessionChecked, setSessionChecked] = useState(false);
  useEffect(() => {
    checkLastSession().finally(() => setSessionChecked(true));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') markSessionBackground();
      else if (state === 'active') setCrashRoute(pathnameRef.current);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    pathnameRef.current = pathname;
    if (sessionChecked) setCrashRoute(pathname);
  }, [pathname, sessionChecked]);

  useEffect(() => {
    // 旧 Supabase 库的数据一次性搬到手机本地；搬到了东西就刷新一下卡片
    runLegacyMigration().then((state) => {
      if (state?.status === 'done' && Object.values(state.counts).some((n) => n > 0)) {
        useCardStore.getState().fetchAll();
      }
    });
  }, []);

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
          {
            text: '立即重启',
            onPress: () => {
              // 主动重启不算「用着用着没了」
              markSessionBackground();
              Updates.reloadAsync();
            },
          },
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
            name="memory"
            options={{
              headerShown: true,
              title: 'AI 记忆',
              presentation: 'modal',
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.textPrimary,
            }}
          />
          <Stack.Screen name="ling-settings" options={{ presentation: 'card', contentStyle: { backgroundColor: room.bg } }} />
          <Stack.Screen name="notion-connect" options={{ presentation: 'card' }} />
          <Stack.Screen name="timelog-categories" options={{ presentation: 'modal' }} />
          <Stack.Screen name="timelog-tags" options={{ presentation: 'modal' }} />
          <Stack.Screen name="todo-categories" options={{ presentation: 'modal' }} />
          <Stack.Screen name="care-groups" options={{ presentation: 'card' }} />
          <Stack.Screen
            name="schedule-template"
            options={{
              headerShown: true,
              title: '日常作息模板',
              presentation: 'modal',
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.textPrimary,
            }}
          />
        </Stack>
        <CrashBanner />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const boundary = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.xl },
  text: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 20 },
  row: { flexDirection: 'row', gap: spacing.md },
  btn: { backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 18, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.body },
  btnGhost: { borderWidth: 1, borderColor: colors.purple, borderRadius: radius.widget, paddingHorizontal: 18, paddingVertical: 10 },
  btnGhostText: { color: colors.purpleDark, fontSize: fontSize.body },
  label: { fontSize: fontSize.secondary, color: colors.textMuted, marginTop: spacing.md },
  code: { fontSize: 11, color: colors.textSecondary, backgroundColor: colors.card, borderRadius: radius.widget, padding: spacing.md, lineHeight: 16 },
  bannerWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  banner: { marginHorizontal: spacing.lg, marginTop: spacing.sm, backgroundColor: colors.textPrimary, borderRadius: radius.widget, paddingHorizontal: spacing.md, paddingVertical: 10 },
  bannerText: { color: '#fff', fontSize: fontSize.secondary, lineHeight: 17 },
});
