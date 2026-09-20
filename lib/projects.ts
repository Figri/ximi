import { supabase } from './supabase';
import type { Project, ProjectLog, ProjectStatus } from '../types';

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createProject(
  name: string,
  description: string | null,
  linkedCardIds: string[],
  linkedWorryIds: string[]
): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name,
      status: 'idea',
      description,
      linked_card_ids: linkedCardIds.length ? linkedCardIds : null,
      linked_worry_ids: linkedWorryIds.length ? linkedWorryIds : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProjectStatus(id: string, status: ProjectStatus): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function fetchProjectLogs(projectId: string): Promise<ProjectLog[]> {
  const { data, error } = await supabase
    .from('project_logs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addProjectLog(projectId: string, content: string): Promise<ProjectLog> {
  const { data, error } = await supabase
    .from('project_logs')
    .insert({ project_id: projectId, content, source: 'manual' })
    .select()
    .single();
  if (error) throw error;
  await supabase.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', projectId);
  return data;
}
