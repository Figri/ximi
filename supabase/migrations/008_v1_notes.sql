-- 西米OS v1.0：笔记tab（文件夹 + 笔记）
-- 全新功能，新建两张表，不影响任何现有表。

create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references folders(id) on delete cascade,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references folders(id) on delete cascade,
  title text not null default '无标题',
  content text default '',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_notes_folder_id on notes(folder_id);
create index if not exists idx_folders_parent_id on folders(parent_id);

-- 单用户app，跟其它所有表一样直接关掉RLS
alter table folders disable row level security;
alter table notes disable row level security;
