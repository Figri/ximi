-- 健康数据：Galaxy Watch → 三星健康 → Health Connect → HC Webhook → Edge Function health-ingest → 这张表
-- 读：touchDoll MCP 用 anon key 调下面两个只读函数（要带读密钥），表本身开 RLS、不给 anon 直接读写。
-- 密钥只存哈希（private.health_secrets），明文不进仓库。

create table if not exists public.health_records (
  id          bigint generated always as identity primary key,
  type        text not null,              -- sleep / steps / heart_rate / exercise / skin_temp / …（HC Webhook 的键名，skin_temperature 记成 skin_temp）
  start_time  timestamptz not null,
  end_time    timestamptz not null,       -- 瞬时数据（心率、体温…）start_time = end_time
  value       jsonb not null default '{}'::jsonb,   -- 解析好的值（睡眠：各阶段分钟数；运动：类型中文名、时长…）
  raw         jsonb,                      -- 这一条原样；type = 'payload' 的行是整包原样
  source      text,                       -- 写数据的 App 包名（三星健康 com.sec.android.app.shealth）
  created_at  timestamptz not null default now(),
  constraint health_records_type_time_key unique (type, start_time, end_time)
);

create index if not exists health_records_start_idx on public.health_records (type, start_time);
create index if not exists health_records_end_idx on public.health_records (type, end_time);
create index if not exists health_records_hc_id_idx on public.health_records ((raw -> 'metadata' ->> 'id')) where raw ? 'metadata';

alter table public.health_records enable row level security;
revoke all on public.health_records from anon, authenticated;

-- ---------- 密钥（只存 sha256） ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.health_secrets (
  name text primary key,    -- 'ingest'（手机 HC Webhook 用） / 'read'（touchDoll MCP 用）
  sha256 text not null
);

create or replace function private.health_secret_ok(p_name text, p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from private.health_secrets s
    where s.name = p_name
      and s.sha256 = encode(pg_catalog.sha256(convert_to(p_secret, 'UTF8')), 'hex')
  );
$$;

-- ---------- 写：Edge Function 调（带手机上配的密钥） ----------
create or replace function public.health_ingest_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.health_secret_ok('ingest', p_secret); $$;

-- p_rows: [{type,start_time,end_time,value,raw,source}]，同一批里 (type,start,end) 已经去过重
-- p_replace_ids: [{type,id}]：同一个 Health Connect 记录 id 先删旧行（改过时间的睡眠 / 运动），也用于 deleted
create or replace function public.health_ingest(p_secret text, p_rows jsonb, p_replace_ids jsonb default '[]'::jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not private.health_secret_ok('ingest', p_secret) then
    raise exception 'bad secret' using errcode = '42501';
  end if;

  delete from public.health_records r
  using jsonb_to_recordset(coalesce(p_replace_ids, '[]'::jsonb)) as d(type text, id text)
  where r.type = d.type and r.raw -> 'metadata' ->> 'id' = d.id;

  insert into public.health_records (type, start_time, end_time, value, raw, source)
  select x.type, x.start_time, x.end_time, coalesce(x.value, '{}'::jsonb), x.raw, x.source
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
    as x(type text, start_time timestamptz, end_time timestamptz, value jsonb, raw jsonb, source text)
  on conflict (type, start_time, end_time) do update
    set value = excluded.value, raw = excluded.raw, source = excluded.source, created_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------- 读：touchDoll MCP 调（带读密钥），「一天」按北京时间，睡眠算在醒来那天 ----------

-- 某几天（北京时间，含两头）的睡眠，每段一个对象
create or replace function public.health_sleep(p_secret text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.health_secret_ok('read', p_secret) then
    raise exception 'bad secret' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'wake_date', (r.end_time at time zone 'Asia/Shanghai')::date,
      'start', r.start_time,
      'end', r.end_time,
      'value', r.value,
      'source', r.source
    ) order by r.end_time)
    from public.health_records r
    where r.type = 'sleep'
      and r.end_time >= (p_from::timestamp at time zone 'Asia/Shanghai')
      and r.end_time <  ((p_to + 1)::timestamp at time zone 'Asia/Shanghai')
  ), '[]'::jsonb);
end;
$$;

-- 一天的汇总：睡眠（醒来那天）、步数、运动、心率
create or replace function public.health_day(p_secret text, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d0 timestamptz := (p_date::timestamp at time zone 'Asia/Shanghai');
  d1 timestamptz := ((p_date + 1)::timestamp at time zone 'Asia/Shanghai');
begin
  if not private.health_secret_ok('read', p_secret) then
    raise exception 'bad secret' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'date', p_date,
    'sleep', coalesce((
      select jsonb_agg(jsonb_build_object('start', r.start_time, 'end', r.end_time, 'value', r.value) order by r.end_time)
      from public.health_records r
      where r.type = 'sleep' and r.end_time >= d0 and r.end_time < d1
    ), '[]'::jsonb),
    'steps', (
      select jsonb_build_object('total', coalesce(sum((r.value ->> 'count')::numeric), 0), 'records', count(*))
      from public.health_records r
      where r.type = 'steps' and r.start_time >= d0 and r.start_time < d1
    ),
    'exercise', coalesce((
      select jsonb_agg(jsonb_build_object('start', r.start_time, 'end', r.end_time, 'value', r.value) order by r.start_time)
      from public.health_records r
      where r.type = 'exercise' and r.start_time >= d0 and r.start_time < d1
    ), '[]'::jsonb),
    'heart_rate', (
      select jsonb_build_object(
        'avg', round(avg((r.value ->> 'bpm')::numeric), 1),
        'min', min(coalesce((r.value ->> 'min')::numeric, (r.value ->> 'bpm')::numeric)),
        'max', max(coalesce((r.value ->> 'max')::numeric, (r.value ->> 'bpm')::numeric)),
        'samples', count(*))
      from public.health_records r
      where r.type = 'heart_rate' and r.start_time >= d0 and r.start_time < d1
    ),
    'resting_heart_rate', (
      select round(avg((r.value ->> 'bpm')::numeric), 1)
      from public.health_records r
      where r.type = 'resting_heart_rate' and r.start_time >= d0 and r.start_time < d1
    ),
    'last_sync', (select max(r.created_at) from public.health_records r where r.type = 'payload')
  );
end;
$$;

revoke all on function private.health_secret_ok(text, text) from public, anon, authenticated;
revoke all on function public.health_ingest_ok(text) from public;
revoke all on function public.health_ingest(text, jsonb, jsonb) from public;
revoke all on function public.health_sleep(text, date, date) from public;
revoke all on function public.health_day(text, date) from public;
grant execute on function public.health_ingest_ok(text) to anon, service_role;
grant execute on function public.health_ingest(text, jsonb, jsonb) to anon, service_role;
grant execute on function public.health_sleep(text, date, date) to anon, service_role;
grant execute on function public.health_day(text, date) to anon, service_role;
