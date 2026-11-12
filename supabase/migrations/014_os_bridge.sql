-- Additive migration: does not touch legacy tables or their data.
-- Existing mobile records remain local until the owner signs in and enables sync.
create table public.ximi_fragments (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  record_date date,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  version bigint not null check (version > 0),
  revision bigint generated always as identity,
  deleted boolean not null default false,
  source text not null check (source in ('os', 'chatgpt')),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table public.ximi_reviews (like public.ximi_fragments including all);
alter table public.ximi_reviews add foreign key (user_id) references auth.users(id) on delete cascade;
-- Read context from existing local stores: time blocks, habit definitions/check-ins,
-- moods and tasks. Kept separately from fragments and full review bodies.
create table public.ximi_context (like public.ximi_fragments including all);
alter table public.ximi_context add foreign key (user_id) references auth.users(id) on delete cascade;

create table public.ximi_sync_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
create table public.ximi_record_versions (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  id text not null,
  version bigint not null,
  record jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, id, version)
);

do $$
declare t text;
begin
  foreach t in array array['ximi_fragments','ximi_reviews','ximi_context','ximi_sync_operations','ximi_record_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy owner_read on public.%I for select to authenticated using (user_id = auth.uid())', t);
  end loop;
  foreach t in array array['ximi_fragments','ximi_reviews','ximi_context'] loop
    execute format('create index on public.%I (user_id, record_date, id)', t);
    execute format('create index on public.%I (user_id, revision)', t);
  end loop;
end $$;

-- One record per transaction: durable idempotency, CAS, audit and history.
-- All caller identity comes from the JWT; no caller-supplied user_id.
create function public.ximi_write_record(
  p_kind text, p_id text, p_date date, p_payload jsonb,
  p_expected_version bigint, p_operation_id uuid,
  p_source text default 'chatgpt', p_deleted boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); t text; h text; old_record jsonb; new_record jsonb;
  cached public.ximi_sync_operations%rowtype; result jsonb; v bigint;
begin
  if u is null then raise exception 'authentication required' using errcode = '42501'; end if;
  t := case p_kind when 'fragment' then 'ximi_fragments' when 'review' then 'ximi_reviews' when 'context' then 'ximi_context' end;
  if t is null or coalesce(p_id, '') = '' or p_operation_id is null
     or p_expected_version is null or p_expected_version < 0
     or p_source is null or p_source not in ('os','chatgpt')
     or p_deleted is null or jsonb_typeof(p_payload) is distinct from 'object'
     or p_payload->>'id' is distinct from p_id
     or (p_kind in ('fragment','review') and p_date is null)
     or (p_kind = 'fragment' and (jsonb_typeof(p_payload->'text') is distinct from 'string' or jsonb_typeof(p_payload->'at') is distinct from 'string'))
     or (p_kind = 'review' and (jsonb_typeof(p_payload->'body') is distinct from 'string' or jsonb_typeof(p_payload->'at') is distinct from 'string'))
     or (p_kind = 'context' and p_source <> 'os') then
    raise exception 'invalid record' using errcode = '22023';
  end if;
  -- Serializes writes for one owner, including duplicate requests and new IDs.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text, 0));
  h := encode(pg_catalog.sha256(convert_to(jsonb_build_array(p_kind,p_id,p_date,p_payload,p_expected_version,p_source,p_deleted)::text,'UTF8')),'hex');
  select * into cached from public.ximi_sync_operations where user_id=u and operation_id=p_operation_id;
  if found then
    if cached.request_hash <> h then raise exception 'operation id reused with different data' using errcode = '22023'; end if;
    return cached.result;
  end if;
  execute format('select to_jsonb(r) from public.%I r where user_id=$1 and id=$2',t) into old_record using u,p_id;
  v := coalesce((old_record->>'version')::bigint,0);
  if v <> p_expected_version then
    result := jsonb_build_object('ok',false,'code','conflict','current',old_record);
  else
    -- AI edits must retain existing mood links and other mobile metadata that
    -- the narrow MCP input schema does not expose. OS sends complete snapshots.
    if p_source = 'chatgpt' then
      p_payload := coalesce(old_record->'payload','{}'::jsonb) || p_payload;
    end if;
    execute format('insert into public.%I as r (user_id,id,record_date,payload,version,source,deleted)
      values ($1,$2,$3,$4,$5,$6,$7) on conflict (user_id,id) do update
      set record_date=excluded.record_date,payload=excluded.payload,version=excluded.version,
          source=excluded.source,deleted=excluded.deleted,updated_at=clock_timestamp(),revision=default
      returning to_jsonb(r)',t)
      into new_record using u,p_id,p_date,p_payload,v+1,p_source,p_deleted;
    insert into public.ximi_record_versions(user_id,kind,id,version,record) values(u,p_kind,p_id,v+1,new_record);
    result := jsonb_build_object('ok',true,'record',new_record);
  end if;
  insert into public.ximi_sync_operations(user_id,operation_id,request_hash,result) values(u,p_operation_id,h,result);
  return result;
end $$;
revoke all on function public.ximi_write_record(text,text,date,jsonb,bigint,uuid,text,boolean) from public,anon;
grant execute on function public.ximi_write_record(text,text,date,jsonb,bigint,uuid,text,boolean) to authenticated;

-- Bounded pages, including tombstones for device catch-up. Each kind has its own
-- revision sequence: clients keep a cursor per kind. Writes are owner-serialized.
create function public.ximi_read_records(
  p_kind text, p_date date default null, p_after bigint default 0,
  p_limit integer default 100, p_query text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare t text; result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  t := case p_kind when 'fragment' then 'ximi_fragments' when 'review' then 'ximi_reviews' when 'context' then 'ximi_context' end;
  if t is null or p_after is null or p_after < 0 or p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'invalid query' using errcode = '22023';
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by revision),''[]''::jsonb) from
    (select * from public.%I where user_id=auth.uid() and ($1 is null or record_date=$1)
      and revision>$2 and ($4 is null or position(lower($4) in lower(payload::text))>0)
      order by revision limit $3) r',t)
    into result using p_date,p_after,p_limit,p_query;
  return result;
end $$;
revoke all on function public.ximi_read_records(text,date,bigint,integer,text) from public,anon;
grant execute on function public.ximi_read_records(text,date,bigint,integer,text) to authenticated;
