create or replace function public.ling_commit_day(p_device uuid,p_day text,p_records jsonb,p_messages jsonb,p_threads jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare r jsonb; committed boolean;
begin
 if current_user<>'service_role' then raise exception 'service only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_device::text,0));
 for r in select value from jsonb_array_elements(p_messages) loop
  if not exists(select 1 from public.ling_records where device_id=p_device and kind='ling_messages' and id=r->>'id' and version=(r->>'expected')::bigint and coalesce(payload->>'deleted','false')<>'true') then raise exception 'source changed during daily processing';end if;
 end loop;
 committed:=public.ling_commit_day(p_device,p_day,p_records);
 if committed then perform public.ling_finish_digest(p_device,p_messages,p_threads);end if;
 return committed;
end $$;
revoke all on function public.ling_commit_day(uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ling_commit_day(uuid,text,jsonb,jsonb,jsonb) to service_role;
