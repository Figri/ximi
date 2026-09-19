-- 西米OS 预设数据
-- 在 schema.sql 建表完成后运行。
--
-- 这个版本不用 DO $$ 块/变量，全部是独立的 insert 语句，靠卡片名字做子查询关联。
-- 好处：可以随便切成几段分别粘贴执行（比如 Supabase SQL Editor 一次只能粘 100 行的情况），
-- 只要保证"卡片"先于它自己的"动作"插入、所有卡片和动作都插完了再跑最后的联动 update 就行。
-- 重复运行会插入重复数据，重跑之前先在 Table Editor 里清空 cards/actions/cats/tags。

-- ============ 猫 ============
insert into cats (name, gender, notes) values
  ('艾琪', '♀', null),
  ('小黄', '♂', null),
  ('皮蛋', '♀', '已绝育'),
  ('粥粥', '♀', '9/14绝育，恢复期'),
  ('兔狲（兔轩）', '♂', '巨结肠，需处方粮');

-- ============ 标签 ============
insert into tags (name, emoji, sort_order) values
  ('🐱猫', '🐱', 1),
  ('🏠家务', '🏠', 2),
  ('💅护理', '💅', 3),
  ('💪运动', '💪', 4),
  ('🧹区域', '🧹', 5),
  ('📋计划', '📋', 6),
  ('⭐收藏', '⭐', 7),
  ('🧠自我', '🧠', 8)
on conflict (name) do nothing;

-- ============ 猫相关卡片 ============

-- 铲屎（联动猫砂盆ABC，联动关系在文件最后统一 update）
insert into cards (name, type, tags) values ('铲屎', 'habit', array['🐱猫','🏠家务']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '铲了', true, 'interval', 1, 2 from cards where name = '铲屎';

-- 猫砂盆 A/B/C
insert into cards (name, type, tags) values ('猫砂盆A', 'habit', array['🐱猫']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '铲了', true, 'interval', 1, 2 from cards where name = '猫砂盆A';
insert into actions (card_id, name, is_primary, frequency_type, interval_days)
  select id, '加砂', false, 'interval', 30 from cards where name = '猫砂盆A';
insert into actions (card_id, name, is_primary, frequency_type)
  select id, '换新砂', false, 'manual' from cards where name = '猫砂盆A';

insert into cards (name, type, tags) values ('猫砂盆B', 'habit', array['🐱猫']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '铲了', true, 'interval', 1, 2 from cards where name = '猫砂盆B';
insert into actions (card_id, name, is_primary, frequency_type, interval_days)
  select id, '加砂', false, 'interval', 30 from cards where name = '猫砂盆B';
insert into actions (card_id, name, is_primary, frequency_type)
  select id, '换新砂', false, 'manual' from cards where name = '猫砂盆B';

insert into cards (name, type, tags) values ('猫砂盆C', 'habit', array['🐱猫']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '铲了', true, 'interval', 1, 2 from cards where name = '猫砂盆C';
insert into actions (card_id, name, is_primary, frequency_type, interval_days)
  select id, '加砂', false, 'interval', 30 from cards where name = '猫砂盆C';
insert into actions (card_id, name, is_primary, frequency_type)
  select id, '换新砂', false, 'manual' from cards where name = '猫砂盆C';

-- 大粮碗
insert into cards (name, type, tags) values ('大粮碗', 'habit', array['🐱猫','🏠家务']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '加了', true, 'interval', 1, 1.5 from cards where name = '大粮碗';
insert into actions (card_id, name, is_primary, frequency_type, fixed_days)
  select id, '洗了', false, 'fixed_day', array[1,5] from cards where name = '大粮碗';

-- 兔狲处方碗
insert into cards (name, type, tags, notes) values ('兔狲处方碗', 'habit', array['🐱猫','🏠家务'], '处方粮，仅兔狲专用');
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '加了', true, 'interval', 1, 1.5 from cards where name = '兔狲处方碗';
insert into actions (card_id, name, is_primary, frequency_type, fixed_days)
  select id, '洗了', false, 'fixed_day', array[1,5] from cards where name = '兔狲处方碗';

-- 水碗
insert into cards (name, type, tags) values ('水碗', 'habit', array['🐱猫','🏠家务']);
insert into actions (card_id, name, is_primary, frequency_type, fixed_days)
  select id, '换了', true, 'fixed_day', array[1,3,5] from cards where name = '水碗';

-- 梳毛
insert into cards (name, type, tags) values ('梳毛', 'habit', array['🐱猫','💅护理']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay, requires_selection)
  select id, '梳了', true, 'interval', 7, 14, true from cards where name = '梳毛';

-- 猫剪指甲
insert into cards (name, type, tags) values ('猫剪指甲', 'habit', array['🐱猫','💅护理']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay, requires_selection)
  select id, '剪了', true, 'interval', 7, 14, true from cards where name = '猫剪指甲';

-- 刷牙
insert into cards (name, type, tags) values ('刷牙', 'habit', array['🐱猫','💅护理']);
insert into actions (card_id, name, is_primary, frequency_type, requires_selection)
  select id, '刷了', true, 'interval', true from cards where name = '刷牙';

-- 粥粥擦碘伏
insert into cards (name, type, tags, notes) values ('粥粥擦碘伏', 'habit', array['🐱猫'], '绝育恢复期护理，有截止日');
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '擦了', true, 'interval', 1, 1.5 from cards where name = '粥粥擦碘伏';

