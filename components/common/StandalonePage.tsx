import type { ComponentType } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../constants/theme';

// 底栏上的页面单独打开（app/page/...）时没有底栏垫着，底部留出手机系统导航条的高度，免得最后一行被盖住。
export function standalonePage(Screen: ComponentType): ComponentType {
  return function StandalonePage() {
    const insets = useSafeAreaInsets();
    return (
      <View style={{ flex: 1, paddingBottom: insets.bottom, backgroundColor: colors.background }}>
        <Screen />
      </View>
    );
  };
}
