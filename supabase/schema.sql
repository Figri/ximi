-- 西米OS 数据库结构
-- 单用户 APP，不需要 RLS / 多用户隔离。
-- 在 Supabase SQL Editor 中直接运行本文件。

create extension if not exists "pgcrypto";

-- 卡片（核心表，万物皆卡片）
create table if not exists cards (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  type text default 'habit',        -- habit / timer / info / collection
  tags text[] default '{}',         -- ['🐱猫', '🏠家务']
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  archived boolean default false
);

-- 动作（每张卡片可以有多个动作）
create table if not exists actions (
  id uuid default gen_random_uuid() primary key,
  card_id uuid references cards(id) on delete cascade,
  name text not null,                -- '铲了' / '加砂' / '换新砂'
  is_primary boolean default true,   -- 主动作显示，次要折叠
  -- 频率设置
  frequency_type text default 'interval',  -- interval / fixed_day / manual
  interval_days float,               -- 衰减周期（天数）
  fixed_days int[],                  -- 固定星期几 [1,3,5] = 周一三五
  fixed_dates int[],                 -- 固定每月几号 [1,15]
  suggested_interval float,          -- 建议X天做一次（变黄）
  max_delay float,                   -- 最大延迟X天（变红）
  -- 联动
  linked_action_ids uuid[],          -- 按此动作时同时触发的其他动作ID
  -- 选猫（部分动作需要选择哪几只猫）
  requires_selection boolean default false,
  -- 时间段（只在这个时间段提醒）
  active_hours_start time,
  active_hours_end time,
  created_at timestamptz default now()
);

-- 完成记录
create table if not exists completions (
  id uuid default gen_random_uuid() primary key,
  action_id uuid references actions(id) on delete cascade,
  card_id uuid references cards(id) on delete cascade,
  completed_at timestamptz default now(),
  notes text,
  selected_cats uuid[],              -- 如果需要选猫，记录选了哪些
  undone boolean default false       -- 撤销标记
);

-- 卡片关联（卡片之间的链接）
create table if not exists card_links (
  id uuid default gen_random_uuid() primary key,
  from_card_id uuid references cards(id) on delete cascade,
  to_card_id uuid references cards(id) on delete cascade,
  link_type text default 'related'   -- related / parent / reference
);

-- 收藏（特殊类型的卡片，内容更丰富）
create table if not exists collections (
  id uuid default gen_random_uuid() primary key,
  card_id uuid references cards(id) on delete cascade,
  content text,                      -- 文字内容
  url text,                          -- 链接
  image_url text,                    -- 图片
  source text                        -- 来源：chat / manual
);

-- 猫信息
create table if not exists cats (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  gender text,                       -- ♀ / ♂
  avatar_url text,
  notes text,
  created_at timestamptz default now()
);

-- 猫事件时间线
create table if not exists cat_events (
  id uuid default gen_random_uuid() primary key,
  cat_id uuid references cats(id) on delete cascade,
  event_type text,                   -- 绝育 / 疫苗 / 看医生 / 体重 / 其他
  description text,
  value float,                       -- 体重数值等
  event_date date not null,
  created_at timestamptz default now()
);

-- 时间轴记录
create table if not exists timeline_entries (
  id uuid default gen_random_uuid() primary key,
  start_time timestamptz not null,
  end_time timestamptz,
  category text,                     -- sleep / eat / work / play / cat / exercise
  description text,
  app_name text,                     -- 屏幕时间：APP名
  image_url text,                    -- 饮食照片等
  source text default 'manual',      -- manual / chat / screen_time
  created_at timestamptz default now()
);

-- 烦恼
create table if not exists worries (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  tags text[] default '{}',          -- ['💔感情', '🐱猫']
  severity text default 'medium',    -- light / medium / heavy
  status text default 'active',      -- active / resolved / let_go
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- 每日AI总结
create table if not exists daily_summaries (
  id uuid default gen_random_uuid() primary key,
  date date not null unique,
  body_summary text,
  sleep_summary text,
  food_summary text,
  emotion_summary text,
  worry_summary text,
  plan_summary text,
  dream_summary text,
  intimate_summary text,
  hp int,
  mp int,
  created_at timestamptz default now()
);

-- 聊天消息
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  role text not null,                 -- user / assistant
  content text not null,
  model text,                        -- claude-sonnet / gpt-4o / ...
  created_at timestamptz default now()
);

-- 用户设置
create table if not exists settings (
  key text primary key,
  value jsonb
);

-- 标签定义（用户自定义）
create table if not exists tags (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,         -- '🐱猫'
  emoji text,                        -- '🐱'
  sort_order int default 0
);

-- 项目追踪
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  status text default 'idea',        -- idea / active / paused / done
  description text,
  linked_worry_ids uuid[],
  linked_card_ids uuid[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 项目日志
create table if not exists project_logs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  content text,
  source text default 'manual',      -- manual / chat
  created_at timestamptz default now()
);

-- 索引
create index if not exists idx_actions_card_id on actions(card_id);
create index if not exists idx_completions_action_id on completions(action_id);
create index if not exists idx_completions_card_id on completions(card_id);
create index if not exists idx_completions_completed_at on completions(completed_at desc);
create index if not exists idx_cat_events_cat_id on cat_events(cat_id);
create index if not exists idx_timeline_entries_start_time on timeline_entries(start_time desc);
create index if not exists idx_messages_created_at on messages(created_at);
create index if not exists idx_cards_tags on cards using gin(tags);

-- 单用户 APP：关闭 RLS（数据只从可信客户端访问）
alter table cards disable row level security;
alter table actions disable row level security;
alter table completions disable row level security;
alter table card_links disable row level security;
alter table collections disable row level security;
alter table cats disable row level security;
alter table cat_events disable row level security;
alter table timeline_entries disable row level security;
alter table worries disable row level security;
alter table daily_summaries disable row level security;
alter table messages disable row level security;
alter table settings disable row level security;
alter table tags disable row level security;
alter table projects disable row level security;
alter table project_logs disable row level security;
