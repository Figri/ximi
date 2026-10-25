import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

// 出错记录：网页上测不出来、只在手机上才炸的错，靠这个抓。
// - 页面渲染出错：根布局的 ErrorBoundary 接住，不退出 App，显示原因、能重试（app/_layout.tsx）。
// - 别处抛出来的致命错误（点按钮、定时器里）：全局处理器记下来，不让整个 App 闪退，顶上提示一句。
// - 原生层的崩溃 JS 接不住：用「前台会话」标记判断——上次在前台时突然没了，下次打开就记一条，带上当时在哪个页面。
// 记录都在「其他 → 出错记录」里，截图发过来就能对着修。

const K_LOG = 'crash_log_v1';
const K_SESSION = 'crash_session_v1';
const MAX = 15;

export interface CrashEntry {
  at: string;
  kind: 'render' | 'fatal' | 'native';
  message: string;
  stack: string;
  route: string;
}

let currentRoute = '/';
let queue: Promise<unknown> = Promise.resolve();

export function setCrashRoute(route: string) {
  currentRoute = route || '/';
  AsyncStorage.setItem(K_SESSION, JSON.stringify({ state: 'foreground', route: currentRoute, at: new Date().toISOString() })).catch(() => {});
}

export function recordCrash(e: Omit<CrashEntry, 'at' | 'route'> & { route?: string }): Promise<void> {
  const entry: CrashEntry = {
    at: new Date().toISOString(),
    kind: e.kind,
    message: String(e.message ?? '').slice(0, 500),
    stack: String(e.stack ?? '').split('\n').slice(0, 12).join('\n').slice(0, 2000),
    route: e.route ?? currentRoute,
  };
  // 一个一个写，免得同时出好几个错时互相覆盖
  const run = queue.then(async () => {
    const list = await loadCrashes();
    await AsyncStorage.setItem(K_LOG, JSON.stringify([entry, ...list].slice(0, MAX)));
  });
  queue = run.catch(() => {});
  return run.catch(() => {});
}

export async function loadCrashes(): Promise<CrashEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(K_LOG);
    return raw ? (JSON.parse(raw) as CrashEntry[]) : [];
  } catch {
    return [];
  }
}

export async function clearCrashes(): Promise<void> {
  await AsyncStorage.removeItem(K_LOG).catch(() => {});
}

/** App 正常切到后台：这次会话算干净结束 */
export function markSessionBackground() {
  AsyncStorage.setItem(K_SESSION, JSON.stringify({ state: 'background', route: currentRoute, at: new Date().toISOString() })).catch(() => {});
}

/**
 * 打开 App 时调一次：上次停在「前台」状态（没切后台就没了），说明是在用着的时候崩的。
 * JS 的错误已经各自记过了；这里补一条「原生崩溃 / 被系统杀掉」的记录。
 */
export async function checkLastSession(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(K_SESSION);
    const last = raw ? (JSON.parse(raw) as { state: string; route: string; at: string }) : null;
    if (last && last.state === 'foreground') {
      const list = await loadCrashes();
      // 最后一条 JS 错误就是在那之后记的：不重复记
      const covered = list[0] && list[0].at >= last.at;
      if (!covered) {
        await recordCrash({
          kind: 'native',
          message: '上次用着用着 App 就没了，没有抓到 JS 错误（可能是原生层崩溃，或者被系统杀掉）',
          stack: '',
          route: last.route,
        });
      }
    }
  } catch {}
  setCrashRoute(currentRoute);
}

// ---- 顶上的小提示：刚才出了错但没让 App 退出 ----

interface BannerState {
  text: string | null;
  show: (text: string) => void;
  hide: () => void;
}

export const useCrashBanner = create<BannerState>((set) => ({
  text: null,
  show: (text) => set({ text }),
  hide: () => set({ text: null }),
}));

let installed = false;
const startedAt = Date.now();
/** 刚启动的这段时间里出的致命错误照旧让 App 退出：那多半是这次更新本身坏了，退出后 expo-updates 能自动退回上一个能用的版本 */
const STARTUP_GRACE_MS = 15 * 1000;

/** 接管全局错误：用着用着出的致命错误不再让整个 App 退回桌面，先记下来、顶上提示一句 */
export function installGlobalErrorHandler() {
  if (installed) return;
  installed = true;
  const EU = (globalThis as any).ErrorUtils;
  if (!EU?.setGlobalHandler) return;
  const prev = EU.getGlobalHandler?.();
  EU.setGlobalHandler((error: any, isFatal?: boolean) => {
    recordCrash({ kind: 'fatal', message: error?.message ?? String(error), stack: error?.stack ?? '' });
    if (isFatal && !__DEV__ && Date.now() - startedAt > STARTUP_GRACE_MS) {
      useCrashBanner.getState().show(`刚才出了个错（${String(error?.message ?? error).slice(0, 40)}），已经记下来了`);
      return;
    }
    prev?.(error, isFatal);
  });
}
