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

-- ============ seed：预置分类和情绪标签 ============
-- 表上没建 name 的唯一约束（分类名允许重复，比如不同父级下的同名次级分类），
-- 所以这里不用 on conflict 去重——重跑这段之前先在 Table Editor 清空
-- time_categories/time_tags，跟 seed.sql 的既有约定一致。
insert into time_categories (name, color, sort_order) values
  ('做饭', '#8B7BA8', 1), ('吃饭', '#8B5E2B', 2), ('玩', '#A78BCE', 3),
  ('睡觉', '#5CB88A', 4), ('运动', '#F5B841', 5), ('家务', '#E86F52', 6),
  ('项目', '#2E6DB4', 7), ('探索', '#3E3A7A', 8), ('社交', '#1FA69A', 9),
  ('色色', '#E8D96F', 10), ('收纳', '#8B5A2B', 11), ('ai', '#7A857D', 12);

insert into time_tags (name, color, sort_order) values
  ('状态很差', '#1E6B3A', 1), ('内耗中', '#3A1E4A', 2),
  ('状态比较好', '#6B5A1E', 3), ('状态很好', '#8B6F5A', 4),
  ('平静', '#B5654A', 5), ('崩溃', '#7A6B2B', 6);
