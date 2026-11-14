alter table public.ling_devices add column if not exists archive_cursor bigint not null default 0;
create or replace function public.ling_archive_parent(p_device uuid,p_parent text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'service only' using errcode='42501';end if;
 update public.ling_devices set credentials=jsonb_set(credentials,'{notion_parent}',to_jsonb(p_parent)) where id=p_device and credentials ? 'notion_token';
end $$;
revoke all on function public.ling_archive_parent(uuid,text) from public,anon,authenticated;
grant execute on function public.ling_archive_parent(uuid,text) to service_role;
