<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { formatCurrency, formatDateTime } from '../lib/format';
import { fetchOrders, reopenOrder, updatePayment } from '../services/orders';
import type { Order, PaymentMethod } from '../types/models';
import { paymentMethods } from '../types/models';

const router = useRouter();
const { smAndDown } = useDisplay();

const orders = ref<Order[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');

const from = ref(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()));
const to = ref(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()));

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
    return key >= from.value && key <= to.value;
  })
);

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

async function load() {
  loading.value = true;
  error.value = '';
  try {
    orders.value = await fetchOrders(true);
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

    <!-- Date range -->
    <v-card class="list-card pa-4 mb-4">
      <div class="grid cols-2">
        <v-text-field v-model="from" type="date" label="From" hide-details />
        <v-text-field v-model="to" type="date" label="To" hide-details />
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
