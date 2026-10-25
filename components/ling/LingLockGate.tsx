import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { room } from '../../constants/room';
import { useLingLock } from '../../lib/ling/lock';
import { PinPad } from './PinPad';

// 灵的窗口、灵的设定外面套一层：开了锁、这次还没解开，就先出密码盘。

export function LingLockGate({ children }: { children: ReactNode }) {
  const { loaded, enabled, unlocked, load, unlock } = useLingLock();

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: room.bg }} />;
  if (enabled && !unlocked) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: room.bg }} edges={['top']}>
        <PinPad mode="unlock" onDone={() => unlock()} />
      </SafeAreaView>
    );
  }
  return <>{children}</>;
}
