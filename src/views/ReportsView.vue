<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useAuth } from '../composables/useAuth';
import { useBranch } from '../composables/useBranch';
import { formatCurrency, formatDateTime } from '../lib/format';
import { estimateMileageKm, type GeoPoint } from '../lib/route';
import { fetchOrders, reopenOrder, updatePayment } from '../services/orders';
import { fetchAllDrivers } from '../services/profiles';
import type { Order, PaymentMethod, Profile } from '../types/models';
import { paymentMethods } from '../types/models';

const router = useRouter();
const { smAndDown } = useDisplay();
const auth = useAuth();
const branchCtx = useBranch();

const orders = ref<Order[]>([]);
const drivers = ref<Profile[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');

// Owner can scope reports to all branches or one; managers see only their own.
const branchFilter = ref<string>('all');
const branchOptions = computed(() => [
  { value: 'all', title: 'All branches' },
  ...branchCtx.branches.value.map((b) => ({ value: b.id, title: b.name }))
]);

// Date range as Date objects (driven by v-date-picker); the filter compares
// YYYY-MM-DD keys derived from the picked calendar day (no timezone shift).
function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayInJakarta(): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })
    .format(new Date())
    .split('-')
    .map(Number);
  return new Date(y, m - 1, d);
}
function dateLabel(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(d);
}

const fromDate = ref<Date>(todayInJakarta());
const toDate = ref<Date>(todayInJakarta());
const fromMenu = ref(false);
const toMenu = ref(false);
const from = computed(() => toYmd(fromDate.value));
const to = computed(() => toYmd(toDate.value));

const methodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  qris: 'QRIS',
  transfer: 'Transfer',
  other: 'Other'
};
const methodItems = paymentMethods.map((m) => ({ value: m, title: methodLabels[m] }));

const filtered = computed(() =>
  orders.value.filter((o) => {
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(o.order_date));
    const inRange = key >= from.value && key <= to.value;
    const inBranch = branchFilter.value === 'all' || o.branch_id === branchFilter.value;
    return inRange && inBranch;
  })
);

// Per-branch totals (owner, "All branches" view).
const branchBreakdown = computed(() => {
  const map = new Map<string, { name: string; sales: number; paid: number; delivered: number }>();
  for (const o of filtered.value) {
    const name = branchCtx.branches.value.find((b) => b.id === o.branch_id)?.name ?? 'Branch';
    const r = map.get(o.branch_id) ?? { name, sales: 0, paid: 0, delivered: 0 };
    r.sales += Number(o.total_amount);
    if (o.payment_status === 'paid') r.paid += Number(o.total_amount);
    if (o.status === 'delivered') r.delivered += 1;
    map.set(o.branch_id, r);
  }
  return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
});

const branchBreakdownHeaders = [
  { title: 'Branch', key: 'name' },
  { title: 'Sales', key: 'sales', align: 'end' as const, width: '130px' },
  { title: 'Paid', key: 'paid', align: 'end' as const, width: '130px' },
  { title: 'Delivered', key: 'delivered', align: 'end' as const, width: '110px' }
];

const totalSales = computed(() => filtered.value.reduce((s, o) => s + Number(o.total_amount), 0));
const paidSales = computed(() => filtered.value.filter((o) => o.payment_status === 'paid').reduce((s, o) => s + Number(o.total_amount), 0));
const unpaidSales = computed(() => totalSales.value - paidSales.value);

const finishedDeliveries = computed(() =>
  filtered.value
    .filter((o) => o.status === 'delivered')
    .sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())
);

type DeliveryRow = Order & { customer_name: string; items_summary: string };

const deliveryRows = computed<DeliveryRow[]>(() =>
  finishedDeliveries.value.map((o) => ({
    ...o,
    customer_name: o.customer?.name ?? '—',
    items_summary: (o.order_items ?? []).map((i) => `${i.quantity}× ${i.product_name_snapshot}`).join(', ')
  }))
);

type TableHeader = {
  title: string;
  key: string;
  sortable?: boolean;
  align?: 'start' | 'end' | 'center';
  width?: string;
};

const deliveryHeaders = computed((): TableHeader[] => [
  { title: 'Date', key: 'order_date', width: '130px' },
  { title: 'Customer', key: 'customer_name' },
  ...(!smAndDown.value
    ? [
        { title: 'Area', key: 'delivery_area', width: '100px' },
        { title: 'Items', key: 'items_summary', sortable: false }
      ]
    : []),
  { title: 'Total', key: 'total_amount', align: 'end', width: '110px' },
  { title: 'Payment', key: 'payment_status', width: '150px' },
  ...(!smAndDown.value ? [{ title: 'Status', key: 'status', width: '140px' }] : []),
  { title: '', key: 'actions', sortable: false, width: '44px' }
]);

const productRows = computed(() => {
  const rows = new Map<string, { name: string; quantity: number; subtotal: number }>();
  for (const o of filtered.value) {
    for (const item of o.order_items ?? []) {
      const r = rows.get(item.product_name_snapshot) ?? { name: item.product_name_snapshot, quantity: 0, subtotal: 0 };
      r.quantity += item.quantity;
      r.subtotal += Number(item.subtotal);
      rows.set(item.product_name_snapshot, r);
    }
  }
  return Array.from(rows.values()).sort((a, b) => b.subtotal - a.subtotal);
});

const productHeaders: TableHeader[] = [
  { title: 'Product', key: 'name' },
  { title: 'Qty sold', key: 'quantity', align: 'end', width: '100px' },
  { title: 'Revenue', key: 'subtotal', align: 'end', width: '130px' }
];

// Driver reimbursement payouts (owner). Per driver, over the filtered period:
// km (estimated) × per_km + deliveries × per_delivery + units × per_unit +
// revenue × pct, using their branch's configured rates.
function driverName(id: string): string {
  return drivers.value.find((d) => d.id === id)?.name ?? 'Driver';
}

const payoutRows = computed(() => {
  if (!auth.isOwner.value) return [];
  const byDriver = new Map<string, Order[]>();
  for (const o of filtered.value) {
    if (o.status !== 'delivered' || !o.assigned_driver_id) continue;
    const list = byDriver.get(o.assigned_driver_id) ?? [];
    list.push(o);
    byDriver.set(o.assigned_driver_id, list);
  }

  const rows = [];
  for (const [driverId, list] of byDriver) {
    const branch = branchCtx.branches.value.find((b) => b.id === list[0].branch_id);
    const center: GeoPoint | null =
      branch && branch.latitude != null && branch.longitude != null
        ? { lat: Number(branch.latitude), lng: Number(branch.longitude) }
        : null;

    const ordered = [...list].sort(
      (a, b) =>
        new Date(a.delivered_at ?? a.order_date).getTime() - new Date(b.delivered_at ?? b.order_date).getTime()
    );
    const stops = ordered
      .map((o) => {
        const lat = o.delivered_lat ?? o.customer?.latitude ?? o.latitude;
        const lng = o.delivered_lng ?? o.customer?.longitude ?? o.longitude;
        return lat != null && lng != null ? ({ lat: Number(lat), lng: Number(lng) } as GeoPoint) : null;
      })
      .filter((p): p is GeoPoint => p !== null);

    const origin = center ?? stops[0] ?? null;
    const km = origin && stops.length ? estimateMileageKm(origin, stops) : 0;
    const deliveries = list.length;
    const units = list.reduce((s, o) => s + (o.order_items?.reduce((q, i) => q + i.quantity, 0) ?? 0), 0);
    const revenue = list.reduce((s, o) => s + Number(o.total_amount), 0);

    const payout =
      km * Number(branch?.reimburse_per_km ?? 0) +
      deliveries * Number(branch?.reimburse_per_delivery ?? 0) +
      units * Number(branch?.reimburse_per_unit ?? 0) +
      (revenue * Number(branch?.reimburse_revenue_pct ?? 0)) / 100;

    rows.push({
      name: driverName(driverId),
      branch: branch?.name ?? '—',
      km,
      deliveries,
      units,
      payout
    });
  }
  return rows.sort((a, b) => b.payout - a.payout);
});

const payoutHeaders = computed((): TableHeader[] => [
  { title: 'Driver', key: 'name' },
  ...(branchFilter.value === 'all' ? [{ title: 'Branch', key: 'branch', width: '120px' }] : []),
  { title: 'Km', key: 'km', align: 'end' as const, width: '90px' },
  { title: 'Deliv.', key: 'deliveries', align: 'end' as const, width: '80px' },
  { title: 'Units', key: 'units', align: 'end' as const, width: '80px' },
  { title: 'Payout', key: 'payout', align: 'end' as const, width: '130px' }
]);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    if (auth.isOwner.value) {
      // HQ: pull every branch so the owner can compare and aggregate.
      await branchCtx.loadBranches();
      [orders.value, drivers.value] = await Promise.all([fetchOrders(true, null), fetchAllDrivers()]);
    } else {
      orders.value = await fetchOrders(true);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load reports.';
  } finally {
    loading.value = false;
  }
}

async function markPaid(id: string, method: PaymentMethod) {
  saving.value = true;
  try {
    await updatePayment(id, 'paid', method);
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not update payment.';
  } finally {
    saving.value = false;
  }
}

async function handleReopen(id: string) {
  saving.value = true;
  try {
    await reopenOrder(id);
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not reopen order.';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="eyebrow">Sales recap</div>
        <h1 class="title">Reports</h1>
      </div>
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <!-- Date range + (owner) branch scope -->
    <v-card class="list-card pa-4 mb-4">
      <div class="grid cols-2">
        <v-menu v-model="fromMenu" :close-on-content-click="false">
          <template #activator="{ props }">
            <v-text-field
              v-bind="props"
              :model-value="dateLabel(fromDate)"
              label="From"
              readonly
              prepend-inner-icon="mdi-calendar"
              hide-details
            />
          </template>
          <v-date-picker v-model="fromDate" hide-header @update:model-value="fromMenu = false" />
        </v-menu>
        <v-menu v-model="toMenu" :close-on-content-click="false">
          <template #activator="{ props }">
            <v-text-field
              v-bind="props"
              :model-value="dateLabel(toDate)"
              label="To"
              readonly
              prepend-inner-icon="mdi-calendar"
              hide-details
            />
          </template>
          <v-date-picker v-model="toDate" hide-header @update:model-value="toMenu = false" />
        </v-menu>
      </div>
      <v-select
        v-if="auth.isOwner.value"
        v-model="branchFilter"
        :items="branchOptions"
        label="Branch"
        prepend-inner-icon="mdi-store-outline"
        class="mt-3"
        hide-details
      />
    </v-card>

    <!-- Per-branch breakdown (owner, all branches) -->
    <v-card v-if="auth.isOwner.value && branchFilter === 'all' && branchBreakdown.length > 1" class="list-card mb-4">
      <div class="section-title pa-4 pb-2">By branch</div>
      <v-data-table
        :headers="branchBreakdownHeaders"
        :items="branchBreakdown"
        :loading="loading"
        density="comfortable"
        item-value="name"
        hide-default-footer
      >
        <template #item.sales="{ item }">
          <span class="font-weight-bold">{{ formatCurrency(item.sales) }}</span>
        </template>
        <template #item.paid="{ item }">{{ formatCurrency(item.paid) }}</template>
      </v-data-table>
    </v-card>

    <!-- Driver reimbursement payouts (owner) -->
    <v-card v-if="auth.isOwner.value && payoutRows.length" class="list-card mb-4">
      <div class="section-title pa-4 pb-2">Driver reimbursement</div>
      <v-data-table
        :headers="payoutHeaders"
        :items="payoutRows"
        :loading="loading"
        density="comfortable"
        item-value="name"
        hide-default-footer
      >
        <template #item.km="{ item }">{{ item.km.toFixed(1) }}</template>
        <template #item.payout="{ item }">
          <span class="font-weight-bold">{{ formatCurrency(item.payout) }}</span>
        </template>
        <template #no-data>
          <div class="pa-4 muted text-center">No driver-assigned deliveries in this range.</div>
        </template>
      </v-data-table>
      <div class="muted text-body-2 px-4 pb-3">
        Km is estimated (branch → stops → branch, ×1.3). Set rates per branch on the Branches page.
      </div>
    </v-card>

    <!-- Metrics -->
    <div class="metric-grid mb-4">
      <v-card class="metric">
        <div class="muted text-body-2">Sales</div>
        <div class="metric-value">{{ formatCurrency(totalSales) }}</div>
      </v-card>
      <v-card class="metric">
        <div class="muted text-body-2">Paid</div>
        <div class="metric-value">{{ formatCurrency(paidSales) }}</div>
      </v-card>
      <v-card class="metric">
        <div class="muted text-body-2">Unpaid</div>
        <div class="metric-value">{{ formatCurrency(unpaidSales) }}</div>
      </v-card>
      <v-card class="metric">
        <div class="muted text-body-2">Delivered</div>
        <div class="metric-value">{{ finishedDeliveries.length }}</div>
      </v-card>
    </div>

    <!-- Finished deliveries table -->
    <v-card class="list-card mb-4" :loading="saving">
      <div class="section-title pa-4 pb-2">Finished deliveries</div>
      <v-data-table
        :headers="deliveryHeaders"
        :items="deliveryRows"
        :loading="loading"
        density="comfortable"
        hover
        item-value="id"
      >
        <template #item.order_date="{ item }">
          <span class="muted text-body-2">{{ formatDateTime(item.order_date) }}</span>
        </template>

        <template #item.delivery_area="{ item }">
          <v-chip v-if="item.delivery_area" size="x-small" variant="tonal">{{ item.delivery_area }}</v-chip>
          <span v-else class="muted text-body-2">—</span>
        </template>

        <template #item.total_amount="{ item }">
          <span class="font-weight-bold">{{ formatCurrency(item.total_amount) }}</span>
        </template>

        <template #item.payment_status="{ item }">
          <v-chip
            v-if="item.payment_status === 'paid'"
            size="small"
            color="success"
            variant="tonal"
          >
            Paid<template v-if="item.payment_method"> · {{ methodLabels[item.payment_method] }}</template>
          </v-chip>
          <v-menu v-else>
            <template #activator="{ props }">
              <v-btn v-bind="props" size="x-small" color="warning" variant="tonal" prepend-icon="mdi-cash-check" :disabled="saving">
                Mark paid
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item
                v-for="m in methodItems"
                :key="m.value"
                :title="m.title"
                @click="markPaid(item.id, m.value)"
              />
            </v-list>
          </v-menu>
        </template>

        <template #item.status="{ item }">
          <div class="d-flex align-center ga-1 flex-wrap">
            <v-chip size="x-small" color="success" variant="tonal">Delivered</v-chip>
            <v-btn size="x-small" variant="text" color="secondary" :disabled="saving" @click="handleReopen(item.id)">
              Reopen
            </v-btn>
          </div>
        </template>

        <template #item.actions="{ item }">
          <v-menu>
            <template #activator="{ props }">
              <v-btn v-bind="props" icon="mdi-dots-vertical" size="x-small" variant="text" />
            </template>
            <v-list density="compact">
              <v-list-item
                prepend-icon="mdi-pencil"
                title="Edit order"
                @click="router.push(`/orders/${item.id}/edit`)"
              />
              <v-list-item
                prepend-icon="mdi-refresh"
                title="Reopen order"
                :disabled="saving"
                @click="handleReopen(item.id)"
              />
            </v-list>
          </v-menu>
        </template>

        <template #no-data>
          <div class="pa-4 muted text-center">No finished deliveries in this date range.</div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Product sales table -->
    <v-card class="list-card">
      <div class="section-title pa-4 pb-2">Product sales</div>
      <v-data-table
        :headers="productHeaders"
        :items="productRows"
        :loading="loading"
        density="comfortable"
        item-value="name"
        hide-default-footer
      >
        <template #item.subtotal="{ item }">
          <span class="font-weight-bold">{{ formatCurrency(item.subtotal) }}</span>
        </template>

        <template #no-data>
          <div class="pa-4 muted text-center">No sales in this date range.</div>
        </template>
      </v-data-table>
    </v-card>
  </main>
</template>
