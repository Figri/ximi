create table public.transcription_jobs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.ling_devices(id) on delete cascade,
 source_key text not null, url text not null, platform text not null check(platform in ('bilibili','xiaoyuzhou')),
 title text not null default '', status text not null default 'queued' check(status in ('queued','processing','done','failed')),
 stage text not null default '等待后台处理', method text, transcript text, error text, api_key text,
 duration_seconds numeric, total_parts integer not null default 0, attempts integer not null default 0,
 lease_token uuid, lease_until timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,source_key)
);
create index transcription_owner_history on public.transcription_jobs(owner_id,created_at desc,id);
create index transcription_queue on public.transcription_jobs(status,lease_until,created_at);
create table public.transcription_parts(job_id uuid references public.transcription_jobs(id) on delete cascade,part integer not null check(part>=0),text text not null,primary key(job_id,part));
create table public.transcription_workers(id text primary key,token_hash text not null unique);
alter table public.transcription_jobs enable row level security;
alter table public.transcription_parts enable row level security;
alter table public.transcription_workers enable row level security;
revoke all on public.transcription_jobs,public.transcription_parts,public.transcription_workers from public,anon,authenticated;
grant all on public.transcription_jobs,public.transcription_parts,public.transcription_workers to service_role;
create function public.claim_transcription_job() returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.transcription_jobs;
begin
 if current_user<>'service_role' then raise exception 'service only' using errcode='42501';end if;
 update public.transcription_jobs set status='failed',stage='处理失败',error='后台多次中断，可点重试继续。',api_key=null,lease_token=null,lease_until=null where status='processing' and lease_until<now() and attempts>=5;
 select * into job from public.transcription_jobs where (status='queued' or (status='processing' and lease_until<now())) and attempts<5 order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.transcription_jobs set status='processing',stage='正在读取链接',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now() where id=job.id returning * into job;
 return to_jsonb(job)||jsonb_build_object('completed_parts',coalesce((select jsonb_agg(part order by part) from public.transcription_parts where job_id=job.id),'[]'::jsonb));
end $$;
create function public.checkpoint_transcription_job(p_id uuid,p_lease uuid,p_data jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.transcription_jobs;body text;parts integer;
begin
 if current_user<>'service_role' then raise exception 'service only' using errcode='42501';end if;
 select * into job from public.transcription_jobs where id=p_id and lease_token=p_lease and status='processing' for update;
 if not found then return false;end if;
 if p_data->>'action'='failed' then
  update public.transcription_jobs set status='failed',stage='处理失败',error=left(p_data->>'error',500),api_key=null,lease_token=null,lease_until=null,updated_at=now() where id=p_id;return true;
 end if;
 if p_data ? 'part' then
  if (p_data->>'part')::integer<0 or (p_data->>'part')::integer>=job.total_parts or jsonb_typeof(p_data->'text')<>'string' then raise exception 'invalid segment';end if;
  insert into public.transcription_parts(job_id,part,text) values(p_id,(p_data->>'part')::integer,p_data->>'text') on conflict(job_id,part) do update set text=excluded.text;
 end if;
 if p_data->>'action'='done' then
  if p_data->>'method'='captions' then body:=p_data->>'text';
  else
   select count(*)::integer,string_agg(text,E'\n\n' order by part) into parts,body from public.transcription_parts where job_id=p_id;
   if parts<>job.total_parts or parts=0 then raise exception 'incomplete transcript';end if;
  end if;
  if body is null or btrim(body)='' then raise exception 'no speech';end if;
  update public.transcription_jobs set status='done',stage='已完成',method=coalesce(p_data->>'method','deepseek'),transcript=body,error=null,api_key=null,lease_token=null,lease_until=null,updated_at=now() where id=p_id;return true;
 end if;
 update public.transcription_jobs set stage=coalesce(p_data->>'stage',stage),title=coalesce(p_data->>'title',title),method=coalesce(p_data->>'method',method),total_parts=coalesce((p_data->>'total_parts')::integer,total_parts),duration_seconds=coalesce((p_data->>'duration_seconds')::numeric,duration_seconds),lease_until=now()+interval '5 minutes',updated_at=now() where id=p_id;
 return true;
end $$;
revoke all on function public.claim_transcription_job(),public.checkpoint_transcription_job(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_transcription_job(),public.checkpoint_transcription_job(uuid,uuid,jsonb) to service_role;
