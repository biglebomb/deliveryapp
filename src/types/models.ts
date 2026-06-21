export type OrderStatus = 'pending' | 'preparing' | 'delivering' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface PackagingOption {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  subtotal: number;
  packaging_id: string | null;
  packaging_name_snapshot: string | null;
  packaging_fee_snapshot: number;
}

export interface Order {
  id: string;
  customer_id: string;
  order_date: string;
  status: OrderStatus;
  total_amount: number;
  payment_status: PaymentStatus;
  delivery_notes: string | null;
  latitude: number | null;
  longitude: number | null;
  delivery_area: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  order_items?: OrderItem[];
}

export interface NewOrderItem {
  product: Product;
  quantity: number;
  packaging?: PackagingOption | null;
}

export interface AreaPoint {
  lat: number;
  lng: number;
}

export interface Area {
  id: string;
  name: string;
  color: string | null;
  polygon: AreaPoint[];
  created_at: string;
  updated_at: string;
}

export const orderStatuses: OrderStatus[] = ['pending', 'preparing', 'delivering', 'delivered', 'cancelled'];
export const paymentStatuses: PaymentStatus[] = ['unpaid', 'paid'];

