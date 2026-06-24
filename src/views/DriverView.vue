<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import DeliveryMap from '../components/DeliveryMap.vue';
import SwipeToComplete from '../components/SwipeToComplete.vue';
import { useAuth } from '../composables/useAuth';
import { buildOrderSummary, formatCurrency, whatsappUrl } from '../lib/format';
import { isMapsConfigured, optimizeRoute } from '../lib/maps';
import { googleMapsDirectionsUrl, haversine, nearestNeighborOrder, type RouteStop } from '../lib/route';
import { fetchMyDeliveries, updateOrderStatus, updatePayment } from '../services/orders';
import type { Order, OrderStatus, PaymentMethod } from '../types/models';
import { paymentMethods } from '../types/models';

const auth = useAuth();
const router = useRouter();

const orders = ref<Order[]>([]);
const loading = ref(true);
const error = ref('');
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
// Delivered orders stay in the list (shown as done) but are excluded from the map,
// route, and optimize so navigation only ever covers what's left.
const activeOrders = computed(() => orders.value.filter((o) => o.status !== 'delivered'));
const doneOrders = computed(() => orders.value.filter((o) => o.status === 'delivered'));
const withCoords = computed<RouteStop[]>(() =>
  activeOrders.value
    .filter((o) => o.latitude !== null && o.longitude !== null)
    .map((o) => ({ id: o.id, lat: o.latitude as number, lng: o.longitude as number, label: o.customer?.name ?? 'Customer' }))
);
const missingCoordsCount = computed(() => activeOrders.value.filter((o) => o.latitude === null).length);

function itemsLine(order: Order): string {
  return (order.order_items ?? []).map((i) => `${i.quantity}× ${i.product_name_snapshot}`).join(', ');
}

// Optimizing only helps with 3+ stops that are actually spread out — for 1–2, or a
// tight cluster, the driver already knows the order.
const canOptimize = computed(() => {
  const stops = withCoords.value;
  if (stops.length < 3) return false;
  let maxKm = 0;
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      maxKm = Math.max(maxKm, haversine(stops[i], stops[j]));
    }
  }
  return maxKm > 0.4;
});

const displayStops = computed<RouteStop[]>(() => {
  if (orderedStops.value) {
    const ids = new Set(withCoords.value.map((s) => s.id));
    return orderedStops.value.filter((s) => ids.has(s.id));
  }
  return withCoords.value;
});
const routeUrl = computed(() => googleMapsDirectionsUrl(null, displayStops.value));

/** Indonesian greeting word for the current Jakarta time of day. */
function timeOfDay(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hourCycle: 'h23' }).format(new Date())
  );
  if (hour < 11) return 'Pagi';
  if (hour < 15) return 'Siang';
  if (hour < 18) return 'Sore';
  return 'Malam';
}

const waTemplates = computed(() => [
  { title: 'Otw — mohon ditunggu', text: `${timeOfDay()} ka. Deliv susu. Saya otw lokasi, mohon ditunggu 🙏` },
  { title: 'Otw — minta patokan', text: `${timeOfDay()} ka. Deliv susu. Saya otw lokasi. Ada patokan pasnya?` }
]);

function waLink(stop: RouteStop, message: string): string {
  const order = ordersById.value.get(stop.id);
  return order ? whatsappUrl(order.customer?.phone, message) : '';
}
function waSummary(stop: RouteStop): string {
  const order = ordersById.value.get(stop.id);
  return order ? whatsappUrl(order.customer?.phone, buildOrderSummary(order)) : '';
}
function hasPhone(stop: RouteStop): boolean {
  return !!ordersById.value.get(stop.id)?.customer?.phone;
}

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

async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 30000 }
    );
  });
}

async function optimize() {
  const stops = withCoords.value;
  if (stops.length < 2) return;
  optimizing.value = true;
  notice.value = '';

  const gps = await currentPosition();
  const origin = gps ?? stops[0];
  if (!gps) notice.value = 'Lokasi saat ini tidak tersedia — mulai dari stop pertama.';

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
  // Update locally instead of refetching, so the map isn't re-rendered. Delivered
  // orders stay in the list (rendered as done) and just drop out of the map/route
  // via the activeOrders filter.
  const order = ordersById.value.get(id);
  if (order) {
    order.status = status;
    if (status === 'delivered') order.delivered_at = new Date().toISOString();
  }
}

async function markPaid(id: string) {
  const method = methodChoice[id];
  if (!method) return;
  await updatePayment(id, 'paid', method);
  // Update locally so the swipe unlocks without reloading (and re-rendering) the map.
  const order = ordersById.value.get(id);
  if (order) {
    order.payment_status = 'paid';
    order.payment_method = method;
    order.paid_at = new Date().toISOString();
  }
}

function navigateUrl(stop: RouteStop): string {
  return googleMapsDirectionsUrl(null, [stop]);
}

function blockedDeliver() {
  notice.value = 'Tandai pembayaran lunas dulu sebelum menyelesaikan pengiriman.';
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
        <DeliveryMap :stops="displayStops" :directions="directions" />
      </v-card>

      <v-alert v-if="missingCoordsCount" type="info" variant="tonal" density="compact">
        {{ missingCoordsCount }} delivery(ies) have no location set.
      </v-alert>

      <v-btn
        v-if="canOptimize"
        color="primary"
        prepend-icon="mdi-routes"
        :loading="optimizing"
        block
        @click="optimize"
      >
        Optimize route
      </v-btn>

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
        <SwipeToComplete
          v-for="(stop, index) in displayStops"
          :key="stop.id"
          :disabled="ordersById.get(stop.id)?.payment_status !== 'paid'"
          label="Selesai"
          locked-label="Lunasi dulu"
          @complete="setStatus(stop.id, 'delivered')"
          @blocked="blockedDeliver"
        >
          <v-card class="list-card pa-4">
            <div class="d-flex align-center ga-3">
              <v-avatar color="primary" size="32"><span class="font-weight-bold">{{ index + 1 }}</span></v-avatar>
              <div class="flex-grow-1">
                <div class="section-title">{{ stop.label }}</div>
                <div class="d-flex align-center ga-2 flex-wrap mt-1">
                  <v-chip v-if="ordersById.get(stop.id)?.delivery_area" size="x-small" color="primary" variant="tonal">
                    <v-icon icon="mdi-map-marker-radius" size="12" start />
                    {{ ordersById.get(stop.id)?.delivery_area }}
                  </v-chip>
                  <span class="muted text-body-2">{{ ordersById.get(stop.id)?.customer?.address || `${stop.lat}, ${stop.lng}` }}</span>
                </div>
              </div>
              <div class="text-right">
                <div class="font-weight-bold">{{ formatCurrency(ordersById.get(stop.id)?.total_amount ?? 0) }}</div>
                <v-chip size="x-small" :color="ordersById.get(stop.id)?.payment_status === 'paid' ? 'success' : 'warning'" class="mt-1">
                  {{ ordersById.get(stop.id)?.payment_status }}
                </v-chip>
              </div>
            </div>

            <div v-if="ordersById.get(stop.id)?.order_items?.length" class="mt-3 stack">
              <div v-for="item in ordersById.get(stop.id)!.order_items" :key="item.id" class="d-flex justify-space-between text-body-2">
                <span>
                  {{ item.quantity }}× {{ item.product_name_snapshot }}
                  <span v-if="item.packaging_name_snapshot" class="muted"> · {{ item.packaging_name_snapshot }}</span>
                </span>
                <span class="font-weight-medium">{{ formatCurrency(item.subtotal) }}</span>
              </div>
              <div v-if="ordersById.get(stop.id)?.delivery_notes" class="muted text-body-2">
                {{ ordersById.get(stop.id)?.delivery_notes }}
              </div>
            </div>

            <div class="d-flex ga-2 mt-3 flex-wrap">
              <v-btn :href="navigateUrl(stop)" target="_blank" rel="noopener" size="small" color="primary" variant="tonal" prepend-icon="mdi-navigation">Navigate</v-btn>
              <v-menu>
                <template #activator="{ props }">
                  <v-btn v-bind="props" :disabled="!hasPhone(stop)" size="small" variant="text" prepend-icon="mdi-whatsapp" append-icon="mdi-menu-down">WhatsApp</v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item
                    v-for="tpl in waTemplates"
                    :key="tpl.title"
                    :href="waLink(stop, tpl.text)"
                    target="_blank"
                    rel="noopener"
                    :title="tpl.title"
                    :subtitle="tpl.text"
                  />
                  <v-divider />
                  <v-list-item :href="waSummary(stop)" target="_blank" rel="noopener" title="Ringkasan pesanan" />
                </v-list>
              </v-menu>
              <v-btn v-if="ordersById.get(stop.id)?.status !== 'delivering'" size="small" variant="text" color="secondary" @click="setStatus(stop.id, 'delivering')">Start</v-btn>
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
              <v-btn size="small" color="success" prepend-icon="mdi-cash-check" :disabled="!methodChoice[stop.id]" @click="markPaid(stop.id)">Mark paid</v-btn>
            </div>
            <div v-else class="d-flex align-center justify-space-between mt-3">
              <span class="muted text-body-2">
                Paid<template v-if="ordersById.get(stop.id)?.payment_method"> · {{ methodLabels[ordersById.get(stop.id)!.payment_method!] }}</template>
              </span>
              <span class="muted text-body-2"><v-icon icon="mdi-gesture-swipe-right" size="16" /> Geser untuk selesai</span>
            </div>
          </v-card>
        </SwipeToComplete>
      </div>

      <!-- Completed today: visible but de-emphasized and unactionable -->
      <div v-if="doneOrders.length" class="stack">
        <div class="muted text-body-2 mt-2">Selesai hari ini · {{ doneOrders.length }}</div>
        <v-card v-for="order in doneOrders" :key="order.id" class="list-card pa-3" style="opacity: 0.55">
          <div class="d-flex align-center ga-3">
            <v-icon icon="mdi-check-circle" color="success" />
            <div class="flex-grow-1" style="min-width: 0">
              <div class="font-weight-medium" style="text-decoration: line-through">{{ order.customer?.name ?? 'Customer' }}</div>
              <div class="muted text-body-2" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ itemsLine(order) }}</div>
            </div>
            <div class="font-weight-bold flex-shrink-0">{{ formatCurrency(order.total_amount) }}</div>
          </div>
        </v-card>
      </div>

      <v-card v-if="!displayStops.length && !doneOrders.length" class="list-card pa-6 text-center">
        <v-icon icon="mdi-truck-check-outline" size="36" class="mb-2 muted" />
        <div class="section-title">No deliveries assigned</div>
        <div class="muted text-body-2">Orders the admin assigns to you will show here.</div>
      </v-card>
    </div>
  </main>
</template>
