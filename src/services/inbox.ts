import { requireSupabase } from '../lib/supabase';
import type { InboxItem, InboxStatus } from '../types/models';

export async function fetchInbox(status: InboxStatus = 'pending'): Promise<InboxItem[]> {
  const { data, error } = await requireSupabase()
    .from('order_inbox')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as InboxItem[];
}

export async function countPendingInbox(): Promise<number> {
  const { count, error } = await requireSupabase()
    .from('order_inbox')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}

export async function markInbox(id: string, status: InboxStatus): Promise<void> {
  const { error } = await requireSupabase().from('order_inbox').update({ status }).eq('id', id);
  if (error) throw error;
}
