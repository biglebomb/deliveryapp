import { requireSupabase } from '../lib/supabase';
import type { Product } from '../types/models';

export async function fetchProducts(includeInactive = true): Promise<Product[]> {
  let query = requireSupabase().from('products').select('*').order('name');
  if (!includeInactive) {
    query = query.eq('is_active', true);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Product[];
}

export async function saveProduct(payload: Partial<Product> & Pick<Product, 'name' | 'price'>): Promise<Product> {
  const { id, created_at, updated_at, ...values } = payload;
  void created_at;
  void updated_at;

  const query = id
    ? requireSupabase().from('products').update(values).eq('id', id).select().single()
    : requireSupabase().from('products').insert(values).select().single();

  const { data, error } = await query;
  if (error) throw error;
  return data as Product;
}

