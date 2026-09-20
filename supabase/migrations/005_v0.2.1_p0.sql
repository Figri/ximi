-- v0.2.1 P0-4：生活tab改成按标签分组的方块卡片，每张卡片需要一个图标(emoji)

alter table cards add column if not exists emoji text;

update cards set emoji = case name
  when '铲屎' then '🪣'
  when '猫砂盆A' then 'A'
  when '猫砂盆B' then 'B'
  when '猫砂盆C' then 'C'
  when '大粮碗' then '🍚'
  when '兔狲处方碗' then '🍚'
  when '水碗' then '💧'
  when '梳毛' then '🪮'
  when '猫剪指甲' then '✂️'
  when '刷牙' then '🪥'
  when '粥粥擦碘伏' then '💊'
  when '洗头' then '🚿'
  when '剪指甲' then '✂️'
  when '敷面膜' then '😷'
  when '称体重' then '⚖️'
  when '洗衣机' then '🧺'
  when '烘干机' then '🌬️'
  else '🧹'
end
where emoji is null and tags && array['🧹区域']::text[];

update cards set emoji = case name
  when '铲屎' then '🪣'
  when '猫砂盆A' then 'A'
  when '猫砂盆B' then 'B'
  when '猫砂盆C' then 'C'
  when '大粮碗' then '🍚'
  when '兔狲处方碗' then '🍚'
  when '水碗' then '💧'
  when '梳毛' then '🪮'
  when '猫剪指甲' then '✂️'
  when '刷牙' then '🪥'
  when '粥粥擦碘伏' then '💊'
  when '洗头' then '🚿'
  when '剪指甲' then '✂️'
  when '敷面膜' then '😷'
  when '称体重' then '⚖️'
  when '洗衣机' then '🧺'
  when '烘干机' then '🌬️'
end
where emoji is null;

update cards set emoji = '📌' where emoji is null;

-- 猫砂盆A/B/C：加砂改成主动作（点了直接完成），铲了已经在上一版降级成次要，
-- 换新砂也是次要（长按展开能看到）
update actions a
set is_primary = true
from cards c
where c.id = a.card_id
  and c.name in ('猫砂盆A', '猫砂盆B', '猫砂盆C')
  and a.name = '加砂';
