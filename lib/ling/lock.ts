import { create } from 'zustand';
import { secureStore } from '../aiSettings';

// 灵空间锁（需求文档 §6.7 L-12、§8.10 D-5）：进「灵」和灵的设定要先输 4 位密码，纯 JS，不用原生模块。
// 防的是旁边有人顺手拿起手机，不是防专业破解：密码存在系统安全存储里，App 一切到后台就重新锁上。
// 忘了密码：在密码盘上点「忘了」，等 60 秒锁就关掉（拦得住顺手翻的人，又不至于把自己锁在外面）。

const K_PIN = 'ling_pin';
export const FORGET_WAIT_MS = 60 * 1000;

interface LockState {
  loaded: boolean;
  enabled: boolean;
  unlocked: boolean;
  load: () => Promise<void>;
  unlock: () => void;
  lock: () => void;
  setPin: (pin: string) => Promise<void>;
  clearPin: () => Promise<void>;
  check: (pin: string) => Promise<boolean>;
}

export const useLingLock = create<LockState>((set, get) => ({
  loaded: false,
  enabled: false,
  unlocked: false,
  load: async () => {
    const pin = await secureStore.get(K_PIN).catch(() => null);
    set({ loaded: true, enabled: !!pin });
  },
  unlock: () => set({ unlocked: true }),
  lock: () => {
    if (get().enabled) set({ unlocked: false });
  },
  setPin: async (pin) => {
    await secureStore.set(K_PIN, pin);
    set({ enabled: true, unlocked: true });
  },
  clearPin: async () => {
    await secureStore.delete(K_PIN);
    set({ enabled: false, unlocked: true });
  },
  check: async (pin) => {
    const saved = await secureStore.get(K_PIN).catch(() => null);
    return !!saved && saved === pin;
  },
}));
