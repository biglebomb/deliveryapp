import type { Order } from '../types/models';

export const jakartaTimeZone = 'Asia/Jakarta';

export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(value ?? 0);
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: jakartaTimeZone,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

export function whatsappUrl(phone: string | null | undefined, message?: string): string {
  const normalized = normalizePhone(phone);
  const suffix = message ? `?text=${encodeURIComponent(message)}` : '';
  return normalized ? `https://wa.me/${normalized}${suffix}` : '';
}

export function buildOrderSummary(order: Order): string {
  const customer = order.customer?.name ?? 'Customer';
  const items = (order.order_items ?? [])
    .map((item) => {
      const pack =
        item.packaging_fee_snapshot > 0 && item.packaging_name_snapshot
          ? ` (${item.packaging_name_snapshot})`
          : '';
      return `${item.quantity}x ${item.product_name_snapshot}${pack}`;
    })
    .join(', ');

  return [
    `Pesanan ${customer}`,
    items || 'Tidak ada item',
    `Total: ${formatCurrency(order.total_amount)}`,
    `Status: ${order.status}`,
    order.delivery_notes ? `Catatan: ${order.delivery_notes}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

