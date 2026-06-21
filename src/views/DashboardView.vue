<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { formatCurrency } from '../lib/format';
import { fetchOrders } from '../services/orders';
import type { Order } from '../types/models';

const orders = ref<Order[]>([]);
const loading = ref(true);
const error = ref('');

const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const todayOrders = computed(() =>
  orders.value.filter((order) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(order.order_date)) === todayKey)
);
const todaySales = computed(() => todayOrders.value.reduce((total, order) => total + Number(order.total_amount), 0));
const activeCount = computed(() => orders.value.filter((order) => ['pending', 'preparing', 'delivering'].includes(order.status)).length);
const unpaidTotal = computed(() =>
  orders.value.filter((order) => order.payment_status === 'unpaid').reduce((total, order) => total + Number(order.total_amount), 0)
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    orders.value = await fetchOrders();
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
        <h1 class="title">Milk delivery</h1>
      </div>
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <div class="metric-grid mb-4">
      <v-card class="metric">
        <div class="muted text-body-2">Orders</div>
        <div class="metric-value">{{ todayOrders.length }}</div>
      </v-card>
      <v-card class="metric">
        <div class="muted text-body-2">Sales</div>
        <div class="metric-value">{{ formatCurrency(todaySales) }}</div>
      </v-card>
      <v-card class="metric">
        <div class="muted text-body-2">Active</div>
        <div class="metric-value">{{ activeCount }}</div>
      </v-card>
      <v-card class="metric">
        <div class="muted text-body-2">Unpaid</div>
        <div class="metric-value">{{ formatCurrency(unpaidTotal) }}</div>
      </v-card>
    </div>

  </main>
</template>
