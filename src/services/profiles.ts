import { requireSupabase } from '../lib/supabase';
import type { Profile } from '../types/models';

export async function fetchDrivers(): Promise<Profile[]> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('*')
    .eq('role', 'driver')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function createDriver(input: {
  email: string;
  password: string;
  name: string;
  phone?: string | null;
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
