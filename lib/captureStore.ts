import { create } from 'zustand';

// 右下角 ＋ 的面板全局只有一个（挂在底栏布局里），哪个页面的 ＋ 都是打开它。
export type CaptureMode = 'any' | 'fragment';

interface CaptureStoreState {
  visible: boolean;
  mode: CaptureMode;
  open: (mode?: CaptureMode) => void;
  close: () => void;
}

export const useCaptureStore = create<CaptureStoreState>((set) => ({
  visible: false,
  mode: 'any',
  open: (mode = 'any') => set({ visible: true, mode }),
  close: () => set({ visible: false }),
}));
