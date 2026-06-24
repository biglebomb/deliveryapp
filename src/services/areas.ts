import { getActiveBranchId, requireBranchId } from '../lib/branchContext';
import { requireSupabase } from '../lib/supabase';
import type { Area, AreaPoint } from '../types/models';

export async function fetchAreas(): Promise<Area[]> {
  let query = requireSupabase().from('areas').select('*').order('name');
  const branchId = getActiveBranchId();
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
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
    : requireSupabase().from('areas').insert({ ...values, branch_id: requireBranchId() }).select().single();

  const { data, error } = await query;
  if (error) throw error;
  return data as Area;
}

export async function deleteArea(id: string): Promise<void> {
  const { error } = await requireSupabase().from('areas').delete().eq('id', id);
  if (error) throw error;
}
