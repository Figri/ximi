-- 西米OS v1：可自定义底栏——用户选的底栏布局，顺手备份一份到云端。
-- 单用户app，一行记录就够：固定用 id='main' 做主键，upsert覆盖。

create table if not exists tab_layout (
  id text primary key default 'main',
  keys text[] not null,
  updated_at timestamptz default now()
);

alter table tab_layout disable row level security;
