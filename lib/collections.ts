import { supabase } from './supabase';
import type { Collection } from '../types';

export interface CollectionWithCard extends Collection {
  card_name: string;
  created_at: string;
}

/** 收藏是"卡片+更丰富内容"的组合（type='collection' 的卡片 + collections 表那一行） */
export async function fetchCollections(): Promise<CollectionWithCard[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*, card:cards(name, created_at)');
  if (error) throw error;

  const rows = (data ?? []).map((row: any) => ({
    id: row.id,
    card_id: row.card_id,
    content: row.content,
    url: row.url,
    image_url: row.image_url,
    source: row.source,
    card_name: row.card?.name ?? '未命名收藏',
    created_at: row.card?.created_at ?? new Date().toISOString(),
  }));

  return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function addCollection(name: string, content: string, url: string | null): Promise<void> {
  const { data: card, error: cardError } = await supabase
    .from('cards')
    .insert({ name, type: 'collection', tags: ['⭐收藏'] })
    .select()
    .single();
  if (cardError) throw cardError;

  const { error } = await supabase
    .from('collections')
    .insert({ card_id: card.id, content: content || null, url: url || null, source: 'manual' });
  if (error) throw error;
}

export async function deleteCollection(collectionId: string, cardId: string): Promise<void> {
  const { error } = await supabase.from('collections').delete().eq('id', collectionId);
  if (error) throw error;
  await supabase.from('cards').delete().eq('id', cardId);
}
