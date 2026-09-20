-- v0.2: 卡片加时间段字段，时间轴记录加 hp/mp 变化字段
alter table cards add column if not exists time_of_day text not null default 'anytime';
alter table timeline_entries add column if not exists hp_change int;
alter table timeline_entries add column if not exists mp_change int;

-- 猫砂盆A/B/C 自己的"铲了"不再是主动作（铲屎已经联动，不用重复点），
-- 改成次要动作，这样卡片列表默认不显示这三张，只有"加砂"/"换新砂"变黄红时才冒出来
update actions a
set is_primary = false
from cards c
where c.id = a.card_id
  and c.name in ('猫砂盆A', '猫砂盆B', '猫砂盆C')
  and a.name = '铲了';
