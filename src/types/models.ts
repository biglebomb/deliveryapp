export type OrderStatus = 'pending' | 'preparing' | 'delivering' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid';
export type PaymentMethod = 'cash' | 'qris' | 'transfer' | 'other';
export type UserRole = 'admin' | 'driver';

export interface Profile {
  id: string;
  name: string | null;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

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
  payment_method: PaymentMethod | null;
  delivery_notes: string | null;
  latitude: number | null;
  longitude: number | null;
  delivery_area: string | null;
  assigned_driver_id: string | null;
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

export interface ParsedOrderItem {
  name: string;
  quantity: number;
  product_id?: string | null;
}

export interface ParsedOrder {
  customer_name: string | null;
  phone: string | null;
  items: ParsedOrderItem[];
  notes: string | null;
}

export type InboxStatus = 'pending' | 'confirmed' | 'rejected';

export interface InboxItem {
  id: string;
  raw_text: string | null;
  parsed: ParsedOrder | null;
  latitude: number | null;
  longitude: number | null;
  sender: string | null;
  status: InboxStatus;
  created_at: string;
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
export const paymentMethods: PaymentMethod[] = ['cash', 'qris', 'transfer', 'other'];

