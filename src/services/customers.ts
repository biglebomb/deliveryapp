import { requireSupabase } from '../lib/supabase';
import type { Customer } from '../types/models';

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await requireSupabase().from('customers').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Customer[];
}

export async function saveCustomer(payload: Partial<Customer> & Pick<Customer, 'name'>): Promise<Customer> {
  const { id, created_at, updated_at, ...values } = payload;
  void created_at;
  void updated_at;

  const query = id
    ? requireSupabase().from('customers').update(values).eq('id', id).select().single()
    : requireSupabase().from('customers').insert(values).select().single();

  const { data, error } = await query;
  if (error) throw error;
  return data as Customer;
}

