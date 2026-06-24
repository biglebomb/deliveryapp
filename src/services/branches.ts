import { getActiveBranchId, requireBranchId } from '../lib/branchContext';
import { requireSupabase } from '../lib/supabase';
import type { Branch } from '../types/models';

export async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await requireSupabase().from('branches').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Branch[];
}

export async function createBranch(input: {
  name: string;
  address?: string | null;
  phone?: string | null;
  delivery_fee?: number;
}): Promise<Branch> {
  const { data, error } = await requireSupabase().from('branches').insert(input).select().single();
  if (error) throw error;
  return data as Branch;
}

export async function updateBranch(
  id: string,
  values: Partial<Pick<Branch, 'name' | 'address' | 'phone' | 'is_active' | 'delivery_fee'>>
): Promise<void> {
  const { error } = await requireSupabase().from('branches').update(values).eq('id', id);
  if (error) throw error;
}

/** product_id -> overridden price for the given branch (active branch by default). */
export async function fetchBranchProductPrices(
  branchId = getActiveBranchId()
): Promise<Map<string, number>> {
  if (!branchId) return new Map();
  const { data, error } = await requireSupabase()
    .from('branch_product_prices')
    .select('product_id, price')
    .eq('branch_id', branchId);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.product_id as string, Number(r.price)]));
}

/** packaging_id -> overridden price for the given branch (active branch by default). */
export async function fetchBranchPackagingPrices(
  branchId = getActiveBranchId()
): Promise<Map<string, number>> {
  if (!branchId) return new Map();
  const { data, error } = await requireSupabase()
    .from('branch_packaging_prices')
    .select('packaging_id, price')
    .eq('branch_id', branchId);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.packaging_id as string, Number(r.price)]));
}

export async function setBranchProductPrice(
  productId: string,
  price: number,
  branchId = requireBranchId()
): Promise<void> {
  const { error } = await requireSupabase()
    .from('branch_product_prices')
    .upsert({ branch_id: branchId, product_id: productId, price });
  if (error) throw error;
}

export async function setBranchPackagingPrice(
  packagingId: string,
  price: number,
  branchId = requireBranchId()
): Promise<void> {
  const { error } = await requireSupabase()
    .from('branch_packaging_prices')
    .upsert({ branch_id: branchId, packaging_id: packagingId, price });
  if (error) throw error;
}
