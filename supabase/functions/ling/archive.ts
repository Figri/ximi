import { sha, records, stamp, write } from './worker.ts';
async function attachLink(db:any,device:any,kind:string,id:string,url:string,expectedText:string){const {data:row,error}=await db.from('ling_records').select('*').eq('device_id',device.id).eq('kind',kind).eq('id',id).maybeSingle();if(error)throw error;if(!row||row.payload.text!==expectedText||row.payload.notion_url===url)return;const r=await db.rpc('ling_write_records',{p_device:device.id,p_records:[{kind,id,expected:row.version,payload:{...row.payload,notion_url:url,updated_at:stamp()}}]});if(r.error)throw r.error;}
export async function archiveNotion(db: any, device: any, fetcher = fetch) {
    const token = device.credentials.notion_token;
    let parent = device.credentials.notion_parent;
    if (!token)
        return { status: 'not_connected' };
    const call = async (path: string, body?: any) => { const res = await fetcher('https://api.notion.com/v1' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) }); if (!res.ok)
        throw new Error(`Notion归档失败（HTTP${res.status}）`); return res.json(); };
    if (!parent) {
        const result = await call('/search', { query: '灵的对话存档', filter: { value: 'page', property: 'object' } });
        parent = result.results?.find((r: any) => !r.archived)?.id;
        if (!parent)
            return { status: 'missing_parent' };
        const savedParent=await db.rpc('ling_archive_parent',{p_device:device.id,p_parent:parent});if(savedParent.error)throw savedParent.error;
    }
    const changed=await db.from('ling_records').select('*').eq('device_id',device.id).in('kind',['ling_favorites','ling_sources','ling_memories','ling_threads','ling_messages']).gt('revision',device.archive_cursor??0).order('revision').limit(40);if(changed.error)throw changed.error;
    const advance=async(revision:number)=>{const r=await db.from('ling_devices').update({archive_cursor:revision}).eq('id',device.id);if(r.error)throw r.error;};
    const get=async(kind:string,id:string)=>{const r=await db.from('ling_records').select('*').eq('device_id',device.id).eq('kind',kind).eq('id',id).maybeSingle();if(r.error)throw r.error;return r.data;};
    const candidates:any[]=[];
    for(const row of changed.data??[]){let source:any=null;const p=row.payload;
      if(row.kind==='ling_favorites'&&!p.deleted)source={...p,archive_id:p.id};
      if(row.kind==='ling_sources'&&!p.deleted&&['letter','script'].includes(p.type)){const f=await get('ling_favorites','favorite:'+p.id);if(!f||f.payload.deleted||f.payload.text!==p.text)source={...p,archive_id:p.id};}
      if(row.kind==='ling_memories'&&p.status!=='forgotten')source={...p,archive_id:'memory:'+p.id,title:'记忆 · '+p.text.slice(0,30),text:`${p.text}\n\n类型：${p.kind}\n状态：${p.status}${p.date?'\n日期：'+p.date:''}`};
      if(row.kind==='ling_threads'||row.kind==='ling_messages'){const thread=row.kind==='ling_threads'?row:await get('ling_threads',p.thread_id);if(thread?.payload.archived){const t=thread.payload;const messages:any[]=[];for(let offset=0;offset<100000;offset+=300){const result=await db.from('ling_records').select('payload').eq('device_id',device.id).eq('kind','ling_messages').eq('payload->>thread_id',t.id).order('id').range(offset,offset+299);if(result.error)throw result.error;messages.push(...result.data.map(r=>r.payload));if(result.data.length<300)break;}source={id:t.id,archive_id:'thread:'+t.id,title:t.title,text:messages.filter(m=>!m.deleted).sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(m=>`${m.role==='user'?'我':'灵'} · ${m.created_at}\n${m.content}`).join('\n\n')};}}
      if(source){candidates.push({...source,revision:row.revision});break;}await advance(row.revision);
    }
    for (const source of candidates) {
        const hash = await sha(source.text);
        let { data: entry } = await db.from('ling_notions').select('*').eq('device_id', device.id).eq('source_id', source.archive_id).maybeSingle();
        if(!entry&&source.source_id){const original=await db.from('ling_notions').select('*').eq('device_id',device.id).eq('source_id',source.source_id).maybeSingle();if(original.data?.content_hash===hash&&!original.data.error){entry={...original.data,source_id:source.archive_id};await db.from('ling_notions').upsert(entry);}}
        if(entry?.content_hash===hash&&!entry.error){if(!source.archive_id.startsWith('thread:')&&!source.archive_id.startsWith('memory:')){const kind=source.archive_id.startsWith('favorite:')?'ling_favorites':'ling_sources';await attachLink(db,device,kind,source.id,`https://www.notion.so/${entry.page_id.replace(/-/g,'')}`,source.text);}await advance(source.revision);continue;}
        // 已发布的旧版本保持可读；内容真的改变时使用带内容指纹的新页，重试按唯一标题定位。
        const title = `${source.title.slice(0, 60)} · ${(await sha(device.id + source.archive_id + hash)).slice(0, 16)}`;
        let page = entry?.content_hash === hash ? entry.page_id : null;
        let done = entry?.content_hash === hash ? entry.blocks_done : 0;
        try {
            if (!page) {
                const existing = await call('/search', { query: title, filter: { value: 'page', property: 'object' } });
                page = existing.results?.find((r: any) => r.parent?.page_id === parent && !r.archived)?.id;
                if (!page) {
                    const result = await call('/pages', { parent: { type: 'page_id', page_id: parent }, properties: { title: { title: [{ type: 'text', text: { content: title } }] } } });
                    page = result.id;
                }
                else {
                    let count = 0, cursor;
                    do {
                        const result = await call(`/blocks/${page}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`);
                        count += result.results.length;
                        cursor = result.has_more ? result.next_cursor : null;
                    } while (cursor);
                    done = count;
                }
            }
            await db.from('ling_notions').upsert({ device_id: device.id, source_id: source.archive_id, content_hash: hash, page_id: page, blocks_done: done, error: 'saving', updated_at: stamp() });
            if(entry?.error&&page){let cursor:string|undefined;done=0;do{const existing=await call(`/blocks/${page}/children?page_size=100${cursor?'&start_cursor='+cursor:''}`);done+=existing.results.length;cursor=existing.has_more?existing.next_cursor:undefined;}while(cursor);}
            const chars = Array.from(source.text);
            const blocks = [];
            for (let i = 0; i < chars.length; i += 1800)
                blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: chars.slice(i, i + 1800).join('') } }] } });
            if (done < blocks.length) {
                const count = Math.min(80, blocks.length - done);
                const res = await fetcher(`https://api.notion.com/v1/blocks/${page}/children`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ children: blocks.slice(done, done + count) }), signal: AbortSignal.timeout(25000) });
                if (!res.ok)
                    throw new Error(`Notion归档失败（HTTP${res.status}）`);
                done += count;
            }
            await db.from('ling_notions').update({ blocks_done: done, error: done >= blocks.length ? null : 'saving', updated_at: stamp() }).eq('device_id', device.id).eq('source_id', source.archive_id);
            if(done>=blocks.length){const url=`https://www.notion.so/${page.replace(/-/g,'')}`;const kind=source.archive_id.startsWith('favorite:')?'ling_favorites':source.archive_id.startsWith('thread:')||source.archive_id.startsWith('memory:')?null:'ling_sources';if(kind)await attachLink(db,device,kind,source.id,url,source.text);if(kind==='ling_favorites'&&source.source_id)await attachLink(db,device,'ling_sources',source.source_id,url,source.text);}
            if(done>=blocks.length)await advance(source.revision);
            return { status: done >= blocks.length ? 'saved' : 'saving', source_id: source.archive_id };
        }
        catch (e) {
            await db.from('ling_notions').upsert({ device_id: device.id, source_id: source.archive_id, content_hash: hash, page_id: page, blocks_done: done, error: e instanceof Error ? e.message : '归档失败', updated_at: stamp() });
            return { status: 'failed', error: e instanceof Error ? e.message : '归档失败' };
        }
    }
    return { status: 'up_to_date' };
}
