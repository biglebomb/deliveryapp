<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import LocationPicker from './LocationPicker.vue';
import { buildOrderSummary, formatCurrency, formatDateTime, whatsappUrl } from '../lib/format';
import { geocodeAddress } from '../lib/maps';
import { isMapsLink, resolveMapsLink } from '../services/geo';
import type { Order, OrderStatus, PaymentMethod, PaymentStatus, Profile } from '../types/models';
import { orderStatuses, paymentMethods, paymentStatuses } from '../types/models';

const props = defineProps<{
  order: Order;
  editable?: boolean;
  drivers?: Profile[];
}>();

const router = useRouter();

const emit = defineEmits<{
  status: [id: string, status: OrderStatus];
  payment: [id: string, status: PaymentStatus, method: PaymentMethod | null];
  assign: [id: string, driverId: string | null];
  location: [id: string, lat: number, lng: number];
}>();

const showLocation = ref(false);
const draftLat = ref<number | null>(null);
const draftLng = ref<number | null>(null);
const geocoding = ref(false);
const geoError = ref('');

function openLocation() {
  draftLat.value = props.order.latitude;
  draftLng.value = props.order.longitude;
  geoError.value = '';
  showLocation.value = true;
}

async function findFromAddress() {
  const address = props.order.customer?.address?.trim();
  if (!address) {
    geoError.value = 'This customer has no address to search.';
    return;
  }
  geocoding.value = true;
  geoError.value = '';
  try {
    // The address might be a Google Maps share link (resolve it) or a street address (geocode it).
    const point = isMapsLink(address) ? await resolveMapsLink(address) : await geocodeAddress(address);
    if (point) {
      draftLat.value = point.lat;
      draftLng.value = point.lng;
    } else {
      geoError.value = 'Could not find coordinates for that address/link.';
    }
  } catch (err) {
    geoError.value = err instanceof Error ? err.message : 'Lookup failed (is the Geocoding API enabled?).';
  } finally {
    geocoding.value = false;
  }
}

function saveLocation() {
  if (draftLat.value === null || draftLng.value === null) {
    geoError.value = 'Set a location first.';
    return;
  }
  emit('location', props.order.id, draftLat.value, draftLng.value);
  showLocation.value = false;
}

const methodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  qris: 'QRIS',
  transfer: 'Transfer',
  other: 'Other'
};
const methodItems = paymentMethods.map((value) => ({ value, title: methodLabels[value] }));

const summary = computed(() => buildOrderSummary(props.order));
const whatsapp = computed(() => whatsappUrl(props.order.customer?.phone, summary.value));
const driverName = computed(
  () => props.drivers?.find((d) => d.id === props.order.assigned_driver_id)?.name ?? null
);
const addressIsLink = computed(() => {
  const address = props.order.customer?.address;
  return address ? isMapsLink(address) : false;
});

async function copySummary() {
  await navigator.clipboard.writeText(summary.value);
}

function staticMapUrl(lat: number, lng: number): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=600x200&markers=${lat},${lng},red-pushpin`;
}
</script>

<template>
  <v-card class="list-card pa-4">
    <div class="d-flex align-start justify-space-between ga-3">
      <div>
        <div class="section-title">{{ order.customer?.name ?? 'Customer' }}</div>
        <div class="d-flex align-center ga-2 muted text-body-2">
          <span>{{ formatDateTime(order.order_date) }}</span>
          <v-chip v-if="order.delivery_area" size="x-small" prepend-icon="mdi-map-marker-radius">
            {{ order.delivery_area }}
          </v-chip>
        </div>
      </div>
      <div class="text-right">
        <div class="font-weight-bold">{{ formatCurrency(order.total_amount) }}</div>
        <v-chip size="small" :color="order.payment_status === 'paid' ? 'success' : 'warning'" class="mt-1">
          {{ order.payment_status }}<template v-if="order.payment_method"> · {{ methodLabels[order.payment_method] }}</template>
        </v-chip>
      </div>
    </div>

    <div class="mt-3 stack">
      <div v-for="item in order.order_items" :key="item.id" class="d-flex justify-space-between ga-3">
        <span>
          {{ item.quantity }}x {{ item.product_name_snapshot }}
          <span v-if="item.packaging_fee_snapshot > 0 && item.packaging_name_snapshot" class="muted">· {{ item.packaging_name_snapshot }}</span>
        </span>
        <span class="font-weight-medium">{{ formatCurrency(item.subtotal) }}</span>
      </div>
    </div>

    <img
      v-if="order.latitude !== null && order.longitude !== null"
      :src="staticMapUrl(order.latitude, order.longitude)"
      loading="lazy"
      class="mt-3 rounded"
      style="width: 100%; height: 120px; object-fit: cover; object-position: center"
      alt="Delivery location"
    />

    <div v-if="order.customer?.address || order.delivery_notes || driverName" class="mt-3 muted text-body-2">
      <div v-if="order.customer?.address">{{ order.customer.address }}</div>
      <div v-if="order.delivery_notes">{{ order.delivery_notes }}</div>
      <div v-if="driverName"><v-icon icon="mdi-truck-delivery-outline" size="14" /> {{ driverName }}</div>
    </div>

    <div v-if="editable" class="mt-4 grid cols-2">
      <v-select
        :model-value="order.status"
        :items="orderStatuses"
        label="Status"
        hide-details
        @update:model-value="emit('status', order.id, $event)"
      />
      <v-select
        :model-value="order.payment_status"
        :items="paymentStatuses"
        label="Payment"
        hide-details
        @update:model-value="emit('payment', order.id, $event, order.payment_method)"
      />
      <v-select
        :model-value="order.payment_method"
        :items="methodItems"
        label="Method"
        clearable
        hide-details
        @update:model-value="emit('payment', order.id, order.payment_status, $event)"
      />
      <v-select
        v-if="drivers"
        :model-value="order.assigned_driver_id"
        :items="drivers"
        item-title="name"
        item-value="id"
        label="Driver"
        clearable
        hide-details
        @update:model-value="emit('assign', order.id, $event)"
      />
    </div>

    <div v-if="editable" class="d-flex align-center justify-space-between mt-3">
      <span class="muted text-body-2">
        <v-icon icon="mdi-map-marker" size="14" />
        <template v-if="order.latitude !== null">{{ order.latitude }}, {{ order.longitude }}</template>
        <template v-else>No delivery location</template>
      </span>
      <v-btn size="small" variant="tonal" prepend-icon="mdi-map-marker-plus" @click="openLocation">
        {{ order.latitude !== null ? 'Edit' : 'Set' }} location
      </v-btn>
    </div>

    <div class="d-flex ga-2 mt-4">
      <v-btn
        :disabled="!whatsapp"
        :href="whatsapp || undefined"
        target="_blank"
        rel="noopener"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-whatsapp"
      >
        WhatsApp
      </v-btn>
      <v-btn variant="text" prepend-icon="mdi-content-copy" @click="copySummary">Copy</v-btn>
      <v-btn v-if="editable" variant="text" prepend-icon="mdi-pencil" @click="router.push(`/orders/${order.id}/edit`)">Edit</v-btn>
    </div>

    <v-dialog v-model="showLocation" max-width="520">
      <v-card class="pa-4">
        <div class="section-title mb-2">Delivery location</div>
        <v-alert v-if="geoError" type="warning" density="compact" class="mb-2">{{ geoError }}</v-alert>
        <LocationPicker v-model:latitude="draftLat" v-model:longitude="draftLng" />
        <v-btn
          v-if="order.customer?.address"
          :loading="geocoding"
          variant="text"
          size="small"
          prepend-icon="mdi-map-search"
          class="mt-2"
          @click="findFromAddress"
        >
          {{ addressIsLink ? 'Find from Maps link' : 'Find from address' }}
        </v-btn>
        <div class="d-flex ga-2 justify-end mt-4">
          <v-btn variant="text" @click="showLocation = false">Cancel</v-btn>
          <v-btn color="primary" :disabled="draftLat === null" prepend-icon="mdi-content-save" @click="saveLocation">
            Save location
          </v-btn>
        </div>
      </v-card>
    </v-dialog>
  </v-card>
</template>
