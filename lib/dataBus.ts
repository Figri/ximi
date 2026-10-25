import { create } from 'zustand';

// 一个很小的「数据变了」广播：＋ 快速记录、勾选、开始玩这些在别处改了数据，今天页 / 时间页看到版本号变了就重读。
interface DataBusState {
  version: number;
  bump: () => void;
}

export const useDataBus = create<DataBusState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
