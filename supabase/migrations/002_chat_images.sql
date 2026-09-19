-- 给聊天加拍照/发图功能要用到的：messages 表加图片字段 + 建一个存图片的 bucket。
-- 在 Supabase SQL Editor 里跑一次就行。

alter table messages add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

-- 单用户 APP，跟其它表一样不用精细的 RLS 策略，直接关掉（Storage 默认是开着的）。
alter table storage.objects disable row level security;
