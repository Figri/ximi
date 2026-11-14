import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { secureStore, getApiKey, getModelOption } from '../aiSettings';
import { getNotionToken } from '../notion/client';
import { loadNotionIds } from '../notion/discover';
import { readTable, mergeRows } from '../localdb';
import { ensureLingChannels, ensureNotificationPermission } from '../notifications';
import { loadCompanionConfig, CONFIG_KEY } from './config';
import { loadLingSettings, useLingSettings } from './settings';
import { LING_TABLES, initializeCompanion } from './repository';
import { useCompanionEvents } from './events';
import {mergeRemote} from './merge';
import {canonical} from '../osSyncTypes';
const stable=canonical;
const AUTH = 'ling_backend_device_v1', META = 'ling_cloud_meta_v1';
const endpoint = () => { const url = process.env.EXPO_PUBLIC_SUPABASE_URL; if (!url)
    throw new Error('手机更新包未配置云端地址'); return url + '/functions/v1/ling'; };
let running: Promise<void> | null = null;let again=false;
export async function cloudStatus() { const s = await AsyncStorage.getItem('ling_cloud_status_v1'); return s ? JSON.parse(s) : { connected: false, error: '等待首次连接' }; }
async function reportProgress(progress:string){const state=await cloudStatus();await AsyncStorage.setItem('ling_cloud_status_v1',JSON.stringify({...state,progress,error:''}));}
let registering: Promise<any> | null = null;
async function deviceAuth() { const stored = await secureStore.get(AUTH); if (stored)
    return JSON.parse(stored); if (!registering)
    registering = (async () => { const auth = await raw('register', {}); await secureStore.set(AUTH, JSON.stringify(auth)); return auth; })().finally(() => { registering = null; }); return registering; }
export async function backend(action: string, body: any = {}, timeout = 30000) { if (action === 'register')
    return raw(action, body, timeout); const auth = await deviceAuth(); return raw(action, { ...body, device_id: auth.device_id, token: auth.token }, timeout); }
async function raw(action: string, body: any, timeout = 30000) { const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout); try {
    const response = await fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }), signal: controller.signal });
    let json: any;
    try {
        json = await response.json();
    }
    catch {
        throw new Error(`后台暂时不可用（${response.status}）`);
    }
    if (!response.ok || json.error)
        throw new Error(json.error ?? `后台请求失败（${response.status}）`);
    return json;
}
finally {
    clearTimeout(timer);
} }
async function pull(meta:any){for(let page=0;page<1000;page++){const response=await backend('pull',{since:meta.cursor});if(!response.records.length)break;for(const remote of response.records){const key=`${remote.kind}:${remote.id}`,base=meta.base[key];if(base&&remote.version<=base.version){meta.cursor=remote.revision;continue;}const local=remote.kind==='config'?await loadCompanionConfig():(await readTable(remote.kind)).find(r=>r.id===remote.id);let value=remote.payload;if(local&&base&&JSON.stringify(local)!==base.hash){value=mergeRemote(JSON.parse(base.hash),local,remote.payload);if(!value){await AsyncStorage.setItem('ling_cloud_conflicts_v1',JSON.stringify([{local,remote}]));throw new Error('同一内容有不同修改，两份已保留，请在设定中处理');}}else if(local&&!base&&stable(local)!==stable(remote.payload)){await AsyncStorage.setItem('ling_cloud_conflicts_v1',JSON.stringify([{local,remote}]));throw new Error('本机与后台有不同记录，两份已保留，请在设定中处理');}if(remote.kind==='config')await AsyncStorage.setItem(CONFIG_KEY,JSON.stringify(value));else await mergeRows(remote.kind,[value]);meta.base[key]={version:remote.version,hash:JSON.stringify(remote.payload)};if(remote.kind==='ling_threads'&&!value.archived&&value.id.startsWith('morning:'))await AsyncStorage.setItem('ling_active_thread_v1',remote.id);meta.cursor=remote.revision;}await AsyncStorage.setItem(META,JSON.stringify(meta));if(response.records.length<100)break;}}
export async function resolveConflicts(choice:'local'|'remote'){const conflicts=JSON.parse(await AsyncStorage.getItem('ling_cloud_conflicts_v1')??'[]'),meta=JSON.parse(await AsyncStorage.getItem(META)??'{"base":{},"cursor":0}');for(const c of conflicts){const remote=c.remote??c;const local=c.local??(remote.kind==='config'?await loadCompanionConfig():(await readTable(remote.kind)).find(r=>r.id===remote.id));if(choice==='remote'){if(remote.kind==='config')await AsyncStorage.setItem(CONFIG_KEY,JSON.stringify(remote.payload));else await mergeRows(remote.kind,[remote.payload]);}meta.base[`${remote.kind}:${remote.id}`]={version:remote.version,hash:JSON.stringify(remote.payload)};}await AsyncStorage.setItem(META,JSON.stringify(meta));await AsyncStorage.setItem('ling_resolved_conflicts_v1',JSON.stringify(conflicts));await AsyncStorage.removeItem('ling_cloud_conflicts_v1');useCompanionEvents.getState().bump();}
export function syncCompanion(){if(running){again=true;return running;}running=(async()=>{do{again=false;await sync();}while(again);})().finally(()=>{running=null;});return running;}
async function sync() {
    await initializeCompanion();
    let config = await loadCompanionConfig();
    if (!config.background) {
        if (await secureStore.get(AUTH))
            await backend('configure', { config });
        return;
    }
    try {
        if (await AsyncStorage.getItem('ling_cloud_restore_paused_v1'))
            throw new Error('备份已导入，本地保留；请在设定中确认恢复后再同步');
        await reportProgress('正在连接后台…');await loadLingSettings();
        const model = useLingSettings.getState().model, key = await getApiKey(model);
        if (!key)
            throw new Error('后台早报等待模型密钥：灵 → 设定 → 模型');
        let push: string | undefined;
        let pushError = '';
        if (Platform.OS !== 'web') {
            try {
                await ensureLingChannels();
                if (await ensureNotificationPermission('once'))
                    {let timer:ReturnType<typeof setTimeout>|undefined;try{push=(await Promise.race([Notifications.getExpoPushTokenAsync({projectId:'a5f8fc28-1dac-428f-b632-5b4ddaa6c85b'}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('推送凭证检查超时')),6000);})])).data;}finally{clearTimeout(timer);}}
                else
                    pushError = '未开启通知权限，早报会保存在聊天中';
            }
            catch {
                pushError = '当前安装包暂未取得远程推送凭证，后台消息仍会保存';
            }
        }
        const notion = await getNotionToken();
        const ids = await loadNotionIds();
        const { currentThread } = await import('./repository');

        const meta = JSON.parse(await AsyncStorage.getItem(META) ?? '{"base":{},"cursor":0}');
        meta.base ??= {};
        await reportProgress('正在读取后台的新记录…');await pull(meta);config=await loadCompanionConfig();
        await backend('configure', { config, active_thread: (await currentThread()).id, provider: model, model_option: model === 'doubao' ? await getModelOption('doubao') : undefined, api_key: key, push_token: push, notion_token: notion, notion_parent: ids.chatArchivePage ?? undefined });
        const records: any[] = [];
        for (const table of LING_TABLES)
            for (const row of await readTable(table))
                records.push({ kind: table, id: row.id, payload: row });
        records.push({ kind: 'config', id: 'current', payload: config });
        const dirty = records.filter(r => meta.base[`${r.kind}:${r.id}`]?.hash !== JSON.stringify(r.payload));
        for (let i = 0; i < dirty.length; i += 40) {
            await reportProgress(`正在上传聊天与记忆 ${i}/${dirty.length}…`);const batch = dirty.slice(i, i + 40);
            const response = await backend('push', { records: batch.map(r => ({ ...r, expected: meta.base[`${r.kind}:${r.id}`]?.version ?? 0 })) });
            if (response.conflicts?.length) {
                await AsyncStorage.setItem('ling_cloud_conflicts_v1', JSON.stringify(response.conflicts));
                throw new Error('本地与后台有不同修改，两份已保留，同步暂停');
            }
            for (const ack of response.acks) {
                const sent = batch.find(r => r.kind === ack.kind && r.id === ack.id);
                meta.base[`${ack.kind}:${ack.id}`] = { version: ack.version, hash: JSON.stringify(sent.payload) };
            }
            await AsyncStorage.setItem(META, JSON.stringify(meta));
        }
        await reportProgress('上传完成，正在核对记录…');await pull(meta);
        await backend('active_thread',{thread_id:(await currentThread()).id});
        const state = await backend('status');
        await AsyncStorage.setItem('ling_cloud_status_v1', JSON.stringify({ ...state, connected: true, lastSync: new Date().toISOString(), pushError,progress:'', error: '' }));
        useCompanionEvents.getState().bump();
    }
    catch (e) {
        const old = await cloudStatus();
        await AsyncStorage.setItem('ling_cloud_status_v1', JSON.stringify({ ...old, progress:'',error: e instanceof Error ? e.message : String(e) }));
        throw e;
    }
}
export async function downloadCompanion(json: string, format: 'json' | 'md' = 'json') { if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: format === 'json' ? 'application/json' : 'text/markdown' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = `ling-${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
} const result = await backend('export', { text: json, format }, 120000); await Linking.openURL(result.url); }

export async function beginChat(){if(!(await loadCompanionConfig()).background)return;try{await backend('begin_chat',{},6000);}catch(e){if(e instanceof Error&&e.message.includes('正在整理'))throw e;}}
export async function endChat(){if(await secureStore.get(AUTH))await backend('end_chat',{},6000);}
