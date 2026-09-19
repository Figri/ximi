
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
