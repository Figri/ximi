import {deviceAuth} from './ling/cloud';
import {resolveBilibiliSource} from './bilibiliSource';
import {mediaLink} from './transcriptionTypes';
import {getApiKey} from './aiSettings';
export async function transcription(action:string,body:Record<string,unknown>={}){const url=process.env.EXPO_PUBLIC_SUPABASE_URL;if(!url)throw new Error('当前更新包未连接后台，请先检查更新');const auth=await deviceAuth(),control=new AbortController(),timer=setTimeout(()=>control.abort(),25000);try{const r=await fetch(url+'/functions/v1/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,...auth,action}),signal:control.signal});let result;try{result=await r.json();}catch{throw new Error('后台暂时无法连接，链接已保留，请稍后重试');}if(!r.ok||result.error)throw new Error(result.error??'后台暂时不可用');return result;}finally{clearTimeout(timer);}}
export async function transcribeMedia(url:string){const link=mediaLink(url),hint=link.platform==='bilibili'?await resolveBilibiliSource(url):undefined;return transcription('create',{url,source_hint:hint,api_key:await getApiKey('deepseek-chat')});}
export async function retryTranscript(id:string){const current=await transcription('get',{id}),hint=current.job.platform==='bilibili'?await resolveBilibiliSource(current.job.url):undefined;return transcription('retry',{id,source_hint:hint,api_key:await getApiKey('deepseek-chat')});}
