-- 西米OS v2：独立的事项待办模块。自己的分类体系，不跟time_categories共用——
-- 后续"事项与时间打通"会关联到时间记录，但那是单独的计划，这次先各管各的。

-- ============ 事项分类 ============
create table if not exists todo_categories (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  color text not null,
  sort_order int default 0,
  archived boolean default false,
  created_at timestamptz default now()
);

-- ============ 事项 ============
create table if not exists todo_items (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  category_id uuid references todo_categories(id),
  important boolean default false,
  date date not null, -- 重复事项的起算点，不重复事项就是它归属的那天
  repeat_type text not null default 'none' check (repeat_type in ('none', 'daily', 'weekly', 'monthly')),
  repeat_weekdays int[] default null, -- repeat_type='weekly'时用，0=周日...6=周六
  repeat_day_of_month int default null, -- repeat_type='monthly'时用，1-31；0表示"最后一天"
  reminder_enabled boolean default false,
  reminder_time text default null, -- 'HH:MM'，一个重复事项所有周期共用这一个时间点
  done boolean default false, -- 只对repeat_type='none'的事项有意义
  completed_at timestamptz default null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ============ 重复事项的按天完成记录 ============
-- 某个repeat_type != 'none'的todo在某天被勾完成，这里插一条；判断"今天是否已完成"
-- 就看有没有(todo_id, date)这一条，不用写任何"到点自动重置"的逻辑
create table if not exists todo_completions (
  id uuid default gen_random_uuid() primary key,
  todo_id uuid references todo_items(id) on delete cascade,
  date date not null,
  created_at timestamptz default now(),
  unique (todo_id, date)
);

create index if not exists idx_todo_items_date on todo_items(date);
create index if not exists idx_todo_completions_todo_date on todo_completions(todo_id, date);

alter table todo_categories disable row level security;
alter table todo_items disable row level security;
alter table todo_completions disable row level security;

-- 默认分类不在这里seed——照时间日志那套的做法，app启动时幂等播种
-- (lib/todoLocal.ts 的 loadCategories，AsyncStorage标志防重复)，避免用户
-- 删掉的默认分类被这个migration重新灌回去。
