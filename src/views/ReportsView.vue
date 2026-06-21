<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { formatCurrency } from '../lib/format';
import { fetchOrders } from '../services/orders';
import type { Order } from '../types/models';

const orders = ref<Order[]>([]);
const loading = ref(true);
const error = ref('');
const from = ref(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()));
const to = ref(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()));

const filtered = computed(() =>
  orders.value.filter((order) => {
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(order.order_date));
    return key >= from.value && key <= to.value;
  })
);

const totalSales = computed(() => filtered.value.reduce((sum, order) => sum + Number(order.total_amount), 0));
const paidSales = computed(() =>
  filtered.value.filter((order) => order.payment_status === 'paid').reduce((sum, order) => sum + Number(order.total_amount), 0)
);
const unpaidSales = computed(() => totalSales.value - paidSales.value);
const deliveredCount = computed(() => filtered.value.filter((order) => order.status === 'delivered').length);
const productRows = computed(() => {
  const rows = new Map<string, { name: string; quantity: number; subtotal: number }>();
  for (const order of filtered.value) {
    for (const item of order.order_items ?? []) {
      const existing = rows.get(item.product_name_snapshot) ?? { name: item.product_name_snapshot, quantity: 0, subtotal: 0 };
      existing.quantity += item.quantity;
      existing.subtotal += Number(item.subtotal);
      rows.set(item.product_name_snapshot, existing);
    }
  }
  return Array.from(rows.values()).sort((a, b) => b.subtotal - a.subtotal);
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    orders.value = await fetchOrders();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load reports.';
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
        <div class="eyebrow">Sales recap</div>
        <h1 class="title">Reports</h1>
      </div>
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <v-card class="list-card pa-4 mb-4">
      <div class="grid cols-2">
        <v-text-field v-model="from" type="date" label="From" />
        <v-text-field v-model="to" type="date" label="To" />
      </div>
    </v-card>

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
        <div class="metric-value">{{ deliveredCount }}</div>
      </v-card>
    </div>

    <v-card class="list-card pa-4">
      <div class="section-title mb-3">Product sales</div>
      <div v-if="productRows.length" class="stack">
        <div v-for="row in productRows" :key="row.name" class="d-flex justify-space-between ga-3">
          <div>
            <div class="font-weight-bold">{{ row.name }}</div>
            <div class="muted text-body-2">{{ row.quantity }} sold</div>
          </div>
          <div class="font-weight-bold">{{ formatCurrency(row.subtotal) }}</div>
        </div>
      </div>
      <div v-else class="muted">No sales in this date range.</div>
    </v-card>
  </main>
</template>

