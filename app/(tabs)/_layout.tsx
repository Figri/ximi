import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../constants/theme';
import { FEATURES, FEATURE_BY_KEY } from '../../lib/features';
import { useLayoutStore } from '../../lib/layoutStore';
import { CaptureSheet } from '../../components/capture/CaptureSheet';

// 底栏按用户自定义的布局动态渲染：全部功能屏幕都声明在这里（expo-router 的
// Tabs 本身是静态声明式的，改不了这点），在底栏里展示的那几个给正常 href，
// 不展示的给 href:null——href:null 的屏幕不占底栏按钮位置、但依然可以被
// router.push 跳转到（"其他"页里"更多功能"那些图标点进去走的就是这条路）。
// "其他"永远最后一个声明，所以永远在底栏最右边、永远展示。
export default function TabsLayout() {
  const { topKeys, load } = useLayoutStore();

  useEffect(() => {
    load();
  }, []);

  const topSet = new Set(topKeys);
  // 渲染顺序 = 底栏从左到右的顺序：按 topKeys 的顺序先摆 3 个展示的，
  // 再摆其余不展示的（href:null，顺序无所谓，反正不出现在底栏上），
  // "其他"固定摆最后。
  const orderedKeys = [
    ...topKeys,
    ...FEATURES.filter((f) => !f.fixed && !topSet.has(f.key)).map((f) => f.key),
  ];

  return (
    <>
      <Tabs
        screenOptions={({ route }) => {
          const feature = FEATURES.find((f) => f.screenName === route.name);
          return {
            headerShown: false,
            tabBarActiveTintColor: colors.purpleDark,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle: { fontSize: 11 },
            tabBarStyle: {
              backgroundColor: colors.card,
              borderTopWidth: 0,
              elevation: 8,
            },
            tabBarIcon: () => <Text style={{ fontSize: 18 }}>{feature?.icon ?? ''}</Text>,
          };
        }}
      >
        {orderedKeys.map((key) => {
          const feature = FEATURE_BY_KEY[key];
          const inTop = topSet.has(key);
          return (
            <Tabs.Screen
              key={key}
              name={feature.screenName}
              options={{ title: feature.label, href: inTop ? undefined : null }}
            />
          );
        })}
        {/* 离开「其他」就回到列表：以前点进日程再切走，下次点「其他」看到的还是日程 */}
        <Tabs.Screen name="other" options={{ title: '其他', popToTopOnBlur: true }} />
      </Tabs>
      {/* 右下角 ＋ 的面板全局只有一个，哪个页面的 ＋ 都打开它 */}
      <CaptureSheet />
    </>
  );
}
