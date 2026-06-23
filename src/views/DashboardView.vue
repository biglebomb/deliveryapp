<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatCurrency } from '../lib/format';
import { countPendingInbox } from '../services/inbox';
import { fetchOrders, updateOrderStatus } from '../services/orders';
import type { Order, OrderStatus } from '../types/models';

const router = useRouter();
const orders = ref<Order[]>([]);
const loading = ref(true);
const error = ref('');
const pendingInbox = ref(0);

const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

const todayOrders = computed(() =>
  orders.value.filter(
    (o) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(o.order_date)) === todayKey &&
      o.status !== 'cancelled'
  )
);

const todaySales = computed(() => todayOrders.value.reduce((s, o) => s + Number(o.total_amount), 0));

const activeOrders = computed(() =>
  orders.value.filter((o) => ['pending', 'preparing', 'delivering'].includes(o.status))
);

const unpaidTotal = computed(() =>
  orders.value.filter((o) => o.payment_status === 'unpaid').reduce((s, o) => s + Number(o.total_amount), 0)
);

const statusConfig: Record<OrderStatus, { color: string; label: string }> = {
  pending: { color: 'warning', label: 'Pending' },
  preparing: { color: 'info', label: 'Preparing' },
  delivering: { color: 'primary', label: 'Delivering' },
  delivered: { color: 'success', label: 'Delivered' },
  cancelled: { color: 'error', label: 'Cancelled' },
};

function itemsSummary(order: Order): string {
  if (!order.order_items?.length) return '—';
  return order.order_items.map((i) => `${i.quantity}× ${i.product_name_snapshot}`).join(', ');
}

async function markDelivered(order: Order) {
  await updateOrderStatus(order.id, 'delivered');
  order.status = 'delivered';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    [orders.value, pendingInbox.value] = await Promise.all([fetchOrders(), countPendingInbox()]);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load dashboard.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="eyebrow">Today</div>
        <h1 class="title">Dashboard</h1>
      </div>
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <!-- Stat cards -->
    <div class="metric-grid mb-4">
      <v-card class="metric">
        <div class="muted text-body-2">Today's orders</div>
        <div class="metric-value">{{ todayOrders.length }}</div>
      </v-card>
      <v-card class="metric">
        <div class="muted text-body-2">Today's sales</div>
        <div class="metric-value">{{ formatCurrency(todaySales) }}</div>
      </v-card>
      <v-card class="metric">
        <div class="muted text-body-2">Active</div>
        <div class="metric-value">{{ activeOrders.length }}</div>
      </v-card>
      <v-card class="metric">
        <div class="muted text-body-2">Unpaid total</div>
        <div class="metric-value">{{ formatCurrency(unpaidTotal) }}</div>
      </v-card>
    </div>

    <!-- Inbox pending banner -->
    <v-card
      v-if="pendingInbox > 0"
      class="mb-4 pa-4 d-flex align-center justify-space-between"
      color="warning"
      variant="tonal"
      style="cursor: pointer"
      @click="router.push('/inbox')"
    >
      <div class="d-flex align-center ga-3">
        <v-icon icon="mdi-inbox-arrow-down" size="24" />
        <div>
          <div class="font-weight-bold">{{ pendingInbox }} order{{ pendingInbox > 1 ? 's' : '' }} waiting in inbox</div>
          <div class="text-body-2">Tap to review and confirm</div>
        </div>
      </div>
      <v-icon icon="mdi-chevron-right" />
    </v-card>

    <!-- Today's order list -->
    <div class="section-title mb-2">Today's orders</div>
    <v-card class="list-card">
      <div v-if="loading" class="pa-6 text-center muted">Loading…</div>
      <div v-else-if="todayOrders.length === 0" class="pa-6 text-center muted">No orders for today yet.</div>
      <div v-else>
        <div
          v-for="(order, i) in todayOrders"
          :key="order.id"
          class="pa-4"
          :style="i < todayOrders.length - 1 ? 'border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))' : ''"
        >
          <div class="d-flex align-start justify-space-between ga-3">
            <div style="min-width: 0; flex: 1">
              <div class="font-weight-bold">{{ order.customer?.name ?? 'Customer' }}</div>
              <div class="muted text-body-2 mt-1" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">
                {{ itemsSummary(order) }}
              </div>
              <div class="d-flex align-center ga-2 mt-2 flex-wrap">
                <v-chip size="x-small" :color="statusConfig[order.status].color" variant="tonal">
                  {{ statusConfig[order.status].label }}
                </v-chip>
                <v-chip
                  size="x-small"
                  :color="order.payment_status === 'paid' ? 'success' : 'warning'"
                  variant="tonal"
                >
                  {{ order.payment_status === 'paid' ? 'Paid' : 'Unpaid' }}
                </v-chip>
                <span v-if="order.delivery_area" class="muted text-body-2">{{ order.delivery_area }}</span>
              </div>
            </div>
            <div class="d-flex flex-column align-end ga-1 flex-shrink-0">
              <span class="font-weight-bold">{{ formatCurrency(order.total_amount) }}</span>
              <v-btn
                v-if="order.status === 'delivering'"
                size="x-small"
                color="success"
                variant="tonal"
                prepend-icon="mdi-check"
                @click.stop="markDelivered(order)"
              >
                Delivered
              </v-btn>
              <v-btn
                size="x-small"
                variant="text"
                prepend-icon="mdi-arrow-right"
                @click="router.push('/orders')"
              >
                View
              </v-btn>
            </div>
          </div>
        </div>
      </div>
    </v-card>
  </main>
</template>
