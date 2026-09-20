-- 给聊天加拍照/发图功能要用到的：messages 表加图片字段 + 建一个存图片的 bucket。
-- 在 Supabase SQL Editor 里跑一次就行。

alter table messages add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

-- 单用户 APP，跟其它表一样想直接放开权限。但 SQL Editor 的角色不是
-- storage.objects 的 owner，没法直接 alter table disable row level security
-- （会报 42501 must be owner of table objects），改用 policy 允许这个 bucket
-- 下的所有操作，效果等价。
drop policy if exists "chat images full access" on storage.objects;
create policy "chat images full access"
on storage.objects for all
using (bucket_id = 'chat-images')
with check (bucket_id = 'chat-images');
