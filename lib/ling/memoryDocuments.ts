import type {Memory,MemoryKind} from './core';
export const MEMORY_KINDS:MemoryKind[]=['core','episode','agreement','state'];
export const MEMORY_LABELS:Record<MemoryKind,string>={core:'核心',episode:'经历',agreement:'约定',state:'近期状态'};
export function memoryEntry(m:Memory){const flags=[m.date,m.status==='done'?'已完成':m.status==='cancelled'?'已取消':'',m.authority==='inferred'?'待核对':''].filter(Boolean);return `• ${flags.length?'【'+flags.join(' · ')+'】 ':''}${m.text.replace(/\n/g,'\n  ')}`;}
export function memoryDocument(items:Memory[]){return items.map(memoryEntry).join('\n\n');}
export function planMemoryDocument(kind:MemoryKind,before:Memory[],text:string,newId:()=>string):Memory[]{
 const blocks=text.trim()?text.trim().split(/\n(?=• )/).map(s=>s.trim()).filter(Boolean):[];
 const used=new Set<string>(),matches=blocks.map(block=>{const old=before.find(m=>!used.has(m.id)&&memoryEntry(m)===block);if(old)used.add(old.id);return old;});
 const out:Memory[]=[];
 for(let i=0;i<blocks.length;i++){
  if(matches[i])continue;
  let left=-1,right=blocks.length;for(let j=i-1;j>=0;j--)if(matches[j]){left=j;break;}for(let j=i+1;j<blocks.length;j++)if(matches[j]){right=j;break;}const from=left<0?0:before.findIndex(m=>m.id===matches[left]!.id)+1,to=right===blocks.length?before.length:before.findIndex(m=>m.id===matches[right]!.id);const candidates=before.slice(from,to).filter(m=>!matches.some(x=>x?.id===m.id));const old=candidates.length===right-left-1?candidates[i-left-1]:undefined;if(old)used.add(old.id);
  let body=blocks[i].replace(/^• /,'').replace(/\n  /g,'\n'),date:string|undefined,status:Memory['status']='active';
  const meta=body.match(/^【((?:\d{4}-\d{2}-\d{2}|已完成|已取消|待核对)(?: · (?:\d{4}-\d{2}-\d{2}|已完成|已取消|待核对))*)】\s*/);
  if(meta){const flags=meta[1].split(' · ');date=flags.find(s=>/^\d{4}-\d{2}-\d{2}$/.test(s));status=flags.includes('已完成')?'done':flags.includes('已取消')?'cancelled':'active';body=body.slice(meta[0].length);}
  if(!body.trim()){if(old)out.push({...old,status:'forgotten',updated_at:new Date().toISOString()});continue;}
  out.push({...old,id:old?.id??newId(),kind,text:body.trim(),source_ids:old?.source_ids??[],date,status,pinned:true,authority:'explicit',updated_at:new Date().toISOString()});
 }
 for(const m of before)if(!used.has(m.id))out.push({...m,status:'forgotten',updated_at:new Date().toISOString()});
 return out;
}
