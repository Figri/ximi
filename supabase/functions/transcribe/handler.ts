import {mediaLink,sourceHint} from './types.ts';
const columns='id,url,platform,title,status,stage,method,error,total_parts,duration_seconds,created_at,updated_at';
async function hash(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function transcriptionHandler(db:any,body:any,verifyWorker:(token:string)=>Promise<string|null>=async()=>null){
 if(body.action==='claim'||body.action==='checkpoint'){
  if(typeof body.worker_token!=='string'||body.worker_token.length<40)return {status:401,error:'无权处理任务'};
  const identity=await verifyWorker(body.worker_token);if(!identity)return {status:401,error:'无权处理任务'};const auth=await db.from('transcription_workers').select('id').eq('token_hash',await hash(identity)).maybeSingle();if(auth.error)throw auth.error;if(!auth.data)return {status:401,error:'无权处理任务'};
  const result=body.action==='claim'?await db.rpc('claim_transcription_job'):await db.rpc('checkpoint_transcription_job',{p_id:body.id,p_lease:body.lease_token,p_data:body.data});if(result.error)throw result.error;
  return body.action==='claim'?{job:result.data}:result.data?{ok:true}:{status:409,error:'任务已删除或由其他进程接手'};
 }
 if(typeof body.device_id!=='string'||typeof body.token!=='string'||body.token.length<40)return {status:401,error:'请保留本机数据，重新连接后台'};
 const owner=await db.from('ling_devices').select('id').eq('id',body.device_id).eq('token_hash',await hash(body.token)).maybeSingle();if(owner.error)throw owner.error;if(!owner.data)return {status:401,error:'手机后台凭证无效'};const ownerId=owner.data.id;
 if(body.action==='create'){
  const link=mediaLink(String(body.url??'')),sourceKey=await hash(link.url);const existing=await db.from('transcription_jobs').select(columns).eq('owner_id',ownerId).eq('source_key',sourceKey).maybeSingle();if(existing.error)throw existing.error;if(existing.data)return {job:existing.data,reused:true};
  const pending=await db.from('transcription_jobs').select('id',{count:'exact',head:true}).eq('owner_id',ownerId).in('status',['queued','processing']);if(pending.error)throw pending.error;if(pending.count>=3)return {status:429,error:'已有三个任务等待处理，请完成后再添加。'};
  const created=await db.from('transcription_jobs').insert({owner_id:ownerId,source_key:sourceKey,...link,source_hint:link.platform==='bilibili'?sourceHint(body.source_hint):null,api_key:typeof body.api_key==='string'?body.api_key:null}).select(columns).single();if(created.error){if(created.error.code==='23505'){const again=await db.from('transcription_jobs').select(columns).eq('owner_id',ownerId).eq('source_key',sourceKey).single();if(again.error)throw again.error;return {job:again.data,reused:true};}throw created.error;}return {job:created.data};
 }
 if(body.action==='list'){const offset=Math.max(0,Math.min(100000,Number(body.offset)||0));const r=await db.from('transcription_jobs').select(columns).eq('owner_id',ownerId).order('created_at',{ascending:false}).order('id').range(offset,offset+24);if(r.error)throw r.error;return {jobs:r.data,has_more:r.data.length===25};}
 const job=await db.from('transcription_jobs').select(columns+',transcript').eq('id',body.id).eq('owner_id',ownerId).maybeSingle();if(job.error)throw job.error;if(!job.data)return {status:404,error:'这条记录已删除或无法访问'};
 if(body.action==='get'){const count=await db.from('transcription_parts').select('part',{count:'exact',head:true}).eq('job_id',job.data.id);if(count.error)throw count.error;return {job:{...job.data,completed_parts:count.count}};}
 if(body.action==='delete'){const r=await db.from('transcription_jobs').delete().eq('id',job.data.id).eq('owner_id',ownerId);if(r.error)throw r.error;return {ok:true};}
 if(body.action==='retry'){if(job.data.status!=='failed')return {job:job.data};const r=await db.from('transcription_jobs').update({status:'queued',stage:'等待后台继续处理',error:null,attempts:0,lease_token:null,lease_until:null,api_key:typeof body.api_key==='string'?body.api_key:null,...(sourceHint(body.source_hint)?{source_hint:sourceHint(body.source_hint)}:{}),updated_at:new Date().toISOString()}).eq('id',job.data.id).eq('owner_id',ownerId).eq('status','failed').select(columns).single();if(r.error)throw r.error;return {job:r.data};}
 return {status:400,error:'未知操作'};
}
