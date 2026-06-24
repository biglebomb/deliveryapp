import { requireBranchId } from '../lib/branchContext';
import { requireSupabase } from '../lib/supabase';
import { fetchBranchPackagingPrices, setBranchPackagingPrice } from './branches';
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
  const options = (data ?? []) as PackagingOption[];
  // Shared catalog, per-branch price: overlay the active branch's override.
  const overrides = await fetchBranchPackagingPrices();
  for (const o of options) {
    const override = overrides.get(o.id);
    if (override !== undefined) o.price = override;
  }
  return options;
}

export async function savePackagingOption(
  payload: Partial<PackagingOption> & Pick<PackagingOption, 'name' | 'price'>
): Promise<PackagingOption> {
  const { id, price, created_at, updated_at, ...values } = payload;
  void created_at;
  void updated_at;

  const client = requireSupabase();
  const branchId = requireBranchId();
  // Only one default at a time (default is a global catalog property).
  if (values.is_default) {
    await client.from('packaging_options').update({ is_default: false }).neq('id', id ?? '');
  }

  let option: PackagingOption;
  if (id) {
    const { data, error } = await client.from('packaging_options').update(values).eq('id', id).select().single();
    if (error) throw error;
    option = data as PackagingOption;
  } else {
    const { data, error } = await client.from('packaging_options').insert({ ...values, price }).select().single();
    if (error) throw error;
    option = data as PackagingOption;
  }
  await setBranchPackagingPrice(option.id, price, branchId);
  option.price = price;
  return option;
}

export async function deletePackagingOption(id: string): Promise<void> {
  // order_items.packaging_id is ON DELETE SET NULL; name/fee snapshots are kept.
  const { error } = await requireSupabase().from('packaging_options').delete().eq('id', id);
  if (error) throw error;
}
