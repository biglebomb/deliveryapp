<script setup lang="ts">
import { onMounted, ref } from 'vue';
import EmptyState from '../components/EmptyState.vue';
import OrderCard from '../components/OrderCard.vue';
import { fetchOrders, updateOrderStatus, updatePaymentStatus } from '../services/orders';
import type { Order, OrderStatus, PaymentStatus } from '../types/models';

const orders = ref<Order[]>([]);
const loading = ref(true);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    orders.value = await fetchOrders();
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

async function setPayment(id: string, status: PaymentStatus) {
  await updatePaymentStatus(id, status);
  await load();
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
      <v-btn color="primary" icon="mdi-plus" to="/orders/new" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <div v-if="orders.length" class="stack">
      <OrderCard
        v-for="order in orders"
        :key="order.id"
        :order="order"
        editable
        @status="setStatus"
        @payment="setPayment"
      />
    </div>
    <EmptyState v-else-if="!loading" icon="mdi-clipboard-text-outline" title="No orders" text="Create the first order from the quick order screen." />
  </main>
</template>

