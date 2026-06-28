import Papa from 'papaparse';
import { saveCustomer } from './customers';
import { createHistoricalOrder } from './orders';
import type {
  Customer,
  NewOrderItem,
  Order,
  PackagingOption,
  PaymentMethod,
  PaymentStatus,
  Product
} from '../types/models';

// Canonical column order — export produces exactly these, import consumes them.
export const CSV_COLUMNS = [
  'order_ref',
  'date',
  'customer',
  'phone',
  'status',
  'payment_status',
  'payment_method',
  'delivery_fee',
  'notes',
  'product',
  'quantity',
  'unit_price',
  'packaging',
  'packaging_fee'
] as const;

/** Orders → CSV (one row per line item; order-level fields repeat). */
export function ordersToCsv(orders: Order[]): string {
  const rows: Record<string, unknown>[] = [];
  for (const o of orders) {
    const date = (o.delivered_at ?? o.order_date ?? '').slice(0, 10);
    const base = {
      order_ref: o.id,
      date,
      customer: o.customer?.name ?? '',
      phone: o.customer?.phone ?? '',
      status: o.status,
      payment_status: o.payment_status,
      payment_method: o.payment_method ?? '',
      delivery_fee: o.delivery_fee ?? 0,
      notes: o.delivery_notes ?? ''
    };
    const items = o.order_items ?? [];
    if (items.length === 0) {
      rows.push({ ...base, product: '', quantity: '', unit_price: '', packaging: '', packaging_fee: '' });
    } else {
      for (const it of items) {
        rows.push({
          ...base,
          product: it.product_name_snapshot,
          quantity: it.quantity,
          unit_price: it.unit_price_snapshot,
          packaging: it.packaging_name_snapshot ?? '',
          packaging_fee: it.packaging_fee_snapshot ?? 0
        });
      }
    }
  }
  return Papa.unparse(rows, { columns: [...CSV_COLUMNS] });
}

export interface ImportContext {
  products: Product[];
  packaging: PackagingOption[];
  customers: Customer[];
  existingOrderIds: Set<string>;
}

export interface PlannedItem {
  product: Product;
  quantity: number;
  packaging: PackagingOption | null;
  unitPrice: number | null; // override, else product's price
}

export interface PlannedOrder {
  ref: string;
  date: string;
  customerName: string;
  phone: string | null;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  deliveryFee: number;
  notes: string | null;
  items: PlannedItem[];
  total: number;
  errors: string[]; // non-empty → not importable
}

export interface ImportPlan {
  orders: PlannedOrder[];
  importable: number;
  skipped: number; // groups whose order_ref already exists
}

const norm = (s: string) => s.trim().toLowerCase();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_METHODS = ['cash', 'qris', 'transfer', 'other'];

/** Parse + validate CSV into a plan you can preview before importing. */
export function planImport(csvText: string, ctx: ImportContext): ImportPlan {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim()
  });
  const rows = parsed.data;

  const productByName = new Map(ctx.products.map((p) => [norm(p.name), p]));
  const packagingByName = new Map(ctx.packaging.map((p) => [norm(p.name), p]));

  // Group rows into orders by order_ref; blank ref = one order per row.
  const groups = new Map<string, Record<string, string>[]>();
  rows.forEach((row, i) => {
    const ref = (row.order_ref ?? '').trim() || `__row_${i}`;
    const list = groups.get(ref) ?? [];
    list.push(row);
    groups.set(ref, list);
  });

  const orders: PlannedOrder[] = [];
  let skipped = 0;

  for (const [ref, groupRows] of groups) {
    // Re-importing an exported order (ref is an existing id) → skip to avoid dupes.
    if (ctx.existingOrderIds.has(ref)) {
      skipped++;
      continue;
    }

    const head = groupRows[0];
    const errors: string[] = [];

    const date = (head.date ?? '').trim();
    if (!DATE_RE.test(date)) errors.push(`Bad or missing date "${head.date ?? ''}" (use YYYY-MM-DD)`);
    const customerName = (head.customer ?? '').trim();
    if (!customerName) errors.push('Missing customer');

    const paymentStatus: PaymentStatus = norm(head.payment_status ?? '') === 'unpaid' ? 'unpaid' : 'paid';
    const pmRaw = norm(head.payment_method ?? '');
    const paymentMethod = (PAYMENT_METHODS.includes(pmRaw) ? pmRaw : null) as PaymentMethod | null;
    const deliveryFee = Number(head.delivery_fee ?? 0) || 0;

    const items: PlannedItem[] = [];
    for (const row of groupRows) {
      const productName = (row.product ?? '').trim();
      if (!productName) continue; // allow a header/order row with no product line
      const product = productByName.get(norm(productName));
      if (!product) {
        errors.push(`Unknown product "${productName}"`);
        continue;
      }
      const quantity = Number(row.quantity ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push(`Bad quantity "${row.quantity ?? ''}" for ${productName}`);
        continue;
      }
      const packagingName = (row.packaging ?? '').trim();
      const packaging = packagingName ? packagingByName.get(norm(packagingName)) ?? null : null;
      if (packagingName && !packaging) errors.push(`Unknown packaging "${packagingName}"`);
      const unitPriceRaw = (row.unit_price ?? '').trim();
      const unitPrice = unitPriceRaw === '' ? null : Number(unitPriceRaw);

      items.push({ product, quantity, packaging, unitPrice: Number.isFinite(unitPrice) ? unitPrice : null });
    }
    if (items.length === 0) errors.push('No valid product lines');

    const total =
      items.reduce(
        (s, it) => s + (Number(it.unitPrice ?? it.product.price) + Number(it.packaging?.price ?? 0)) * it.quantity,
        0
      ) + deliveryFee;

    orders.push({
      ref,
      date,
      customerName,
      phone: (head.phone ?? '').trim() || null,
      paymentStatus,
      paymentMethod,
      deliveryFee,
      notes: (head.notes ?? '').trim() || null,
      items,
      total,
      errors
    });
  }

  return { orders, importable: orders.filter((o) => o.errors.length === 0).length, skipped };
}

export interface ImportResult {
  created: number;
  failed: { ref: string; message: string }[];
}

/** Create the importable orders. Resolves/creates customers by name in the active branch. */
export async function runImport(plan: ImportPlan, customers: Customer[]): Promise<ImportResult> {
  const byName = new Map(customers.map((c) => [norm(c.name), c]));
  const result: ImportResult = { created: 0, failed: [] };

  for (const order of plan.orders) {
    if (order.errors.length) continue;
    try {
      let customer = byName.get(norm(order.customerName));
      if (!customer) {
        customer = await saveCustomer({ name: order.customerName, phone: order.phone });
        byName.set(norm(customer.name), customer);
      }

      const items: NewOrderItem[] = order.items.map((it) => ({
        // Honour a per-row unit_price override by snapshotting an adjusted product price.
        product: it.unitPrice !== null ? { ...it.product, price: it.unitPrice } : it.product,
        quantity: it.quantity,
        packaging: it.packaging
      }));

      await createHistoricalOrder({
        customer,
        items,
        date: order.date,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        deliveryFee: order.deliveryFee,
        deliveryNotes: order.notes
      });
      result.created++;
    } catch (err) {
      result.failed.push({ ref: order.ref, message: err instanceof Error ? err.message : 'failed' });
    }
  }
  return result;
}
