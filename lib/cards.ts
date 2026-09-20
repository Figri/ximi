import { supabase } from './supabase';
import type { Action, Card, Cat, Completion } from '../types';

export async function fetchCats(): Promise<Cat[]> {
  const { data, error } = await supabase.from('cats').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchCards(): Promise<Card[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('archived', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchActions(): Promise<Action[]> {
  const { data, error } = await supabase.from('actions').select('*');
  if (error) throw error;
  return data ?? [];
}

/** 每个 action 最近一次未撤销的完成时间 */
export async function fetchLastCompletions(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('completions')
    .select('action_id, completed_at')
    .eq('undone', false)
    .order('completed_at', { ascending: false });
  if (error) throw error;

  const result: Record<string, string> = {};
  for (const row of data ?? []) {
    if (!result[row.action_id]) result[row.action_id] = row.completed_at;
  }
  return result;
}

export async function completeAction(
  action: Action,
  card: Card,
  options?: { selectedCats?: string[]; notes?: string }
): Promise<Completion[]> {
  const targets = [action.id, ...(action.linked_action_ids ?? [])];

  const rows = targets.map((actionId) => ({
    action_id: actionId,
    card_id: actionId === action.id ? card.id : null,
    notes: options?.notes ?? null,
    selected_cats: options?.selectedCats ?? null,
  }));

  // card_id 对于联动的动作我们不知道，所以分别查一次更省心：直接让联动动作自己带 card_id
  const { data: linkedActions } = action.linked_action_ids?.length
    ? await supabase.from('actions').select('id, card_id').in('id', action.linked_action_ids)
    : { data: [] };

  const cardIdByAction: Record<string, string> = { [action.id]: card.id };
  for (const a of linkedActions ?? []) cardIdByAction[a.id] = a.card_id;

  const finalRows = rows.map((r) => ({ ...r, card_id: cardIdByAction[r.action_id] ?? r.card_id }));

  const { data, error } = await supabase.from('completions').insert(finalRows).select();
  if (error) throw error;
  return data ?? [];
}

export async function undoCompletion(completionId: string): Promise<void> {
  const { error } = await supabase.from('completions').update({ undone: true }).eq('id', completionId);
  if (error) throw error;
}

export async function createCard(
  card: Pick<Card, 'name' | 'type' | 'tags' | 'notes'> & Partial<Pick<Card, 'time_of_day' | 'emoji'>>,
  actions: Pick<
    Action,
    | 'name'
    | 'is_primary'
    | 'frequency_type'
    | 'interval_days'
    | 'fixed_days'
    | 'suggested_interval'
    | 'max_delay'
    | 'requires_selection'
  >[]
): Promise<Card> {
  const { data: newCard, error: cardError } = await supabase.from('cards').insert(card).select().single();
  if (cardError) throw cardError;

  if (actions.length) {
    const { error: actionsError } = await supabase
      .from('actions')
      .insert(actions.map((a) => ({ ...a, card_id: newCard.id })));
    if (actionsError) throw actionsError;
  }

  return newCard;
}

export async function updateCard(id: string, patch: Partial<Card>): Promise<void> {
  const { error } = await supabase
    .from('cards')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function archiveCard(id: string): Promise<void> {
  await updateCard(id, { archived: true });
}

export async function fetchCompletionHistory(cardId: string, limit = 30): Promise<Completion[]> {
  const { data, error } = await supabase
    .from('completions')
    .select('*')
    .eq('card_id', cardId)
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchCard(id: string): Promise<Card | null> {
  const { data, error } = await supabase.from('cards').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchActionsForCard(cardId: string): Promise<Action[]> {
  const { data, error } = await supabase
    .from('actions')
    .select('*')
    .eq('card_id', cardId)
    .order('is_primary', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateAction(id: string, patch: Partial<Action>): Promise<void> {
  const { error } = await supabase.from('actions').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteAction(id: string): Promise<void> {
  const { error } = await supabase.from('actions').delete().eq('id', id);
  if (error) throw error;
}

export async function addAction(
  cardId: string,
  action: Pick<Action, 'name' | 'is_primary' | 'frequency_type' | 'suggested_interval' | 'max_delay'>
): Promise<Action> {
  const { data, error } = await supabase
    .from('actions')
    .insert({ ...action, card_id: cardId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchAllTags(): Promise<{ name: string; emoji: string | null }[]> {
  const { data, error } = await supabase.from('tags').select('name, emoji').order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function createTag(name: string): Promise<void> {
  const { error } = await supabase.from('tags').insert({ name }).select();
  if (error && error.code !== '23505') throw error; // 忽略重复标签
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from('cards').delete().eq('id', id);
  if (error) throw error;
}
