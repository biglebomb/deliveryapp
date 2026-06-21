import { requireSupabase } from '../lib/supabase';
import type { Area, AreaPoint } from '../types/models';

export async function fetchAreas(): Promise<Area[]> {
  const { data, error } = await requireSupabase().from('areas').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Area[];
}

export async function saveArea(payload: {
  id?: string;
  name: string;
  color: string | null;
  polygon: AreaPoint[];
}): Promise<Area> {
  const { id, ...values } = payload;
  const query = id
    ? requireSupabase().from('areas').update(values).eq('id', id).select().single()
    : requireSupabase().from('areas').insert(values).select().single();

  const { data, error } = await query;
  if (error) throw error;
  return data as Area;
}

export async function deleteArea(id: string): Promise<void> {
  const { error } = await requireSupabase().from('areas').delete().eq('id', id);
  if (error) throw error;
}
