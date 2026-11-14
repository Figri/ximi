alter table public.ling_devices add column if not exists busy_until timestamptz;
alter table public.ling_devices add column if not exists index_cursor bigint not null default 0;
create or replace function public.ling_write_records(p_device uuid,p_records jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; old public.ling_records; a jsonb:='[]'; conflicts jsonb:='[]';
begin
 if current_user<>'service_role' then raise exception 'service only' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_device::text,0));
 for r in select value from jsonb_array_elements(p_records) loop
  if r->>'kind' not in ('ling_threads','ling_messages','ling_message_versions','ling_memories','ling_memory_versions','ling_sources','ling_favorites','ling_usage','ling_daily_jobs','config') or r->>'id' is null or jsonb_typeof(r->'payload')<>'object' then raise exception 'invalid record'; end if;
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


create or replace function public.ling_begin_chat(p_device uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'service only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_device::text,0));
 if exists(select 1 from public.ling_runs where device_id=p_device and status<>'done' and locked_until>now()) then return false;end if;
 update public.ling_devices set busy_until=now()+interval '5 minutes' where id=p_device;
 return true;
end $$;
create or replace function public.ling_claim_day(p_device uuid,p_day text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'service only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_device::text,0));
 if exists(select 1 from public.ling_devices where id=p_device and busy_until>now()) then return false;end if;
 update public.ling_runs set locked_until=now()+interval '3 minutes',attempts=attempts+1 where device_id=p_device and day=p_day and status<>'done' and (locked_until is null or locked_until<now());
 return found;
end $$;
revoke all on function public.ling_begin_chat(uuid),public.ling_claim_day(uuid,text) from public,anon,authenticated;
grant execute on function public.ling_begin_chat(uuid),public.ling_claim_day(uuid,text) to service_role;
