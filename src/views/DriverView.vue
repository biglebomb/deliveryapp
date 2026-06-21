<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import DeliveryMap from '../components/DeliveryMap.vue';
import { useAuth } from '../composables/useAuth';
import { buildOrderSummary, formatCurrency, whatsappUrl } from '../lib/format';
import { isMapsConfigured, optimizeRoute } from '../lib/maps';
import { googleMapsDirectionsUrl, nearestNeighborOrder, type GeoPoint, type RouteStop } from '../lib/route';
import { fetchMyDeliveries, updateOrderStatus, updatePayment } from '../services/orders';
import type { Order, OrderStatus, PaymentMethod } from '../types/models';
import { paymentMethods } from '../types/models';

const auth = useAuth();
const router = useRouter();

const orders = ref<Order[]>([]);
const loading = ref(true);
const error = ref('');
const start = ref<GeoPoint | null>(null);
const locating = ref(false);
const optimizing = ref(false);
const orderedStops = ref<RouteStop[] | null>(null);
const directions = ref<google.maps.DirectionsResult | null>(null);
const notice = ref('');
const methodChoice = reactive<Record<string, PaymentMethod>>({});

const methodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  qris: 'QRIS',
  transfer: 'Transfer',
  other: 'Other'
};
const methodItems = paymentMethods.map((value) => ({ value, title: methodLabels[value] }));

const ordersById = computed(() => new Map(orders.value.map((o) => [o.id, o])));
const withCoords = computed<RouteStop[]>(() =>
  orders.value
    .filter((o) => o.latitude !== null && o.longitude !== null)
    .map((o) => ({ id: o.id, lat: o.latitude as number, lng: o.longitude as number, label: o.customer?.name ?? 'Customer' }))
);
const missingCoordsCount = computed(() => orders.value.filter((o) => o.latitude === null).length);
const displayStops = computed<RouteStop[]>(() => {
  if (orderedStops.value) {
    const ids = new Set(withCoords.value.map((s) => s.id));
    return orderedStops.value.filter((s) => ids.has(s.id));
  }
  return withCoords.value;
});
const routeUrl = computed(() => googleMapsDirectionsUrl(start.value, displayStops.value));

async function load() {
  const driverId = auth.session.value?.user.id;
  if (!driverId) return;
  loading.value = true;
  error.value = '';
  try {
    orders.value = await fetchMyDeliveries(driverId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load your deliveries.';
  } finally {
    loading.value = false;
  }
}

function useMyLocation() {
  if (!('geolocation' in navigator)) {
    notice.value = 'This device has no location support.';
    return;
  }
  locating.value = true;
  notice.value = '';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      start.value = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      locating.value = false;
    },
    () => {
      notice.value = 'Could not get your location.';
      locating.value = false;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function optimize() {
  const stops = withCoords.value;
  if (stops.length < 2) {
    notice.value = 'Need at least two located stops to optimize.';
    return;
  }
  const origin = start.value ?? stops[0];
  optimizing.value = true;
  notice.value = '';
  try {
    if (isMapsConfigured) {
      const result = await optimizeRoute(origin, stops);
      orderedStops.value = result.orderedStops;
      directions.value = result.directions;
    } else {
      orderedStops.value = nearestNeighborOrder(origin, stops);
      directions.value = null;
    }
  } catch (err) {
    orderedStops.value = nearestNeighborOrder(origin, stops);
    directions.value = null;
    notice.value = `Route service unavailable — used offline ordering. (${err instanceof Error ? err.message : 'error'})`;
  } finally {
    optimizing.value = false;
  }
}

async function setStatus(id: string, status: OrderStatus) {
  await updateOrderStatus(id, status);
  await load();
}

async function markPaid(id: string) {
  await updatePayment(id, 'paid', methodChoice[id] ?? 'cash');
  await load();
}

function navigateUrl(stop: RouteStop): string {
  return googleMapsDirectionsUrl(start.value, [stop]);
}

function whatsapp(stop: RouteStop): string {
  const order = ordersById.value.get(stop.id);
  return order ? whatsappUrl(order.customer?.phone, buildOrderSummary(order)) : '';
}

async function signOut() {
  await auth.signOut();
  await router.push('/login');
}

onMounted(load);
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="eyebrow">Driver</div>
        <h1 class="title">My deliveries</h1>
      </div>
      <div class="d-flex ga-1">
        <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
        <v-btn icon="mdi-logout" variant="text" @click="signOut" />
      </div>
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <div v-if="!loading" class="stack">
      <v-card v-if="withCoords.length" class="list-card" style="height: 320px; padding: 0">
        <DeliveryMap :stops="displayStops" :start="start" :directions="directions" />
      </v-card>

      <v-alert v-if="missingCoordsCount" type="info" variant="tonal" density="compact">
        {{ missingCoordsCount }} delivery(ies) have no location set.
      </v-alert>

      <div class="grid cols-2">
        <v-btn variant="tonal" color="secondary" prepend-icon="mdi-crosshairs-gps" :loading="locating" @click="useMyLocation">
          {{ start ? 'Update start' : 'Use my location' }}
        </v-btn>
        <v-btn color="primary" prepend-icon="mdi-routes" :loading="optimizing" :disabled="withCoords.length < 2" @click="optimize">
          Optimize route
        </v-btn>
      </div>

      <v-btn
        v-if="displayStops.length"
        :href="routeUrl || undefined"
        target="_blank"
        rel="noopener"
        color="success"
        variant="flat"
        prepend-icon="mdi-navigation"
        block
      >
        Open full route in Google Maps
      </v-btn>

      <div v-if="notice" class="muted text-body-2">{{ notice }}</div>

      <div v-if="displayStops.length" class="stack">
        <v-card v-for="(stop, index) in displayStops" :key="stop.id" class="list-card pa-4">
          <div class="d-flex align-center ga-3">
            <v-avatar color="primary" size="32"><span class="font-weight-bold">{{ index + 1 }}</span></v-avatar>
            <div class="flex-grow-1">
              <div class="section-title">{{ stop.label }}</div>
              <div class="muted text-body-2">{{ ordersById.get(stop.id)?.customer?.address || `${stop.lat}, ${stop.lng}` }}</div>
            </div>
            <div class="text-right">
              <div class="font-weight-bold">{{ formatCurrency(ordersById.get(stop.id)?.total_amount ?? 0) }}</div>
              <v-chip size="x-small" :color="ordersById.get(stop.id)?.payment_status === 'paid' ? 'success' : 'warning'" class="mt-1">
                {{ ordersById.get(stop.id)?.payment_status }}
              </v-chip>
            </div>
          </div>

          <div class="d-flex ga-2 mt-3 flex-wrap">
            <v-btn :href="navigateUrl(stop)" target="_blank" rel="noopener" size="small" color="primary" variant="tonal" prepend-icon="mdi-navigation">Navigate</v-btn>
            <v-btn :disabled="!whatsapp(stop)" :href="whatsapp(stop) || undefined" target="_blank" rel="noopener" size="small" variant="text" prepend-icon="mdi-whatsapp">WhatsApp</v-btn>
            <v-btn v-if="ordersById.get(stop.id)?.status !== 'delivering'" size="small" variant="text" color="secondary" @click="setStatus(stop.id, 'delivering')">Start</v-btn>
            <v-btn size="small" color="success" variant="tonal" prepend-icon="mdi-check-circle" @click="setStatus(stop.id, 'delivered')">Delivered</v-btn>
          </div>

          <div v-if="ordersById.get(stop.id)?.payment_status !== 'paid'" class="d-flex align-center ga-2 mt-3">
            <v-select
              v-model="methodChoice[stop.id]"
              :items="methodItems"
              label="Payment method"
              density="compact"
              hide-details
              style="max-width: 200px"
            />
            <v-btn size="small" color="success" prepend-icon="mdi-cash-check" @click="markPaid(stop.id)">Mark paid</v-btn>
          </div>
          <div v-else class="muted text-body-2 mt-2">
            Paid<template v-if="ordersById.get(stop.id)?.payment_method"> · {{ methodLabels[ordersById.get(stop.id)!.payment_method!] }}</template>
          </div>
        </v-card>
      </div>

      <v-card v-else class="list-card pa-6 text-center">
        <v-icon icon="mdi-truck-check-outline" size="36" class="mb-2 muted" />
        <div class="section-title">No deliveries assigned</div>
        <div class="muted text-body-2">Orders the admin assigns to you will show here.</div>
      </v-card>
    </div>
  </main>
</template>
