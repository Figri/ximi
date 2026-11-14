import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';
import { colors, fixedFontSize } from '../../constants/theme';
import { FEATURES, FEATURE_BY_KEY } from '../../lib/features';
import { useLayoutStore } from '../../lib/layoutStore';
import { CaptureSheet } from '../../components/capture/CaptureSheet';

// 底栏固定为今日、习惯、时间、灵、其他。其余页面保留路由，由其他页进入。
const TAB_GLYPHS:Record<string,string>={today:'☼',habits:'✓',time:'◷',chat:'♡',other:'⋯'};
export default function TabsLayout() {
  const insets=useSafeAreaInsets();
  const { topKeys, load } = useLayoutStore();

  useEffect(() => {
    load();
  }, []);

  const topSet = new Set(topKeys);
  // 渲染顺序 = 底栏从左到右的顺序：先摆四个固定入口，
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
            tabBarLabelStyle: { fontSize: fixedFontSize.secondary, marginBottom: 4 },
            tabBarIconStyle: { width: 56, height: 32 },
            tabBarItemStyle: { paddingTop: 0 },
            tabBarStyle: {
              height: 64 + insets.bottom,
              paddingBottom: insets.bottom,
              paddingTop: 4,
              backgroundColor: colors.card,
              borderTopWidth: 0,
              elevation: 8,
            },
            tabBarIcon: ({ focused, color }) => <View testID={`nav-icon-${feature?.key ?? route.name}`} style={{width:52,height:30,borderRadius:15,backgroundColor:focused?colors.purpleDark:'transparent',alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:22,lineHeight:26,color:focused?'#fff':color,fontWeight:focused?'700':'400'}}>{TAB_GLYPHS[feature?.key??route.name]??feature?.icon??''}</Text></View>,
            tabBarLabel: ({ focused, color }) => <Text style={{fontSize:fixedFontSize.secondary,lineHeight:18,color,fontWeight:focused?'700':'400',marginBottom:3}}>{feature?.label??'其他'}</Text>,
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
