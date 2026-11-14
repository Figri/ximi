create or replace function public.ling_write_records(p_device uuid,p_records jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; old public.ling_records; a jsonb:='[]'; conflicts jsonb:='[]';
begin
 if current_user<>'service_role' then raise exception 'service only' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_device::text,0));
 for r in select value from jsonb_array_elements(p_records) loop
  if r->>'kind' not in ('ling_threads','ling_messages','ling_memories','ling_memory_versions','ling_sources','ling_favorites','ling_usage','ling_daily_jobs','config') or r->>'id' is null or jsonb_typeof(r->'payload')<>'object' then raise exception 'invalid record'; end if;
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

create or replace function public.ling_commit_day(p_device uuid,p_day text,p_records jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare r jsonb; run public.ling_runs; prior public.ling_records; history_id text;
begin
 if current_user<>'service_role' then raise exception 'service only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_device::text,0));
 select * into run from public.ling_runs where device_id=p_device and day=p_day for update;
 if not found or run.morning is null or run.digest is null then raise exception 'memory and morning required';end if;
 if run.status='done' then return false;end if;
 for r in select value from jsonb_array_elements(p_records) loop
  if r->>'kind'='ling_memories' then
    select * into prior from public.ling_records where device_id=p_device and kind='ling_memories' and id=r->>'id';
    if found then
      if prior.version<>coalesce((r->>'expected')::bigint,0) then raise exception 'memory changed during daily processing';end if;
      if prior.payload->>'text' is distinct from r->'payload'->>'text' or prior.payload->>'status' is distinct from r->'payload'->>'status' then
        history_id:='memory-version:'||prior.id||':'||prior.version;
        insert into public.ling_records(device_id,kind,id,payload) values(p_device,'ling_memory_versions',history_id,prior.payload||jsonb_build_object('id',history_id,'memory_id',prior.id,'saved_at',now())) on conflict do nothing;
      end if;
      update public.ling_records set payload=r->'payload',version=version+1,revision=nextval('public.ling_revision_seq'),updated_at=now() where device_id=p_device and kind='ling_memories' and id=prior.id;
    else insert into public.ling_records(device_id,kind,id,payload) values(p_device,'ling_memories',r->>'id',r->'payload');end if;
  else
    insert into public.ling_records(device_id,kind,id,payload) values(p_device,r->>'kind',r->>'id',r->'payload') on conflict(device_id,kind,id) do nothing;
  end if;
 end loop;
 update public.ling_records set payload=jsonb_set(payload,'{archived}','true'::jsonb),version=version+1,revision=nextval('public.ling_revision_seq'),updated_at=now() where device_id=p_device and kind='ling_threads' and id=run.parent_id;
 update public.ling_runs set status='done',error=null,locked_until=null,updated_at=now() where device_id=p_device and day=p_day;
 update public.ling_devices set active_thread='morning:'||p_day,next_run_at=((run.cutoff at time zone coalesce(config->>'timezone','Asia/Shanghai'))+interval '1 day') at time zone coalesce(config->>'timezone','Asia/Shanghai') where id=p_device;
 return true;
end $$;
revoke all on function public.ling_commit_day(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ling_commit_day(uuid,text,jsonb) to service_role;
