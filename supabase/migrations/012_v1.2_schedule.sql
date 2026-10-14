-- 西米OS v1.2：日程模块——备忘录式日历。
-- 作息模板走"版本制"：改模板=新增一个effective_from=明天的新版本，不覆盖旧版本，
-- 过去任意一天渲染时找"effective_from<=该日期"的最新版本，天然保证历史不被
-- 悄悄改写、不用每天存快照。

-- ============ 作息模板版本 ============
create table if not exists schedule_template_version (
  id uuid default gen_random_uuid() primary key,
  effective_from date not null,
  created_at timestamptz default now()
);

-- ============ 模板里的每一行（哪个版本、哪个时段、写了什么） ============
create table if not exists schedule_template_item (
  id uuid default gen_random_uuid() primary key,
  version_id uuid references schedule_template_version(id) on delete cascade,
  slot text not null,
  title text not null,
  sort int default 0
);

-- ============ 事项（单个/重复/当场补记，全部是这一张表） ============
create table if not exists schedule_item (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  slot text,
  title text not null,
  starred boolean default false,
  remind_at timestamptz,
  recurring_rule text,
  sort int default 0,
  created_at timestamptz default now()
);

-- ============ 勾选记录——唯一会无限增长的表 ============
-- source='template' 时 ref_id 对应 schedule_template_item.id，
-- source='item' 时 ref_id 对应 schedule_item.id（两边都不建真正的外键，
-- 因为是同一列指向两张不同的表，数据库层面没法两边都约束）。
-- title_snapshot 打勾那一刻把标题存死——以后模板改了/item改了/删了，
-- 这条历史记录的文字依然完整，不会跟着变。
create table if not exists schedule_check (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  source text not null check (source in ('template', 'item')),
  ref_id uuid not null,
  title_snapshot text not null,
  done_at timestamptz default now(),
  unique (date, source, ref_id)
);

-- ============ 日记 ============
create table if not exists schedule_diary (
  date date primary key,
  content text default ''
);

create index if not exists idx_schedule_template_item_version on schedule_template_item(version_id);
create index if not exists idx_schedule_item_date on schedule_item(date);
create index if not exists idx_schedule_check_date on schedule_check(date);

alter table schedule_template_version disable row level security;
alter table schedule_template_item disable row level security;
alter table schedule_item disable row level security;
alter table schedule_check disable row level security;
alter table schedule_diary disable row level security;
