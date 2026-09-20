// 西米OS 核心类型定义，与 supabase/schema.sql 一一对应

export type CardType = 'habit' | 'timer' | 'info' | 'collection';
export type FrequencyType = 'interval' | 'fixed_day' | 'manual';
export type DecayStatus = 'green' | 'yellow' | 'red';
export type TimerStatus = 'idle' | 'running' | 'done';
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'anytime';

export interface Card {
  id: string;
  name: string;
  type: CardType;
  tags: string[];
  notes: string | null;
  time_of_day: TimeOfDay;
  emoji: string | null;
  created_at: string;
  updated_at: string;
  archived: boolean;
}

export interface Action {
  id: string;
  card_id: string;
  name: string;
  is_primary: boolean;

  frequency_type: FrequencyType;
  interval_days: number | null;
  fixed_days: number[] | null;
  fixed_dates: number[] | null;
  suggested_interval: number | null;
  max_delay: number | null;

  linked_action_ids: string[] | null;

  requires_selection: boolean;

  active_hours_start: string | null;
  active_hours_end: string | null;

  created_at: string;
}

export interface Completion {
  id: string;
  action_id: string;
  card_id: string;
  completed_at: string;
  notes: string | null;
  selected_cats: string[] | null;
  undone: boolean;
}

export interface CardLink {
  id: string;
  from_card_id: string;
  to_card_id: string;
  link_type: 'related' | 'parent' | 'reference';
}

export interface Collection {
  id: string;
  card_id: string;
  content: string | null;
  url: string | null;
  image_url: string | null;
  source: 'chat' | 'manual';
}

export interface Cat {
  id: string;
  name: string;
  gender: '♀' | '♂' | null;
  avatar_url: string | null;
  notes: string | null;
  created_at: string;
}

export type CatEventType = '绝育' | '疫苗' | '看医生' | '体重' | '其他';

export interface CatEvent {
  id: string;
  cat_id: string;
  event_type: CatEventType;
  description: string | null;
  value: number | null;
  event_date: string;
  created_at: string;
}

export type TimelineCategory =
  | 'sleep'
  | 'eat'
  | 'work'
  | 'play'
  | 'cat'
  | 'exercise'
  | 'body'
  | 'emotion'
  | 'plan'
  | 'dream'
  | 'intimate'
  | 'diary'
  | 'other';
export type TimelineSource = 'manual' | 'chat' | 'screen_time';

export interface TimelineEntry {
  id: string;
  start_time: string;
  end_time: string | null;
  category: TimelineCategory | null;
  description: string | null;
  app_name: string | null;
  image_url: string | null;
  source: TimelineSource;
  hp_change: number | null;
  mp_change: number | null;
  created_at: string;
}

export type WorrySeverity = 'light' | 'medium' | 'heavy';
export type WorryStatus = 'active' | 'resolved' | 'let_go';

export interface Worry {
  id: string;
  content: string;
  tags: string[];
  severity: WorrySeverity;
  status: WorryStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface DailySummary {
  id: string;
  date: string;
  body_summary: string | null;
  sleep_summary: string | null;
  food_summary: string | null;
  emotion_summary: string | null;
  worry_summary: string | null;
  plan_summary: string | null;
  dream_summary: string | null;
  intimate_summary: string | null;
  hp: number | null;
  mp: number | null;
  created_at: string;
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  model: string | null;
  image_url?: string | null;
  created_at: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface Tag {
  id: string;
  name: string;
  emoji: string | null;
  sort_order: number;
}

export type ProjectStatus = 'idea' | 'active' | 'paused' | 'done';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  description: string | null;
  linked_worry_ids: string[] | null;
  linked_card_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectLog {
  id: string;
  project_id: string;
  content: string | null;
  source: 'manual' | 'chat';
  created_at: string;
}

// ---- 派生/UI类型 ----

export interface DecayResult {
  percentage: number;
  status: DecayStatus;
  timeLeft: string;
}

export interface CardWithActions extends Card {
  actions: Action[];
}

// AI 结构化指令：AI 回复里可以携带的操作，格式 {"actions":[{...}]}
export interface AIAction {
  type: 'complete' | 'timeline' | 'create_card';
  // complete：完成某张卡片的动作
  card_name?: string;
  action_name?: string;
  // timeline：写一条时间轴记录
  description?: string;
  category?: TimelineCategory;
  duration_min?: number;
  hp_change?: number;
  mp_change?: number;
  // create_card：新建一张习惯卡片
  card_tags?: string[];
  frequency_type?: FrequencyType;
  interval_days?: number;
  fixed_days?: number[];
}

export interface AIReply {
  text: string;
  actions?: AIAction[];
}
