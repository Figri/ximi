
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
