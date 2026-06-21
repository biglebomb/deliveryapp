import { requireSupabase } from '../lib/supabase';
import type { PackagingOption } from '../types/models';

export async function fetchPackagingOptions(includeInactive = true): Promise<PackagingOption[]> {
  let query = requireSupabase()
    .from('packaging_options')
    .select('*')
    .order('is_default', { ascending: false })
    .order('price')
    .order('name');
  if (!includeInactive) {
    query = query.eq('is_active', true);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PackagingOption[];
}

export async function savePackagingOption(
  payload: Partial<PackagingOption> & Pick<PackagingOption, 'name' | 'price'>
): Promise<PackagingOption> {
  const { id, created_at, updated_at, ...values } = payload;
  void created_at;
  void updated_at;

  const client = requireSupabase();
  // Only one default at a time.
  if (values.is_default) {
    await client.from('packaging_options').update({ is_default: false }).neq('id', id ?? '');
  }

  const query = id
    ? client.from('packaging_options').update(values).eq('id', id).select().single()
    : client.from('packaging_options').insert(values).select().single();

  const { data, error } = await query;
  if (error) throw error;
  return data as PackagingOption;
}

export async function deletePackagingOption(id: string): Promise<void> {
  // order_items.packaging_id is ON DELETE SET NULL; name/fee snapshots are kept.
  const { error } = await requireSupabase().from('packaging_options').delete().eq('id', id);
  if (error) throw error;
}
