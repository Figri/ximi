-- 西米OS 预设数据
-- 在 schema.sql 建表完成后运行。可重复运行前先清空相关表（见文末注释）。

do $$
declare
  -- 猫
  cat_aiqi uuid;
  cat_xiaohuang uuid;
  cat_pidan uuid;
  cat_zhouzhou uuid;
  cat_tusun uuid;

  -- 卡片
  card_chanshi uuid;
  card_pena uuid;
  card_penb uuid;
  card_penc uuid;
  card_dalangwan uuid;
  card_tusun_wan uuid;
  card_shuiwan uuid;
  card_shumao uuid;
  card_jianzhijia_cat uuid;
  card_shuaya uuid;
  card_zhouzhou_diyifu uuid;

  card_xitou uuid;
  card_jianzhijia uuid;
  card_mianmo uuid;
  card_chengtizhong uuid;

  card_xiyiji uuid;
  card_hongganji uuid;

  card_area_ketingfanzhuo uuid;
  card_area_ketingdianshi uuid;
  card_area_ketingshafa uuid;
  card_area_chufangbingxiang uuid;
  card_area_chufanghuojia uuid;
  card_area_chufangguizi uuid;
  card_area_wodefangjian_chuangshang uuid;
  card_area_wodefangjian_chuangxia uuid;
  card_area_wodefangjian_yigui uuid;
  card_area_chuzangshi_huojia uuid;
  card_area_chuzangshi_yifuxiangzi uuid;
  card_area_zhuwo_xiangzi uuid;

  -- 动作
  act_chanshi_chanle uuid;
  act_pena_chanle uuid;
  act_penb_chanle uuid;
  act_penc_chanle uuid;
begin
  -- ============ 猫 ============
  insert into cats (name, gender, notes) values ('艾琪', '♀', null) returning id into cat_aiqi;
  insert into cats (name, gender, notes) values ('小黄', '♂', null) returning id into cat_xiaohuang;
  insert into cats (name, gender, notes) values ('皮蛋', '♀', '已绝育') returning id into cat_pidan;
  insert into cats (name, gender, notes) values ('粥粥', '♀', '9/14绝育，恢复期') returning id into cat_zhouzhou;
  insert into cats (name, gender, notes) values ('兔狲（兔轩）', '♂', '巨结肠，需处方粮') returning id into cat_tusun;

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

  -- 铲屎（联动猫砂盆ABC，先占位插入，动作联动最后统一 update）
  insert into cards (name, type, tags) values ('铲屎', 'habit', array['🐱猫','🏠家务']) returning id into card_chanshi;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
    values (card_chanshi, '铲了', true, 'interval', 1, 2) returning id into act_chanshi_chanle;

  -- 猫砂盆 A/B/C
  insert into cards (name, type, tags) values ('猫砂盆A', 'habit', array['🐱猫']) returning id into card_pena;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
    values (card_pena, '铲了', true, 'interval', 1, 2) returning id into act_pena_chanle;
  insert into actions (card_id, name, is_primary, frequency_type, interval_days)
    values (card_pena, '加砂', false, 'interval', 30);
  insert into actions (card_id, name, is_primary, frequency_type)
    values (card_pena, '换新砂', false, 'manual');

  insert into cards (name, type, tags) values ('猫砂盆B', 'habit', array['🐱猫']) returning id into card_penb;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
    values (card_penb, '铲了', true, 'interval', 1, 2) returning id into act_penb_chanle;
  insert into actions (card_id, name, is_primary, frequency_type, interval_days)
    values (card_penb, '加砂', false, 'interval', 30);
  insert into actions (card_id, name, is_primary, frequency_type)
    values (card_penb, '换新砂', false, 'manual');

  insert into cards (name, type, tags) values ('猫砂盆C', 'habit', array['🐱猫']) returning id into card_penc;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
    values (card_penc, '铲了', true, 'interval', 1, 2) returning id into act_penc_chanle;
  insert into actions (card_id, name, is_primary, frequency_type, interval_days)
    values (card_penc, '加砂', false, 'interval', 30);
  insert into actions (card_id, name, is_primary, frequency_type)
    values (card_penc, '换新砂', false, 'manual');

  -- 铲屎动作联动猫砂盆 ABC 的铲了动作
  update actions set linked_action_ids = array[act_pena_chanle, act_penb_chanle, act_penc_chanle]
    where id = act_chanshi_chanle;

  -- 大粮碗
  insert into cards (name, type, tags) values ('大粮碗', 'habit', array['🐱猫','🏠家务']) returning id into card_dalangwan;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
    values (card_dalangwan, '加了', true, 'interval', 1, 1.5);
  insert into actions (card_id, name, is_primary, frequency_type, fixed_days)
    values (card_dalangwan, '洗了', false, 'fixed_day', array[1,5]);

  -- 兔狲处方碗
  insert into cards (name, type, tags, notes) values ('兔狲处方碗', 'habit', array['🐱猫','🏠家务'], '处方粮，仅兔狲专用') returning id into card_tusun_wan;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
    values (card_tusun_wan, '加了', true, 'interval', 1, 1.5);
  insert into actions (card_id, name, is_primary, frequency_type, fixed_days)
    values (card_tusun_wan, '洗了', false, 'fixed_day', array[1,5]);

  -- 水碗
  insert into cards (name, type, tags) values ('水碗', 'habit', array['🐱猫','🏠家务']) returning id into card_shuiwan;
  insert into actions (card_id, name, is_primary, frequency_type, fixed_days)
    values (card_shuiwan, '换了', true, 'fixed_day', array[1,3,5]);

  -- 梳毛
  insert into cards (name, type, tags) values ('梳毛', 'habit', array['🐱猫','💅护理']) returning id into card_shumao;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay, requires_selection)
    values (card_shumao, '梳了', true, 'interval', 7, 14, true);

  -- 猫剪指甲
  insert into cards (name, type, tags) values ('猫剪指甲', 'habit', array['🐱猫','💅护理']) returning id into card_jianzhijia_cat;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay, requires_selection)
    values (card_jianzhijia_cat, '剪了', true, 'interval', 7, 14, true);

  -- 刷牙
  insert into cards (name, type, tags) values ('刷牙', 'habit', array['🐱猫','💅护理']) returning id into card_shuaya;
  insert into actions (card_id, name, is_primary, frequency_type, requires_selection)
    values (card_shuaya, '刷了', true, 'interval', true);

  -- 粥粥擦碘伏
  insert into cards (name, type, tags, notes) values ('粥粥擦碘伏', 'habit', array['🐱猫'], '绝育恢复期护理，有截止日') returning id into card_zhouzhou_diyifu;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
    values (card_zhouzhou_diyifu, '擦了', true, 'interval', 1, 1.5);

  -- ============ 个人护理 ============
  insert into cards (name, type, tags) values ('洗头', 'habit', array['💅护理']) returning id into card_xitou;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
    values (card_xitou, '洗了', true, 'interval', 3, 5);

  insert into cards (name, type, tags) values ('剪指甲', 'habit', array['💅护理']) returning id into card_jianzhijia;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
    values (card_jianzhijia, '剪了', true, 'interval', 7, 14);

  insert into cards (name, type, tags) values ('敷面膜', 'habit', array['💅护理']) returning id into card_mianmo;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
    values (card_mianmo, '敷了', true, 'interval', 5, 7);

  insert into cards (name, type, tags) values ('称体重', 'habit', array['💅护理']) returning id into card_chengtizhong;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay)
    values (card_chengtizhong, '称了', true, 'interval', 7, 14);

  -- ============ 家务：计时器 ============
  insert into cards (name, type, tags) values ('洗衣机', 'timer', array['🏠家务']) returning id into card_xiyiji;
  insert into actions (card_id, name, is_primary, frequency_type, interval_days)
    values (card_xiyiji, '开始', true, 'manual', 60.0 / 60 / 24);

  insert into cards (name, type, tags) values ('烘干机', 'timer', array['🏠家务']) returning id into card_hongganji;
  insert into actions (card_id, name, is_primary, frequency_type, interval_days)
    values (card_hongganji, '开始', true, 'manual', 200.0 / 60 / 24);

  -- ============ 家务：区域清洁（约30天/最迟45天） ============
  insert into cards (name, type, tags) values ('客厅·饭桌旁', 'habit', array['🧹区域']) returning id into card_area_ketingfanzhuo;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay) values (card_area_ketingfanzhuo, '清洁了', true, 'interval', 30, 45);

  insert into cards (name, type, tags) values ('客厅·电视旁', 'habit', array['🧹区域']) returning id into card_area_ketingdianshi;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay) values (card_area_ketingdianshi, '清洁了', true, 'interval', 30, 45);

  insert into cards (name, type, tags) values ('客厅·沙发', 'habit', array['🧹区域']) returning id into card_area_ketingshafa;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay) values (card_area_ketingshafa, '清洁了', true, 'interval', 30, 45);

  insert into cards (name, type, tags) values ('厨房·冰箱', 'habit', array['🧹区域']) returning id into card_area_chufangbingxiang;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay) values (card_area_chufangbingxiang, '清洁了', true, 'interval', 30, 45);

  insert into cards (name, type, tags) values ('厨房·货架', 'habit', array['🧹区域']) returning id into card_area_chufanghuojia;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay) values (card_area_chufanghuojia, '清洁了', true, 'interval', 30, 45);

  insert into cards (name, type, tags) values ('厨房·柜子', 'habit', array['🧹区域']) returning id into card_area_chufangguizi;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay) values (card_area_chufangguizi, '清洁了', true, 'interval', 30, 45);

  insert into cards (name, type, tags) values ('我的房间·床上', 'habit', array['🧹区域']) returning id into card_area_wodefangjian_chuangshang;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay) values (card_area_wodefangjian_chuangshang, '清洁了', true, 'interval', 30, 45);

  insert into cards (name, type, tags) values ('我的房间·床下', 'habit', array['🧹区域']) returning id into card_area_wodefangjian_chuangxia;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay) values (card_area_wodefangjian_chuangxia, '清洁了', true, 'interval', 30, 45);

  insert into cards (name, type, tags) values ('我的房间·衣柜', 'habit', array['🧹区域']) returning id into card_area_wodefangjian_yigui;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay) values (card_area_wodefangjian_yigui, '清洁了', true, 'interval', 30, 45);

  insert into cards (name, type, tags) values ('储藏室·货架', 'habit', array['🧹区域']) returning id into card_area_chuzangshi_huojia;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay) values (card_area_chuzangshi_huojia, '清洁了', true, 'interval', 30, 45);

  insert into cards (name, type, tags) values ('储藏室·衣服箱子', 'habit', array['🧹区域']) returning id into card_area_chuzangshi_yifuxiangzi;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay) values (card_area_chuzangshi_yifuxiangzi, '清洁了', true, 'interval', 30, 45);

  insert into cards (name, type, tags) values ('主卧·箱子', 'habit', array['🧹区域']) returning id into card_area_zhuwo_xiangzi;
  insert into actions (card_id, name, is_primary, frequency_type, suggested_interval, max_delay) values (card_area_zhuwo_xiangzi, '清洁了', true, 'interval', 30, 45);

end $$;
