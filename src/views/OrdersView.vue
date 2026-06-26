<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useDisplay } from 'vuetify';
import OrderCard from '../components/OrderCard.vue';
import { formatCurrency, formatDateTime } from '../lib/format';
import { assignArea } from '../lib/route';
import { fetchAreas } from '../services/areas';
import {
  archiveDeliveredOrders,
  assignDriver,
  fetchOrders,
  updateOrderLocation,
  updateOrderStatus,
  updatePayment
} from '../services/orders';
import { fetchDrivers } from '../services/profiles';
import type { Area, Order, OrderStatus, PaymentMethod, PaymentStatus, Profile } from '../types/models';

const { smAndDown } = useDisplay();

const orders = ref<Order[]>([]);
const drivers = ref<Profile[]>([]);
const areas = ref<Area[]>([]);
const loading = ref(true);
const error = ref('');
const confirmClear = ref(false);
const clearing = ref(false);
const expanded = ref<string[]>([]);

type Filter = 'active' | 'delivered' | 'cleared' | 'all';
const filter = ref<Filter>('active');
const filterOptions: { value: Filter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'all', label: 'All' }
];

const statusConfig: Record<OrderStatus, { color: string; label: string }> = {
  pending: { color: 'warning', label: 'Pending' },
  preparing: { color: 'info', label: 'Preparing' },
  delivering: { color: 'primary', label: 'Delivering' },
  delivered: { color: 'success', label: 'Delivered' },
  cancelled: { color: 'error', label: 'Cancelled' }
};

const deliveredCount = computed(() => orders.value.filter((o) => o.status === 'delivered' && o.archived_at === null).length);

const filtered = computed(() =>
  orders.value.filter((o) => {
    if (filter.value === 'all') return true;
    if (filter.value === 'cleared') return o.archived_at !== null;
    if (filter.value === 'delivered') return o.status === 'delivered' && o.archived_at === null;
    return o.archived_at === null && ['pending', 'preparing', 'delivering'].includes(o.status);
  })
);

const headers = computed(() => [
  { title: 'Date', key: 'order_date', width: '160px' },
  { title: 'Customer', key: 'customer' },
  ...(!smAndDown.value ? [{ title: 'Area', key: 'delivery_area', width: '120px', sortable: false }] : []),
  { title: 'Total', key: 'total_amount', align: 'end' as const, width: '120px' },
  { title: 'Status', key: 'status', width: '130px' },
  ...(!smAndDown.value ? [{ title: 'Payment', key: 'payment_status', width: '110px' }] : []),
  { title: '', key: 'data-table-expand' }
]);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // Include archived so the Cleared filter and back-office edits can reach them.
    [orders.value, drivers.value, areas.value] = await Promise.all([fetchOrders(true), fetchDrivers(), fetchAreas()]);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load orders.';
  } finally {
    loading.value = false;
  }
}

async function setStatus(id: string, status: OrderStatus) {
  await updateOrderStatus(id, status);
  await load();
}

async function setPayment(id: string, status: PaymentStatus, method: PaymentMethod | null) {
  await updatePayment(id, status, method);
  await load();
}

async function setDriver(id: string, driverId: string | null) {
  await assignDriver(id, driverId);
  await load();
}

async function setLocation(id: string, lat: number, lng: number) {
  const area = assignArea({ lat, lng }, areas.value);
  await updateOrderLocation(id, lat, lng, area);
  await load();
}

async function clearDelivered() {
  clearing.value = true;
  error.value = '';
  try {
    await archiveDeliveredOrders();
    confirmClear.value = false;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not clear delivered orders.';
  } finally {
    clearing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="eyebrow">All orders</div>
        <h1 class="title">Orders</h1>
      </div>
      <div class="d-flex ga-2">
        <v-btn
          v-if="deliveredCount"
          variant="tonal"
          color="secondary"
          prepend-icon="mdi-broom"
          @click="confirmClear = true"
        >
          Clear delivered ({{ deliveredCount }})
        </v-btn>
        <v-btn color="primary" icon="mdi-plus" to="/orders/new" />
      </div>
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <div class="d-flex ga-2 flex-wrap mb-3">
      <v-chip
        v-for="opt in filterOptions"
        :key="opt.value"
        :variant="filter === opt.value ? 'flat' : 'tonal'"
        color="primary"
        @click="filter = opt.value"
      >
        {{ opt.label }}
      </v-chip>
    </div>

    <v-card class="list-card">
      <v-data-table
        v-model:expanded="expanded"
        :headers="headers"
        :items="filtered"
        :loading="loading"
        item-value="id"
        density="comfortable"
        show-expand
        hover
        :sort-by="[{ key: 'order_date', order: 'desc' }]"
      >
        <template #item.order_date="{ item }">
          <span class="text-body-2">{{ formatDateTime(item.order_date) }}</span>
        </template>
        <template #item.customer="{ item }">
          <span class="font-weight-bold">{{ item.customer?.name ?? 'Customer' }}</span>
        </template>
        <template #item.delivery_area="{ item }">
          <v-chip v-if="item.delivery_area" size="x-small" variant="tonal">{{ item.delivery_area }}</v-chip>
          <span v-else class="muted text-body-2">—</span>
        </template>
        <template #item.total_amount="{ item }">
          <span class="font-weight-bold">{{ formatCurrency(item.total_amount) }}</span>
        </template>
        <template #item.status="{ item }">
          <div class="d-flex align-center ga-1">
            <v-chip size="x-small" :color="statusConfig[item.status].color" variant="tonal">
              {{ statusConfig[item.status].label }}
            </v-chip>
            <v-chip v-if="item.archived_at" size="x-small" variant="tonal" color="secondary">Cleared</v-chip>
          </div>
        </template>
        <template #item.payment_status="{ item }">
          <v-chip size="x-small" :color="item.payment_status === 'paid' ? 'success' : 'warning'" variant="tonal">
            {{ item.payment_status === 'paid' ? 'Paid' : 'Unpaid' }}
          </v-chip>
        </template>

        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length" class="pa-3">
              <OrderCard
                :order="item"
                editable
                :drivers="drivers"
                @status="setStatus"
                @payment="setPayment"
                @assign="setDriver"
                @location="setLocation"
              />
            </td>
          </tr>
        </template>

        <template #no-data>
          <div class="pa-6 text-center muted">No orders in this view.</div>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="confirmClear" max-width="420">
      <v-card class="pa-4">
        <div class="section-title mb-2">Clear delivered orders?</div>
        <div class="muted text-body-2 mb-4">
          {{ deliveredCount }} delivered order(s) will be cleared from the active list. They stay in
          Reports and under the Cleared filter, so your history is kept.
        </div>
        <div class="d-flex ga-2 justify-end">
          <v-btn variant="text" :disabled="clearing" @click="confirmClear = false">Cancel</v-btn>
          <v-btn color="secondary" :loading="clearing" prepend-icon="mdi-broom" @click="clearDelivered">
            Clear delivered
          </v-btn>
        </div>
      </v-card>
    </v-dialog>
  </main>
</template>
