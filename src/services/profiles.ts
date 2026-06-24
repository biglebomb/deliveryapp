import { getActiveBranchId } from '../lib/branchContext';
import { requireSupabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types/models';

/** Drivers in the active branch (used for delivery assignment). */
export async function fetchDrivers(): Promise<Profile[]> {
  let query = requireSupabase().from('profiles').select('*').eq('role', 'driver').order('name');
  const branchId = getActiveBranchId();
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Profile[];
}

/** Branch managers + drivers in the active branch (the team page). */
export async function fetchStaff(): Promise<Profile[]> {
  let query = requireSupabase()
    .from('profiles')
    .select('*')
    .in('role', ['admin', 'driver'])
    .order('role')
    .order('name');
  const branchId = getActiveBranchId();
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function createStaff(input: {
  email: string;
  password: string;
  name: string;
  phone?: string | null;
  role?: Extract<UserRole, 'admin' | 'driver'>;
  branch_id?: string;
}): Promise<void> {
  const { data, error } = await requireSupabase().functions.invoke('create-driver', { body: input });
  if (error) {
    let message = error.message;
    try {
      const body = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }
}

export async function setDriverActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await requireSupabase().from('profiles').update({ is_active }).eq('id', id);
  if (error) throw error;
}
