-- ============ 个人护理 ============
insert into cards (name, type, tags) values ('洗头', 'habit', array['💅护理']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '洗了', true, 'interval', 3, 5 from cards where name = '洗头';

insert into cards (name, type, tags) values ('剪指甲', 'habit', array['💅护理']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '剪了', true, 'interval', 7, 14 from cards where name = '剪指甲';

insert into cards (name, type, tags) values ('敷面膜', 'habit', array['💅护理']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '敷了', true, 'interval', 5, 7 from cards where name = '敷面膜';

insert into cards (name, type, tags) values ('称体重', 'habit', array['💅护理']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '称了', true, 'interval', 7, 14 from cards where name = '称体重';

-- ============ 家务：计时器 ============
insert into cards (name, type, tags) values ('洗衣机', 'timer', array['🏠家务']);
insert into actions (card_id, name, is_primary, frequency_type, interval_days)
  select id, '开始', true, 'manual', 60.0 / 60 / 24 from cards where name = '洗衣机';

insert into cards (name, type, tags) values ('烘干机', 'timer', array['🏠家务']);
insert into actions (card_id, name, is_primary, frequency_type, interval_days)
  select id, '开始', true, 'manual', 200.0 / 60 / 24 from cards where name = '烘干机';

-- ============ 家务：区域清洁（约30天/最迟45天） ============
insert into cards (name, type, tags) values ('客厅·饭桌旁', 'habit', array['🧹区域']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '清洁了', true, 'interval', 30, 45 from cards where name = '客厅·饭桌旁';

insert into cards (name, type, tags) values ('客厅·电视旁', 'habit', array['🧹区域']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '清洁了', true, 'interval', 30, 45 from cards where name = '客厅·电视旁';

insert into cards (name, type, tags) values ('客厅·沙发', 'habit', array['🧹区域']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '清洁了', true, 'interval', 30, 45 from cards where name = '客厅·沙发';

insert into cards (name, type, tags) values ('厨房·冰箱', 'habit', array['🧹区域']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '清洁了', true, 'interval', 30, 45 from cards where name = '厨房·冰箱';

insert into cards (name, type, tags) values ('厨房·货架', 'habit', array['🧹区域']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '清洁了', true, 'interval', 30, 45 from cards where name = '厨房·货架';

insert into cards (name, type, tags) values ('厨房·柜子', 'habit', array['🧹区域']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '清洁了', true, 'interval', 30, 45 from cards where name = '厨房·柜子';

insert into cards (name, type, tags) values ('我的房间·床上', 'habit', array['🧹区域']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '清洁了', true, 'interval', 30, 45 from cards where name = '我的房间·床上';

insert into cards (name, type, tags) values ('我的房间·床下', 'habit', array['🧹区域']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '清洁了', true, 'interval', 30, 45 from cards where name = '我的房间·床下';

insert into cards (name, type, tags) values ('我的房间·衣柜', 'habit', array['🧹区域']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '清洁了', true, 'interval', 30, 45 from cards where name = '我的房间·衣柜';

insert into cards (name, type, tags) values ('储藏室·货架', 'habit', array['🧹区域']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '清洁了', true, 'interval', 30, 45 from cards where name = '储藏室·货架';

insert into cards (name, type, tags) values ('储藏室·衣服箱子', 'habit', array['🧹区域']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '清洁了', true, 'interval', 30, 45 from cards where name = '储藏室·衣服箱子';

insert into cards (name, type, tags) values ('主卧·箱子', 'habit', array['🧹区域']);
insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
  select id, '清洁了', true, 'interval', 30, 45 from cards where name = '主卧·箱子';

-- ============ 联动：铲屎的"铲了"同时触发猫砂盆ABC的"铲了" ============
-- 要在上面所有卡片、动作都插完之后再跑这一段。
update actions
set linked_action_ids = (
  select array_agg(a.id)
  from actions a
  join cards c on c.id = a.card_id
  where c.name in ('猫砂盆A', '猫砂盆B', '猫砂盆C') and a.name = '铲了'
)
where card_id = (select id from cards where name = '铲屎')
  and name = '铲了';
