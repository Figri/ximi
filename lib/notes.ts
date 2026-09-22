import { supabase } from './supabase';
import type { Folder, Note } from '../types';

export async function fetchFolders(): Promise<Folder[]> {
  const { data, error } = await supabase.from('folders').select('*').order('sort_order').order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function createFolder(name: string, parentId: string | null = null): Promise<Folder> {
  const { data, error } = await supabase
    .from('folders')
    .insert({ name, parent_id: parentId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('folders').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from('folders').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchNotesInFolder(folderId: string | null): Promise<Note[]> {
  let query = supabase.from('notes').select('*').order('sort_order').order('updated_at', { ascending: false });
  query = folderId ? query.eq('folder_id', folderId) : query.is('folder_id', null);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchNote(id: string): Promise<Note | null> {
  const { data, error } = await supabase.from('notes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createNote(folderId: string | null, title = '无标题'): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .insert({ folder_id: folderId, title, content: '' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'content'>>): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) throw error;
}

export async function searchNotes(query: string): Promise<Note[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}
