<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import DeliveryMap from '../components/DeliveryMap.vue';
import { buildOrderSummary, formatCurrency, whatsappUrl } from '../lib/format';
import { isMapsConfigured, optimizeRoute } from '../lib/maps';
import { googleMapsDirectionsUrl, nearestNeighborOrder, type GeoPoint, type RouteStop } from '../lib/route';
import { fetchActiveDeliveries, updateOrderStatus, updateOrderTrackPoint } from '../services/orders';
import type { Order, OrderStatus } from '../types/models';

const orders = ref<Order[]>([]);
const loading = ref(true);
const error = ref('');

const areaFilter = ref<string | null>(null);
const start = ref<GeoPoint | null>(null);
const locating = ref(false);
const optimizing = ref(false);
const orderedStops = ref<RouteStop[] | null>(null);
const directions = ref<google.maps.DirectionsResult | null>(null);
const notice = ref('');

const ordersById = computed(() => new Map(orders.value.map((o) => [o.id, o])));

const areas = computed(() => {
  const set = new Set<string>();
  orders.value.forEach((o) => o.delivery_area && set.add(o.delivery_area));
  return [...set].sort();
});

const inArea = (o: Order) => !areaFilter.value || o.delivery_area === areaFilter.value;

const withCoords = computed<RouteStop[]>(() =>
  orders.value
    .filter((o) => inArea(o) && o.latitude !== null && o.longitude !== null)
    .map((o) => ({ id: o.id, lat: o.latitude as number, lng: o.longitude as number, label: o.customer?.name ?? 'Customer' }))
);

const missingCoordsCount = computed(() => orders.value.filter((o) => inArea(o) && o.latitude === null).length);

/** Stops in display order — optimized if available, otherwise raw. */
const displayStops = computed<RouteStop[]>(() => {
  if (orderedStops.value) {
    const ids = new Set(withCoords.value.map((s) => s.id));
    return orderedStops.value.filter((s) => ids.has(s.id));
  }
  return withCoords.value;
});

const routeUrl = computed(() => googleMapsDirectionsUrl(start.value, displayStops.value));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    orders.value = await fetchActiveDeliveries();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load deliveries.';
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
      notice.value = 'Using offline ordering (map key not set).';
    }
  } catch (err) {
    // Fall back to the free heuristic if the Directions call fails.
    orderedStops.value = nearestNeighborOrder(origin, stops);
    directions.value = null;
    notice.value = `Route service unavailable — used offline ordering. (${err instanceof Error ? err.message : 'error'})`;
  } finally {
    optimizing.value = false;
  }
}

async function setStatus(id: string, status: OrderStatus) {
  await updateOrderStatus(id, status);
  if (status === 'delivering') void captureTrack(id, 'start');
  if (status === 'delivered') void captureTrack(id, 'delivered');
  await load();
}

function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 30000 }
    );
  });
}

async function captureTrack(id: string, kind: 'start' | 'delivered') {
  const pos = await currentPosition();
  if (!pos) return;
  try {
    await updateOrderTrackPoint(id, kind, pos.lat, pos.lng);
  } catch {
    // mileage falls back to the customer location
  }
}

function navigateUrl(stop: RouteStop): string {
  return googleMapsDirectionsUrl(start.value, [stop]);
}

function whatsapp(stop: RouteStop): string {
  const order = ordersById.value.get(stop.id);
  return order ? whatsappUrl(order.customer?.phone, buildOrderSummary(order)) : '';
}

async function copyCoords(stop: RouteStop) {
  await navigator.clipboard.writeText(`${stop.lat},${stop.lng}`);
}

// Reset optimization when the underlying set or area changes.
watch([areaFilter, () => orders.value.length], () => {
  orderedStops.value = null;
  directions.value = null;
});

onMounted(load);
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="eyebrow">Active route</div>
        <h1 class="title">Deliveries</h1>
      </div>
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <div v-if="!loading" class="stack">
      <div v-if="areas.length" class="d-flex ga-2 flex-wrap">
        <v-chip :variant="areaFilter === null ? 'flat' : 'tonal'" color="primary" @click="areaFilter = null">All</v-chip>
        <v-chip
          v-for="area in areas"
          :key="area"
          :variant="areaFilter === area ? 'flat' : 'tonal'"
          color="primary"
          @click="areaFilter = area"
        >
          {{ area }}
        </v-chip>
      </div>

      <v-card v-if="withCoords.length" class="list-card" style="height: 340px; padding: 0">
        <DeliveryMap :stops="displayStops" :start="start" :directions="directions" />
      </v-card>

      <v-alert v-if="missingCoordsCount" type="info" variant="tonal" density="compact">
        {{ missingCoordsCount }} order(s) have no location yet — open the Orders page and tap "Set location" on each to map them.
      </v-alert>

      <div class="grid cols-2">
        <v-btn variant="tonal" color="secondary" prepend-icon="mdi-crosshairs-gps" :loading="locating" @click="useMyLocation">
          {{ start ? 'Update start' : 'Use my location' }}
        </v-btn>
        <v-btn
          color="primary"
          prepend-icon="mdi-routes"
          :loading="optimizing"
          :disabled="withCoords.length < 2"
          @click="optimize"
        >
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
            <div class="font-weight-bold">{{ formatCurrency(ordersById.get(stop.id)?.total_amount ?? 0) }}</div>
          </div>

          <div class="d-flex ga-2 mt-3 flex-wrap">
            <v-btn :href="navigateUrl(stop)" target="_blank" rel="noopener" size="small" color="primary" variant="tonal" prepend-icon="mdi-navigation">
              Navigate
            </v-btn>
            <v-btn :disabled="!whatsapp(stop)" :href="whatsapp(stop) || undefined" target="_blank" rel="noopener" size="small" variant="text" prepend-icon="mdi-whatsapp">
              WhatsApp
            </v-btn>
            <v-btn size="small" variant="text" prepend-icon="mdi-content-copy" @click="copyCoords(stop)">Copy</v-btn>
            <v-spacer />
            <v-btn
              v-if="ordersById.get(stop.id)?.status !== 'delivering'"
              size="small"
              variant="text"
              color="secondary"
              @click="setStatus(stop.id, 'delivering')"
            >
              Start
            </v-btn>
            <v-btn size="small" color="success" variant="tonal" prepend-icon="mdi-check-circle" @click="setStatus(stop.id, 'delivered')">
              Delivered
            </v-btn>
          </div>
        </v-card>
      </div>

      <v-card v-else class="list-card pa-6 text-center">
        <v-icon icon="mdi-truck-check-outline" size="36" class="mb-2 muted" />
        <div class="section-title">No active deliveries</div>
        <div class="muted text-body-2">Preparing and delivering orders show here.</div>
      </v-card>
    </div>
  </main>
</template>
