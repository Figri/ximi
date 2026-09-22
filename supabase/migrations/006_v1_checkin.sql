-- 西米OS v1.0：打卡tab改造（习惯圆形图标 + 事项待办）
-- 增量修改，不 DROP 现有表。复用 cards.emoji 当图标、cards.time_of_day 当时间段分组。

alter table cards add column if not exists display_type text default 'card';
-- 'habit' = 习惯圆形图标, 'todo' = 事项待办, 'card' = 旧卡片(兼容，暂不在打卡tab展示)

alter table cards add column if not exists priority text default 'normal';
-- 'important' / 'normal'，只有事项(todo)用

alter table cards add column if not exists due_date timestamptz;
-- 只有事项(todo)用，截止时间

-- 把现有习惯类卡片(type='habit')标记为 display_type='habit'，这样它们自动出现在新的打卡tab上半区
update cards set display_type = 'habit' where type = 'habit' and display_type = 'card';
