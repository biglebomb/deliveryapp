import { getActiveBranchId, requireBranchId } from '../lib/branchContext';
import { requireSupabase } from '../lib/supabase';
import type {
  Customer,
  NewOrderItem,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus
} from '../types/models';

const orderSelect = `
  *,
  customer:customers(*),
  order_items(*)
`;

export async function fetchOrders(includeArchived = false): Promise<Order[]> {
  let query = requireSupabase().from('orders').select(orderSelect);
  if (!includeArchived) query = query.is('archived_at', null);
  const branchId = getActiveBranchId();
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query.order('order_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function fetchActiveDeliveries(): Promise<Order[]> {
  let query = requireSupabase()
    .from('orders')
    .select(orderSelect)
    .in('status', ['preparing', 'delivering']);
  const branchId = getActiveBranchId();
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query.order('order_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Order[];
}

/** Midnight today in Jakarta (UTC+7, no DST) as a UTC ISO instant. */
function jakartaTodayStartUtcISO(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  return new Date(`${today}T00:00:00+07:00`).toISOString();
}

export async function fetchMyDeliveries(driverId: string): Promise<Order[]> {
  // Active deliveries, plus orders delivered earlier today so the driver still
  // sees what they've completed (shown as done, excluded from the map/route).
  const since = jakartaTodayStartUtcISO();
  let query = requireSupabase()
    .from('orders')
    .select(orderSelect)
    .eq('assigned_driver_id', driverId)
    .or(`status.in.(preparing,delivering),and(status.eq.delivered,delivered_at.gte.${since})`);
  const branchId = getActiveBranchId();
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query.order('order_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function createOrder(input: {
  customer: Customer;
  items: NewOrderItem[];
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryNotes: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deliveryArea?: string | null;
}): Promise<Order> {
  const client = requireSupabase();
  const lineTotal = (item: NewOrderItem) =>
    (Number(item.product.price) + Number(item.packaging?.price ?? 0)) * item.quantity;
  const totalAmount = input.items.reduce((total, item) => total + lineTotal(item), 0);

  const { data: order, error: orderError } = await client
    .from('orders')
    .insert({
      customer_id: input.customer.id,
      order_date: new Date().toISOString(),
      status: input.status,
      total_amount: totalAmount,
      payment_status: input.paymentStatus,
      paid_at: input.paymentStatus === 'paid' ? new Date().toISOString() : null,
      delivery_notes: input.deliveryNotes,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      delivery_area: input.deliveryArea ?? null,
      branch_id: requireBranchId()
    })
    .select()
    .single();

  if (orderError) throw orderError;

  const itemRows = input.items.map((item) => ({
    order_id: order.id,
    product_id: item.product.id,
    product_name_snapshot: item.product.name,
    unit_price_snapshot: item.product.price,
    quantity: item.quantity,
    subtotal: lineTotal(item),
    packaging_id: item.packaging?.id ?? null,
    packaging_name_snapshot: item.packaging?.name ?? null,
    packaging_fee_snapshot: Number(item.packaging?.price ?? 0)
  }));

  const { error: itemError } = await client.from('order_items').insert(itemRows);
  if (itemError) throw itemError;

  const { data: fullOrder, error: fetchError } = await client
    .from('orders')
    .select(orderSelect)
    .eq('id', order.id)
    .single();
  if (fetchError) throw fetchError;
  return fullOrder as Order;
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  // Stamp the delivery moment so reports/dashboard can attribute revenue to the
  // day it was actually delivered; clear it if the order moves back out of delivered.
  const delivered_at = status === 'delivered' ? new Date().toISOString() : null;
  const { error } = await requireSupabase().from('orders').update({ status, delivered_at }).eq('id', id);
  if (error) throw error;
}

/** Archive every delivered, not-yet-archived order in the active branch. Returns how many were cleared. */
export async function archiveDeliveredOrders(): Promise<number> {
  let query = requireSupabase()
    .from('orders')
    .update({ archived_at: new Date().toISOString() })
    .eq('status', 'delivered')
    .is('archived_at', null);
  const branchId = getActiveBranchId();
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query.select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

export async function updatePaymentStatus(id: string, payment_status: PaymentStatus): Promise<void> {
  const paid_at = payment_status === 'paid' ? new Date().toISOString() : null;
  const { error } = await requireSupabase().from('orders').update({ payment_status, paid_at }).eq('id', id);
  if (error) throw error;
}

export async function updatePayment(
  id: string,
  payment_status: PaymentStatus,
  payment_method: PaymentMethod | null
): Promise<void> {
  const paid_at = payment_status === 'paid' ? new Date().toISOString() : null;
  const { error } = await requireSupabase()
    .from('orders')
    .update({ payment_status, payment_method, paid_at })
    .eq('id', id);
  if (error) throw error;
}

export async function assignDriver(id: string, assigned_driver_id: string | null): Promise<void> {
  const { error } = await requireSupabase().from('orders').update({ assigned_driver_id }).eq('id', id);
  if (error) throw error;
}

export async function fetchOrderById(id: string): Promise<Order> {
  const { data, error } = await requireSupabase().from('orders').select(orderSelect).eq('id', id).single();
  if (error) throw error;
  return data as Order;
}

export async function updateOrder(
  id: string,
  input: {
    items: NewOrderItem[];
    deliveryNotes: string | null;
    latitude?: number | null;
    longitude?: number | null;
    deliveryArea?: string | null;
  }
): Promise<void> {
  const client = requireSupabase();
  const lineTotal = (item: NewOrderItem) =>
    (Number(item.product.price) + Number(item.packaging?.price ?? 0)) * item.quantity;
  const totalAmount = input.items.reduce((total, item) => total + lineTotal(item), 0);

  const { error: orderError } = await client.from('orders').update({
    total_amount: totalAmount,
    delivery_notes: input.deliveryNotes,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    delivery_area: input.deliveryArea ?? null
  }).eq('id', id);
  if (orderError) throw orderError;

  const { error: deleteError } = await client.from('order_items').delete().eq('order_id', id);
  if (deleteError) throw deleteError;

  if (input.items.length > 0) {
    const itemRows = input.items.map((item) => ({
      order_id: id,
      product_id: item.product.id,
      product_name_snapshot: item.product.name,
      unit_price_snapshot: item.product.price,
      quantity: item.quantity,
      subtotal: lineTotal(item),
      packaging_id: item.packaging?.id ?? null,
      packaging_name_snapshot: item.packaging?.name ?? null,
      packaging_fee_snapshot: Number(item.packaging?.price ?? 0)
    }));
    const { error: itemError } = await client.from('order_items').insert(itemRows);
    if (itemError) throw itemError;
  }
}

/** Unarchive a delivered order and set it back to pending so it re-appears in the orders list. */
export async function reopenOrder(id: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('orders')
    .update({ archived_at: null, status: 'pending', delivered_at: null })
    .eq('id', id);
  if (error) throw error;
}

export async function updateOrderLocation(
  id: string,
  latitude: number | null,
  longitude: number | null,
  deliveryArea?: string | null
): Promise<void> {
  const values: Record<string, unknown> = { latitude, longitude };
  if (deliveryArea !== undefined) values.delivery_area = deliveryArea;
  const { error } = await requireSupabase().from('orders').update(values).eq('id', id);
  if (error) throw error;
}

