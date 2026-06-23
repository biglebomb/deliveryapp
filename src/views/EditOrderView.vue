<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import LocationPicker from '../components/LocationPicker.vue';
import { formatCurrency } from '../lib/format';
import { assignArea } from '../lib/route';
import { fetchAreas } from '../services/areas';
import { fetchOrderById, updateOrder } from '../services/orders';
import { fetchPackagingOptions } from '../services/packaging';
import { fetchProducts } from '../services/products';
import type { Area, Order, PackagingOption, Product } from '../types/models';

const route = useRoute();
const router = useRouter();
const orderId = route.params.id as string;

const order = ref<Order | null>(null);
const products = ref<Product[]>([]);
const areas = ref<Area[]>([]);
const packagingOptions = ref<PackagingOption[]>([]);
const quantities = reactive<Record<string, number>>({});
const packagingByProduct = reactive<Record<string, string>>({});
const deliveryNotes = ref('');
const latitude = ref<number | null>(null);
const longitude = ref<number | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');

const assignedArea = computed(() => {
  if (latitude.value === null || longitude.value === null) return null;
  return assignArea({ lat: latitude.value, lng: longitude.value }, areas.value);
});

const defaultPackaging = computed<PackagingOption | null>(
  () => packagingOptions.value.find((o) => o.is_default) ?? packagingOptions.value[0] ?? null
);
function packagingFor(productId: string): PackagingOption | null {
  const id = packagingByProduct[productId];
  return packagingOptions.value.find((o) => o.id === id) ?? defaultPackaging.value;
}
const packagingItems = computed(() =>
  packagingOptions.value.map((o) => ({
    value: o.id,
    title: o.price > 0 ? `${o.name} (+${formatCurrency(o.price)})` : o.name
  }))
);

const selectedItems = computed(() =>
  products.value
    .map((p) => ({ product: p, quantity: quantities[p.id] ?? 0, packaging: packagingFor(p.id) }))
    .filter((item) => item.quantity > 0)
);
const total = computed(() =>
  selectedItems.value.reduce(
    (sum, item) => sum + (Number(item.product.price) + Number(item.packaging?.price ?? 0)) * item.quantity,
    0
  )
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [orderData, productRows, areaRows, packagingRows] = await Promise.all([
      fetchOrderById(orderId),
      fetchProducts(false),
      fetchAreas(),
      fetchPackagingOptions(false)
    ]);
    order.value = orderData;
    products.value = productRows;
    areas.value = areaRows;
    packagingOptions.value = packagingRows;

    // Pre-fill from existing order
    deliveryNotes.value = orderData.delivery_notes ?? '';
    latitude.value = orderData.latitude;
    longitude.value = orderData.longitude;
    for (const item of orderData.order_items ?? []) {
      if (item.product_id) {
        quantities[item.product_id] = item.quantity;
        if (item.packaging_id) packagingByProduct[item.product_id] = item.packaging_id;
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load order.';
  } finally {
    loading.value = false;
  }
}

function changeQty(product: Product, delta: number) {
  const next = Math.max(0, (quantities[product.id] ?? 0) + delta);
  quantities[product.id] = next;
  if (next > 0 && !packagingByProduct[product.id] && defaultPackaging.value) {
    packagingByProduct[product.id] = defaultPackaging.value.id;
  }
}

async function submit() {
  if (selectedItems.value.length === 0) {
    error.value = 'Add at least one product.';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await updateOrder(orderId, {
      items: selectedItems.value,
      deliveryNotes: deliveryNotes.value.trim() || null,
      latitude: latitude.value,
      longitude: longitude.value,
      deliveryArea: assignedArea.value
    });
    await router.push('/orders');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not save order.';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="eyebrow">{{ order?.customer?.name ?? 'Order' }}</div>
        <h1 class="title">Edit order</h1>
      </div>
      <v-btn icon="mdi-close" variant="text" @click="router.push('/orders')" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <form v-if="order" class="stack" @submit.prevent="submit">
      <v-card class="list-card pa-4">
        <div class="section-title mb-3">Products</div>
        <div class="stack">
          <div v-for="product in products" :key="product.id">
            <div class="d-flex align-center justify-space-between ga-3">
              <div>
                <div class="font-weight-bold">{{ product.name }}</div>
                <div class="muted text-body-2">{{ formatCurrency(product.price) }}</div>
              </div>
              <div class="d-flex align-center ga-2">
                <v-btn icon="mdi-minus" variant="tonal" size="small" @click="changeQty(product, -1)" />
                <div class="font-weight-bold text-center" style="min-width: 32px">{{ quantities[product.id] ?? 0 }}</div>
                <v-btn icon="mdi-plus" color="primary" size="small" @click="changeQty(product, 1)" />
              </div>
            </div>
            <v-select
              v-if="(quantities[product.id] ?? 0) > 0 && packagingItems.length > 1"
              v-model="packagingByProduct[product.id]"
              :items="packagingItems"
              label="Packaging"
              density="compact"
              variant="outlined"
              hide-details
              class="mt-2"
            />
          </div>
        </div>
      </v-card>

      <v-card class="list-card pa-4">
        <v-textarea v-model="deliveryNotes" label="Delivery notes" rows="2" />
      </v-card>

      <v-card class="list-card pa-4">
        <LocationPicker
          v-model:latitude="latitude"
          v-model:longitude="longitude"
          :area-label="assignedArea"
          :area-unknown="latitude !== null && !assignedArea"
        />
      </v-card>

      <v-card class="list-card pa-4 position-sticky" style="bottom: 72px; z-index: 2">
        <div class="d-flex align-center justify-space-between mb-3">
          <span class="section-title">Total</span>
          <span class="metric-value">{{ formatCurrency(total) }}</span>
        </div>
        <v-btn color="primary" size="large" type="submit" :loading="saving" block>
          Save changes
        </v-btn>
      </v-card>
    </form>
  </main>
</template>
