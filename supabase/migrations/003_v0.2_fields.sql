-- v0.2: 卡片加时间段字段，时间轴记录加 hp/mp 变化字段
alter table cards add column if not exists time_of_day text not null default 'anytime';
alter table timeline_entries add column if not exists hp_change int;
alter table timeline_entries add column if not exists mp_change int;
