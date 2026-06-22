<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import EmptyState from '../components/EmptyState.vue';
import OrderCard from '../components/OrderCard.vue';
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

const orders = ref<Order[]>([]);
const drivers = ref<Profile[]>([]);
const areas = ref<Area[]>([]);
const loading = ref(true);
const error = ref('');
const confirmClear = ref(false);
const clearing = ref(false);

const deliveredCount = computed(() => orders.value.filter((o) => o.status === 'delivered').length);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [orderRows, driverRows, areaRows] = await Promise.all([fetchOrders(), fetchDrivers(), fetchAreas()]);
    orders.value = orderRows;
    drivers.value = driverRows;
    areas.value = areaRows;
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
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <div v-if="orders.length" class="stack">
      <OrderCard
        v-for="order in orders"
        :key="order.id"
        :order="order"
        editable
        :drivers="drivers"
        @status="setStatus"
        @payment="setPayment"
        @assign="setDriver"
        @location="setLocation"
      />
    </div>
    <EmptyState v-else-if="!loading" icon="mdi-clipboard-text-outline" title="No orders" text="Create the first order from the quick order screen." />

    <v-dialog v-model="confirmClear" max-width="420">
      <v-card class="pa-4">
        <div class="section-title mb-2">Clear delivered orders?</div>
        <div class="muted text-body-2 mb-4">
          {{ deliveredCount }} delivered order(s) will be cleared from this list. They stay in
          Reports, so your sales history is kept.
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

