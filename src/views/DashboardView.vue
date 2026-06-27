<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatCurrency } from '../lib/format';
import { fetchOrders, updateOrderStatus } from '../services/orders';
import { fetchSubscriptions, generateTodaysSubscriptionOrders } from '../services/subscriptions';
import type { Order, OrderStatus, Subscription } from '../types/models';

const router = useRouter();
const orders = ref<Order[]>([]);
const subscriptions = ref<Subscription[]>([]);
const loading = ref(true);
const error = ref('');
const generatedNotice = ref('');

const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' });
const today = todayKey.format(new Date());

function isToday(timestamp: string | null): boolean {
  return timestamp !== null && todayKey.format(new Date(timestamp)) === today;
}

// Orders delivered today — revenue is recognized on the delivery day, not when
// the order was created.
const deliveredToday = computed(() => orders.value.filter((o) => isToday(o.delivered_at)));
const todaySales = computed(() => deliveredToday.value.reduce((s, o) => s + Number(o.total_amount), 0));

// Orders out for delivery right now. Pending/preparing aren't part of the
// dashboard's delivery picture — they live in Orders until dispatched.
const toDeliver = computed(() => orders.value.filter((o) => o.status === 'delivering'));

// Dashboard list = today's delivery picture: orders out for delivery plus those
// delivered today. Pending/preparing aren't shown here — they live in Orders.
const todayOrders = computed(() => {
  const rank = (o: Order) => (o.status === 'delivered' ? 1 : 0);
  return [...toDeliver.value, ...deliveredToday.value].sort((a, b) => rank(a) - rank(b));
});

// Unpaid money among orders in the delivery picture (out for delivery or
// delivered) — pending/preparing aren't owed yet.
const unpaidTotal = computed(() =>
  orders.value
    .filter((o) => o.payment_status === 'unpaid' && ['delivering', 'delivered'].includes(o.status))
    .reduce((s, o) => s + Number(o.total_amount), 0)
);

// Active subscriptions down to their last few prepaid deliveries — nudge to renew.
const lowSubscriptions = computed(() =>
  subscriptions.value.filter((s) => s.status === 'active' && s.deliveries_total - s.deliveries_used <= 3)
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
  order.delivered_at = new Date().toISOString();
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // Auto-generate today's prepaid subscription orders (idempotent) before loading.
    const created = await generateTodaysSubscriptionOrders();
    if (created > 0) generatedNotice.value = `${created} subscription order${created > 1 ? 's' : ''} generated for today.`;
    [orders.value, subscriptions.value] = await Promise.all([fetchOrders(true), fetchSubscriptions()]);
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
    <v-alert
      v-if="generatedNotice"
      type="success"
      variant="tonal"
      class="mb-4"
      closable
      @click:close="generatedNotice = ''"
    >
      {{ generatedNotice }}
    </v-alert>

    <!-- Stat cards -->
    <div class="metric-grid mb-4">
      <v-card class="metric">
        <div class="muted text-body-2">To deliver</div>
        <div class="metric-value">{{ toDeliver.length }}</div>
      </v-card>
      <v-card class="metric">
        <div class="muted text-body-2">Delivered today</div>
        <div class="metric-value">{{ deliveredToday.length }}</div>
      </v-card>
      <v-card class="metric">
        <div class="muted text-body-2">Sales today</div>
        <div class="metric-value">{{ formatCurrency(todaySales) }}</div>
      </v-card>
      <v-card class="metric">
        <div class="muted text-body-2">Unpaid total</div>
        <div class="metric-value">{{ formatCurrency(unpaidTotal) }}</div>
      </v-card>
    </div>

    <!-- Subscription low-balance nudge -->
    <v-card
      v-if="lowSubscriptions.length > 0"
      class="mb-4 pa-4 d-flex align-center justify-space-between"
      color="error"
      variant="tonal"
      style="cursor: pointer"
      @click="router.push('/subscriptions')"
    >
      <div class="d-flex align-center ga-3">
        <v-icon icon="mdi-calendar-alert" size="24" />
        <div>
          <div class="font-weight-bold">
            {{ lowSubscriptions.length }} subscription{{ lowSubscriptions.length > 1 ? 's' : '' }} running low
          </div>
          <div class="text-body-2">
            {{ lowSubscriptions.map((s) => `${s.customer?.name ?? 'Customer'} (${s.deliveries_total - s.deliveries_used} left)`).join(', ') }}
          </div>
        </div>
      </div>
      <v-icon icon="mdi-chevron-right" />
    </v-card>

    <!-- Today's order list: still to deliver + delivered today -->
    <div class="section-title mb-2">Today's deliveries</div>
    <v-card class="list-card">
      <div v-if="loading" class="pa-6 text-center muted">Loading…</div>
      <div v-else-if="todayOrders.length === 0" class="pa-6 text-center muted">Nothing to deliver and nothing delivered yet today.</div>
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
