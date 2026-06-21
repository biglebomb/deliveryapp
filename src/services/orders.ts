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

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await requireSupabase()
    .from('orders')
    .select(orderSelect)
    .order('order_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function fetchActiveDeliveries(): Promise<Order[]> {
  const { data, error } = await requireSupabase()
    .from('orders')
    .select(orderSelect)
    .in('status', ['preparing', 'delivering'])
    .order('order_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function fetchMyDeliveries(driverId: string): Promise<Order[]> {
  const { data, error } = await requireSupabase()
    .from('orders')
    .select(orderSelect)
    .eq('assigned_driver_id', driverId)
    .in('status', ['preparing', 'delivering'])
    .order('order_date', { ascending: true });
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
      delivery_notes: input.deliveryNotes,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      delivery_area: input.deliveryArea ?? null
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
  const { error } = await requireSupabase().from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function updatePaymentStatus(id: string, payment_status: PaymentStatus): Promise<void> {
  const { error } = await requireSupabase().from('orders').update({ payment_status }).eq('id', id);
  if (error) throw error;
}

export async function updatePayment(
  id: string,
  payment_status: PaymentStatus,
  payment_method: PaymentMethod | null
): Promise<void> {
  const { error } = await requireSupabase()
    .from('orders')
    .update({ payment_status, payment_method })
    .eq('id', id);
  if (error) throw error;
}

export async function assignDriver(id: string, assigned_driver_id: string | null): Promise<void> {
  const { error } = await requireSupabase().from('orders').update({ assigned_driver_id }).eq('id', id);
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

