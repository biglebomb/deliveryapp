import { getActiveBranchId } from '../lib/branchContext';
import { requireSupabase } from '../lib/supabase';
import type { InboxItem, InboxStatus } from '../types/models';

export async function fetchInbox(status: InboxStatus = 'pending'): Promise<InboxItem[]> {
  let query = requireSupabase()
    .from('order_inbox')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });
  const branchId = getActiveBranchId();
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as InboxItem[];
}

export async function countPendingInbox(): Promise<number> {
  let query = requireSupabase()
    .from('order_inbox')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  const branchId = getActiveBranchId();
  if (branchId) query = query.eq('branch_id', branchId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function markInbox(id: string, status: InboxStatus): Promise<void> {
  const { error } = await requireSupabase().from('order_inbox').update({ status }).eq('id', id);
  if (error) throw error;
}
