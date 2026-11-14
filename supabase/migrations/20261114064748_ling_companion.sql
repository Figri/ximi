create extension if not exists vector with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create table public.ling_devices(id uuid primary key default gen_random_uuid(), token_hash text not null unique, credentials jsonb not null default '{}', config jsonb not null default '{}', active_thread text, push_token text, enabled boolean not null default false, next_run_at timestamptz, created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create sequence public.ling_revision_seq;
create table public.ling_records(device_id uuid not null references public.ling_devices(id) on delete cascade,kind text not null,id text not null,payload jsonb not null,version bigint not null default 1,revision bigint not null default nextval('public.ling_revision_seq'),updated_at timestamptz not null default now(),primary key(device_id,kind,id));
create index ling_records_cursor on public.ling_records(device_id,revision);
create table public.ling_chunks(device_id uuid not null references public.ling_devices(id) on delete cascade,source_id text not null,part integer not null,content_hash text not null,text text not null,embedding extensions.vector(384),model text not null default 'gte-small',primary key(device_id,source_id,part));
create table public.ling_runs(device_id uuid not null references public.ling_devices(id) on delete cascade,day text not null,status text not null default 'pending',cutoff timestamptz not null,parent_id text,carry jsonb not null default '[]',digest jsonb,morning text,error text,attempts integer not null default 0,locked_until timestamptz,push_status text not null default 'pending',push_ticket text,notion_status text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(device_id,day));
create table public.ling_notions(device_id uuid not null references public.ling_devices(id) on delete cascade,source_id text not null,content_hash text,page_id text,blocks_done integer not null default 0,error text,updated_at timestamptz not null default now(),primary key(device_id,source_id));
alter table public.ling_devices enable row level security;
alter table public.ling_records enable row level security;
alter table public.ling_chunks enable row level security;
alter table public.ling_runs enable row level security;
alter table public.ling_notions enable row level security;
revoke all on public.ling_devices,public.ling_records,public.ling_chunks,public.ling_runs,public.ling_notions from public,anon,authenticated;
grant all on public.ling_devices,public.ling_records,public.ling_chunks,public.ling_runs,public.ling_notions to service_role;
grant usage,select on sequence public.ling_revision_seq to service_role;
create or replace function public.ling_write_records(p_device uuid,p_records jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; old public.ling_records; a jsonb:='[]'; conflicts jsonb:='[]';
begin
 if current_user<>'service_role' then raise exception 'service only' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_device::text,0));
 for r in select value from jsonb_array_elements(p_records) loop
  if r->>'kind' not in ('ling_threads','ling_messages','ling_memories','ling_sources','ling_favorites','ling_usage','ling_daily_jobs','config') or r->>'id' is null or jsonb_typeof(r->'payload')<>'object' then raise exception 'invalid record'; end if;
  select * into old from public.ling_records where device_id=p_device and kind=r->>'kind' and id=r->>'id';
  if found and old.payload<>r->'payload' and old.version<>coalesce((r->>'expected')::bigint,0) then conflicts:=conflicts||jsonb_build_array(to_jsonb(old));end if;
 end loop;
 if jsonb_array_length(conflicts)>0 then return jsonb_build_object('acks','[]'::jsonb,'conflicts',conflicts);end if;
 for r in select value from jsonb_array_elements(p_records) loop
  insert into public.ling_records(device_id,kind,id,payload) values(p_device,r->>'kind',r->>'id',r->'payload') on conflict(device_id,kind,id) do update set payload=excluded.payload,version=public.ling_records.version+1,revision=nextval('public.ling_revision_seq'),updated_at=now() where public.ling_records.payload<>excluded.payload;
  select * into old from public.ling_records where device_id=p_device and kind=r->>'kind' and id=r->>'id';a:=a||jsonb_build_array(jsonb_build_object('kind',old.kind,'id',old.id,'version',old.version));
 end loop;
 return jsonb_build_object('acks',a,'conflicts','[]'::jsonb);
end $$;
revoke all on function public.ling_write_records(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ling_write_records(uuid,jsonb) to service_role;
create or replace function public.ling_match(p_device uuid,p_embedding extensions.vector(384),p_limit integer default 8) returns table(source_id text,text text,score double precision) language sql security invoker set search_path='' as $$
 select c.source_id,c.text,1-(c.embedding operator(extensions.<=>) p_embedding) from public.ling_chunks c where c.device_id=p_device and c.embedding is not null order by c.embedding operator(extensions.<=>) p_embedding limit least(greatest(p_limit,1),12)
$$;
revoke all on function public.ling_match(uuid,extensions.vector,integer) from public,anon,authenticated;
grant execute on function public.ling_match(uuid,extensions.vector,integer) to service_role;
create or replace function public.ling_commit_day(p_device uuid,p_day text,p_records jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare r jsonb; run public.ling_runs;
begin
 if current_user<>'service_role' then raise exception 'service only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_device::text,0));
 select * into run from public.ling_runs where device_id=p_device and day=p_day for update;
 if not found or run.morning is null or run.digest is null then raise exception 'memory and morning required';end if;
 if run.status='done' then return false;end if;
 for r in select value from jsonb_array_elements(p_records) loop
  insert into public.ling_records(device_id,kind,id,payload) values(p_device,r->>'kind',r->>'id',r->'payload') on conflict(device_id,kind,id) do nothing;
 end loop;
 update public.ling_records set payload=jsonb_set(payload,'{archived}','true'::jsonb),version=version+1,revision=nextval('public.ling_revision_seq'),updated_at=now() where device_id=p_device and kind='ling_threads' and id=run.parent_id;
 update public.ling_runs set status='done',error=null,locked_until=null,updated_at=now() where device_id=p_device and day=p_day;
 update public.ling_devices set active_thread='morning:'||p_day,next_run_at=((run.cutoff at time zone coalesce(config->>'timezone','Asia/Shanghai'))+interval '1 day') at time zone coalesce(config->>'timezone','Asia/Shanghai') where id=p_device;
 return true;
end $$;
revoke all on function public.ling_commit_day(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ling_commit_day(uuid,text,jsonb) to service_role;
create or replace function public.ling_worker_authorized(p_secret text) returns boolean language sql security definer set search_path='' as $$
 select current_user='postgres' and exists(select 1 from vault.decrypted_secrets where name='ling_worker_secret' and decrypted_secret=p_secret)
$$;
-- Only the Edge Function's service client can call the Vault comparison; no secret is returned.
revoke all on function public.ling_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.ling_worker_authorized(text) to service_role;
insert into storage.buckets(id,name,public) values('ling-exports','ling-exports',false) on conflict(id) do nothing;
