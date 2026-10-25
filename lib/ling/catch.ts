import { CATCH_STATES, type StateWord } from '../states';
import { catchState } from './brain';
import { isPausedToday, loadLingSettings } from './settings';
import { useLingThread } from './thread';

// 点了状态（今天页的状态词，或者 ＋ 里写了「好累」）之后：对话里记一笔她点了什么（灵下一句才知道前因），
// 难受的那几个让灵马上接住（需求文档 §6.3「接住你」：每次打点最多 1 条）。
// 撤销时把这两条一起拿掉；灵还没写完就撤销了，写完也不放进去。

export interface CatchHandle {
  cancelled: boolean;
  ids: string[];
}

export async function onStateTapped(state: StateWord, note: string | null, handle: CatchHandle): Promise<string | null> {
  const thread = useLingThread.getState();
  if (!thread.loaded) await thread.load();
  const noted = await useLingThread.getState().add({
    role: 'user',
    kind: 'note',
    content: note && note.trim() && note.trim() !== state ? `点了状态「${state}」：${note.trim()}` : `点了状态「${state}」`,
  });
  handle.ids.push(noted.id);
  if (handle.cancelled) {
    await useLingThread.getState().remove(handle.ids);
    return null;
  }
  const settings = await loadLingSettings();
  if (!CATCH_STATES.has(state) || !settings.enableCatch || isPausedToday(settings)) return null;
  const { text, fallback } = await catchState(state, note, useLingThread.getState().messages);
  if (handle.cancelled) return null;
  const msg = await useLingThread.getState().add({ role: 'assistant', content: text, kind: 'catch', trigger: `你点了「${state}」`, fallback });
  handle.ids.push(msg.id);
  if (handle.cancelled) {
    await useLingThread.getState().remove(handle.ids);
    return null;
  }
  return text;
}

export async function undoStateTap(handle: CatchHandle): Promise<void> {
  handle.cancelled = true;
  await useLingThread.getState().remove(handle.ids);
}
