import { requireBranchId } from '../lib/branchContext';
import { requireSupabase } from '../lib/supabase';
import { fetchBranchProductPrices, setBranchProductPrice } from './branches';
import type { Product } from '../types/models';

export async function fetchProducts(includeInactive = true): Promise<Product[]> {
  let query = requireSupabase().from('products').select('*').order('name');
  if (!includeInactive) {
    query = query.eq('is_active', true);
  }
  const { data, error } = await query;
  if (error) throw error;
  const products = (data ?? []) as Product[];
  // The catalog is shared; price is per-branch. Overlay the active branch's
  // override, falling back to the catalog base price when there's none.
  const overrides = await fetchBranchProductPrices();
  for (const p of products) {
    const override = overrides.get(p.id);
    if (override !== undefined) p.price = override;
  }
  return products;
}

export async function saveProduct(payload: Partial<Product> & Pick<Product, 'name' | 'price'>): Promise<Product> {
  const { id, price, created_at, updated_at, ...catalog } = payload;
  void created_at;
  void updated_at;

  const client = requireSupabase();
  const branchId = requireBranchId();
  let product: Product;
  if (id) {
    // Catalog fields are global; price is stored per-branch as an override.
    const { data, error } = await client.from('products').update(catalog).eq('id', id).select().single();
    if (error) throw error;
    product = data as Product;
  } else {
    // New product: the base price seeds branches that have no override yet.
    const { data, error } = await client.from('products').insert({ ...catalog, price }).select().single();
    if (error) throw error;
    product = data as Product;
  }
  await setBranchProductPrice(product.id, price, branchId);
  product.price = price;
  return product;
}

export async function deleteProduct(id: string): Promise<void> {
  // Hard delete is safe for history: order_items keep their name/price snapshots,
  // and order_items.product_id is ON DELETE SET NULL.
  const { error } = await requireSupabase().from('products').delete().eq('id', id);
  if (error) throw error;
}

