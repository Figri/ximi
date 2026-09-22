-- 西米OS v1.0：时间tab（日视图时间轴 + 月视图日历）
-- 复用现有 timeline_entries / daily_summaries 表，不新建重名表，增量加列。

alter table timeline_entries add column if not exists icon text default '📝';

alter table daily_summaries add column if not exists summary text;
-- 月历格子里显示的一行摘要，跟原本六个细分 summary 字段（body_summary等）是两回事，
-- 那几个是AI"做梦"生成的详细总结，这个是月历用的极简一行字，可以手动写也可以留空。
