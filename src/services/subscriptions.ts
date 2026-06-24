import { getActiveBranchId, requireBranchId } from '../lib/branchContext';
import { requireSupabase } from '../lib/supabase';
import { assignArea } from '../lib/route';
import { fetchAreas } from './areas';
import type { Subscription, SubscriptionItem, SubscriptionStatus } from '../types/models';

const subscriptionSelect = `
  *,
  customer:customers(*)
`;

/** Today's date as YYYY-MM-DD in the business timezone (Asia/Jakarta). */
function jakartaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

/** Day of week (0 = Sunday .. 6 = Saturday) in the business timezone. */
function jakartaWeekday(): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' }).format(new Date());
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

export function itemsTotal(items: SubscriptionItem[]): number {
  return items.reduce((sum, i) => sum + (Number(i.unit_price) + Number(i.packaging_fee)) * i.quantity, 0);
}

export async function fetchSubscriptions(includeInactive = true): Promise<Subscription[]> {
  let query = requireSupabase().from('subscriptions').select(subscriptionSelect);
  if (!includeInactive) query = query.eq('status', 'active');
  const branchId = getActiveBranchId();
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Subscription[];
}

export async function saveSubscription(input: {
  id?: string;
  customer_id: string;
  items: SubscriptionItem[];
  weekdays: number[];
  deliveries_total: number;
  amount_paid: number;
  delivery_notes: string | null;
  status?: SubscriptionStatus;
}): Promise<void> {
  const client = requireSupabase();
  const price_per_delivery = itemsTotal(input.items);
  const row = {
    customer_id: input.customer_id,
    items: input.items,
    weekdays: input.weekdays,
    deliveries_total: input.deliveries_total,
    price_per_delivery,
    amount_paid: input.amount_paid,
    delivery_notes: input.delivery_notes,
    ...(input.status ? { status: input.status } : {})
  };
  if (input.id) {
    const { error } = await client.from('subscriptions').update(row).eq('id', input.id);
    if (error) throw error;
  } else {
    const { error } = await client.from('subscriptions').insert({ ...row, branch_id: requireBranchId() });
    if (error) throw error;
  }
}

export async function setSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<void> {
  const { error } = await requireSupabase().from('subscriptions').update({ status }).eq('id', id);
  if (error) throw error;
}

/** Add more prepaid deliveries to a subscription and reactivate it. */
export async function renewSubscription(id: string, addDeliveries: number, addPayment: number): Promise<void> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('subscriptions')
    .select('deliveries_total, amount_paid')
    .eq('id', id)
    .single();
  if (error) throw error;
  const { error: updateError } = await client
    .from('subscriptions')
    .update({
      deliveries_total: Number(data.deliveries_total) + addDeliveries,
      amount_paid: Number(data.amount_paid) + addPayment,
      status: 'active'
    })
    .eq('id', id);
  if (updateError) throw updateError;
}

export async function deleteSubscription(id: string): Promise<void> {
  const { error } = await requireSupabase().from('subscriptions').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Create today's orders for every active subscription scheduled for today that
 * hasn't generated yet and still has prepaid deliveries left. Each order is
 * marked paid (covered by the upfront payment) and counts the balance down.
 * Idempotent: a subscription whose last_generated_date is today is skipped, so
 * this is safe to call on every app load.
 *
 * Returns the number of orders created.
 */
export async function generateTodaysSubscriptionOrders(): Promise<number> {
  const client = requireSupabase();
  const today = jakartaToday();
  const weekday = jakartaWeekday();
  // Generate only for the active branch, so areas resolve correctly and orders
  // are stamped with this branch. Each branch generates when its app is loaded.
  const branchId = getActiveBranchId();

  let subsQuery = client.from('subscriptions').select(subscriptionSelect).eq('status', 'active');
  if (branchId) subsQuery = subsQuery.eq('branch_id', branchId);
  const { data: subs, error } = await subsQuery;
  if (error) throw error;

  const due = (subs ?? []).filter((s: Subscription) => {
    if (s.last_generated_date === today) return false;
    if (!s.weekdays.includes(weekday)) return false;
    return s.deliveries_used < s.deliveries_total;
  }) as Subscription[];

  if (due.length === 0) return 0;

  const areas = await fetchAreas();
  let created = 0;

  for (const sub of due) {
    const customer = sub.customer;
    const lat = customer?.latitude ?? null;
    const lng = customer?.longitude ?? null;
    const area = lat !== null && lng !== null ? assignArea({ lat, lng }, areas) : null;

    const totalAmount = itemsTotal(sub.items);

    const { data: order, error: orderError } = await client
      .from('orders')
      .insert({
        customer_id: sub.customer_id,
        order_date: new Date().toISOString(),
        status: 'pending',
        total_amount: totalAmount,
        payment_status: 'paid',
        payment_method: 'transfer',
        paid_at: new Date().toISOString(),
        delivery_notes: sub.delivery_notes,
        latitude: lat,
        longitude: lng,
        delivery_area: area,
        subscription_id: sub.id,
        branch_id: sub.branch_id
      })
      .select('id')
      .single();
    if (orderError) throw orderError;

    const itemRows = sub.items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name_snapshot: item.product_name,
      unit_price_snapshot: item.unit_price,
      quantity: item.quantity,
      subtotal: (Number(item.unit_price) + Number(item.packaging_fee)) * item.quantity,
      packaging_id: item.packaging_id,
      packaging_name_snapshot: item.packaging_name,
      packaging_fee_snapshot: item.packaging_fee
    }));
    const { error: itemError } = await client.from('order_items').insert(itemRows);
    if (itemError) throw itemError;

    const used = sub.deliveries_used + 1;
    const status: SubscriptionStatus = used >= sub.deliveries_total ? 'completed' : 'active';
    const { error: subError } = await client
      .from('subscriptions')
      .update({ deliveries_used: used, last_generated_date: today, status })
      .eq('id', sub.id);
    if (subError) throw subError;

    created += 1;
  }

  return created;
}
