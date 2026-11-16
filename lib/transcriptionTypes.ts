export interface TranscriptJob {id:string;url:string;platform:'bilibili'|'xiaoyuzhou';title:string;status:'queued'|'processing'|'done'|'failed';stage:string;method?:string;transcript?:string;error?:string;total_parts:number;completed_parts?:number;duration_seconds?:number;created_at:string;updated_at:string;}
export function mediaLink(text:string):{url:string;platform:'bilibili'|'xiaoyuzhou'}{
 const candidates:string[]=[...(text.match(/https?:\/\/[^\s<>"'）)\]】]+/g)??[])];const bv=text.trim().match(/^BV[a-zA-Z0-9]{10}$/);if(bv)candidates.unshift('https://www.bilibili.com/video/'+bv[0]);
 for(const candidate of candidates){let u:URL;try{u=new URL(candidate.replace(/[，。；！、]+$/,''));}catch{continue;}if(u.protocol!=='https:'||u.username||u.password||u.port)continue;const host=u.hostname.toLowerCase();
 if(host==='b23.tv'&&/^\/[A-Za-z0-9]+\/?$/.test(u.pathname))return {url:'https://b23.tv'+u.pathname.replace(/\/$/,''),platform:'bilibili'};
 if(['www.bilibili.com','bilibili.com','m.bilibili.com'].includes(host)){const id=u.pathname.match(/\/video\/(BV[a-zA-Z0-9]{10}|av\d+)(?:\/|$)/)?.[1];if(id){const p=Number(u.searchParams.get('p')??'1');if(!Number.isInteger(p)||p<1||p>999)throw new Error('分集编号不正确');return {url:'https://www.bilibili.com/video/'+id+(p>1?'?p='+p:''),platform:'bilibili'};}}
 if(['xiaoyuzhoufm.com','www.xiaoyuzhoufm.com'].includes(host)){const id=u.pathname.match(/^\/episode\/([a-fA-F0-9]{24})\/?$/)?.[1];if(id)return {url:'https://www.xiaoyuzhoufm.com/episode/'+id,platform:'xiaoyuzhou'};}
 }
 throw new Error('请粘贴B站视频或小宇宙单集的分享链接，暂不支持主页和合集。');
}
