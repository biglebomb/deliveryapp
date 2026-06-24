import { getActiveBranchId, requireBranchId } from '../lib/branchContext';
import { requireSupabase } from '../lib/supabase';
import type { Customer } from '../types/models';

export async function fetchCustomers(): Promise<Customer[]> {
  let query = requireSupabase().from('customers').select('*').order('name');
  const branchId = getActiveBranchId();
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Customer[];
}

export async function saveCustomer(payload: Partial<Customer> & Pick<Customer, 'name'>): Promise<Customer> {
  const { id, created_at, updated_at, ...values } = payload;
  void created_at;
  void updated_at;

  const query = id
    ? requireSupabase().from('customers').update(values).eq('id', id).select().single()
    : requireSupabase().from('customers').insert({ ...values, branch_id: requireBranchId() }).select().single();

  const { data, error } = await query;
  if (error) throw error;
  return data as Customer;
}

