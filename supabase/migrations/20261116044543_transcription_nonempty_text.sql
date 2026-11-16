create or replace function public.checkpoint_transcription_job(p_id uuid,p_lease uuid,p_data jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
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
  if body is null or body ~ '^[[:space:]]*$' then raise exception 'no speech';end if;
  update public.transcription_jobs set status='done',stage='已完成',method=coalesce(p_data->>'method','deepseek'),transcript=body,error=null,api_key=null,lease_token=null,lease_until=null,updated_at=now() where id=p_id;return true;
 end if;
 update public.transcription_jobs set stage=coalesce(p_data->>'stage',stage),title=coalesce(p_data->>'title',title),method=coalesce(p_data->>'method',method),total_parts=coalesce((p_data->>'total_parts')::integer,total_parts),duration_seconds=coalesce((p_data->>'duration_seconds')::numeric,duration_seconds),lease_until=now()+interval '5 minutes',updated_at=now() where id=p_id;
 return true;
end $$;
revoke all on function public.checkpoint_transcription_job(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.checkpoint_transcription_job(uuid,uuid,jsonb) to service_role;
