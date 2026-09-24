-- 西米OS v1.1：时间tab升级——色块甘特图时间日志
-- 独立于现有 timeline_entries（那张表是给AI做梦总结用的固定枚举分类，
-- 这里要的是用户自建两级分类+颜色，语义不同，不混用），新建三张表。

-- ============ 一级/次级分类 ============
create table if not exists time_categories (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  color text not null,
  parent_id uuid references time_categories(id) on delete cascade,
  default_description text,
  sort_order int default 0,
  archived boolean default false,
  created_at timestamptz default now()
);

-- ============ 情绪标签 ============
create table if not exists time_tags (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  color text not null,
  sort_order int default 0,
  archived boolean default false,
  created_at timestamptz default now()
);

-- ============ 时间块记录 ============
create table if not exists time_logs (
  id uuid default gen_random_uuid() primary key,
  category_id uuid references time_categories(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  description text,
  tag_ids uuid[] default '{}',
  source text default 'manual',
  created_at timestamptz default now()
);

create index if not exists idx_time_logs_start on time_logs(start_time desc);
create index if not exists idx_time_categories_parent on time_categories(parent_id);

alter table time_logs disable row level security;
alter table time_categories disable row level security;
alter table time_tags disable row level security;

-- 默认分类/情绪标签不在这里 seed 了——改成 app 启动时自动幂等播种
-- （lib/timelog.ts 的 seedDefaultsIfNeeded，用 AsyncStorage 标志防重复），
-- 不用再手动跑 SQL insert，用户在管理页删掉的分类/标签也不会被这个
-- migration 重新灌回去。
