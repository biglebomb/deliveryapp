<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import LocationPicker from '../components/LocationPicker.vue';
import { useBranch } from '../composables/useBranch';
import { formatCurrency } from '../lib/format';
import { assignArea, resolveDeliveryFee } from '../lib/route';
import { fetchAreas } from '../services/areas';
import { fetchOrderById, updateOrder } from '../services/orders';
import { fetchPackagingOptions } from '../services/packaging';
import { fetchProducts } from '../services/products';
import type { Area, NewOrderItem, Order, PackagingOption, Product } from '../types/models';

const route = useRoute();
const router = useRouter();
const branchCtx = useBranch();
const orderId = route.params.id as string;

const order = ref<Order | null>(null);
const products = ref<Product[]>([]);
const areas = ref<Area[]>([]);
const packagingOptions = ref<PackagingOption[]>([]);
const deliveryNotes = ref('');
const deliveryFee = ref(0);
const feeTouched = ref(false);
const latitude = ref<number | null>(null);
const longitude = ref<number | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');

type Line = { productId: string | null; quantity: number; packagingId: string | null };
const lines = ref<Line[]>([]);

const assignedArea = computed(() => {
  if (latitude.value === null || longitude.value === null) return null;
  return assignArea({ lat: latitude.value, lng: longitude.value }, areas.value);
});

const defaultPackaging = computed<PackagingOption | null>(
  () => packagingOptions.value.find((o) => o.is_default) ?? packagingOptions.value[0] ?? null
);

const productItems = computed(() =>
  products.value.map((p) => ({ title: `${p.name} · ${formatCurrency(p.price)}`, value: p.id }))
);
const packagingItems = computed(() =>
  packagingOptions.value.map((o) => ({
    value: o.id,
    title: o.price > 0 ? `${o.name} (+${formatCurrency(o.price)})` : o.name
  }))
);

function lineSubtotal(line: Line): number {
  const product = products.value.find((p) => p.id === line.productId);
  const pack = packagingOptions.value.find((o) => o.id === line.packagingId);
  if (!product) return 0;
  return (Number(product.price) + Number(pack?.price ?? 0)) * (line.quantity || 0);
}
const itemsTotal = computed(() => lines.value.reduce((sum, l) => sum + lineSubtotal(l), 0));
const total = computed(() => itemsTotal.value + Number(deliveryFee.value || 0));

const defaultDeliveryFee = computed(() =>
  resolveDeliveryFee(assignedArea.value, areas.value, branchCtx.current.value?.delivery_fee ?? 0)
);
watch(defaultDeliveryFee, (fee) => {
  if (!feeTouched.value) deliveryFee.value = fee;
});

function addLine(productId?: string) {
  lines.value.push({
    productId: productId ?? null,
    quantity: 1,
    packagingId: defaultPackaging.value?.id ?? null
  });
}

function removeLine(i: number) {
  lines.value.splice(i, 1);
  if (lines.value.length === 0) addLine();
}

function quickAdd(product: Product) {
  const last = [...lines.value].reverse().find((l) => l.productId === product.id);
  if (last) {
    last.quantity += 1;
  } else {
    lines.value.push({ productId: product.id, quantity: 1, packagingId: defaultPackaging.value?.id ?? null });
  }
}

function onProductChange(line: Line) {
  if (!line.packagingId && defaultPackaging.value) {
    line.packagingId = defaultPackaging.value.id;
  }
}

const selectedItems = computed<NewOrderItem[]>(() =>
  lines.value
    .filter((l) => l.productId && l.quantity > 0)
    .map((l) => ({
      product: products.value.find((p) => p.id === l.productId)!,
      quantity: l.quantity,
      packaging: packagingOptions.value.find((o) => o.id === l.packagingId) ?? null
    }))
    .filter((item) => item.product)
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [orderData, productRows, areaRows, packagingRows] = await Promise.all([
      fetchOrderById(orderId),
      fetchProducts(false),
      fetchAreas(),
      fetchPackagingOptions(false),
      branchCtx.loadBranches()
    ]);
    order.value = orderData;
    products.value = productRows;
    areas.value = areaRows;
    packagingOptions.value = packagingRows;
    deliveryNotes.value = orderData.delivery_notes ?? '';
    // Keep the order's saved fee; don't let the default watcher overwrite it.
    deliveryFee.value = Number(orderData.delivery_fee ?? 0);
    feeTouched.value = true;
    latitude.value = orderData.latitude;
    longitude.value = orderData.longitude;
    // Each saved order item becomes its own line (preserves multi-packaging per product)
    lines.value = (orderData.order_items ?? []).map((item) => ({
      productId: item.product_id,
      quantity: item.quantity,
      packagingId: item.packaging_id
    }));
    if (lines.value.length === 0) addLine();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load order.';
  } finally {
    loading.value = false;
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
      deliveryFee: Number(deliveryFee.value || 0),
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
      <!-- Products -->
      <v-card class="list-card pa-4">
        <div class="section-title mb-3">Products</div>

        <!-- Quick-add chips -->
        <div v-if="products.length" class="d-flex flex-wrap ga-2 mb-4">
          <v-btn
            v-for="product in products"
            :key="product.id"
            size="small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-plus"
            @click="quickAdd(product)"
          >
            {{ product.name }}
          </v-btn>
        </div>

        <!-- Line items -->
        <div class="stack">
          <div
            v-for="(line, i) in lines"
            :key="i"
            class="pa-3 rounded"
            style="border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))"
          >
            <div class="d-flex ga-2 align-center mb-2">
              <v-select
                v-model="line.productId"
                :items="productItems"
                label="Product"
                hide-details
                class="flex-grow-1"
                @update:model-value="onProductChange(line)"
              />
              <v-btn icon="mdi-close" size="small" variant="text" @click="removeLine(i)" />
            </div>
            <div class="d-flex ga-2">
              <v-text-field
                v-model.number="line.quantity"
                label="Qty"
                type="number"
                min="1"
                inputmode="numeric"
                hide-details
                style="max-width: 88px"
              />
              <v-select
                v-model="line.packagingId"
                :items="packagingItems"
                label="Packaging"
                hide-details
                class="flex-grow-1"
              />
            </div>
            <div v-if="lineSubtotal(line) > 0" class="text-right muted text-body-2 mt-1">
              {{ formatCurrency(lineSubtotal(line)) }}
            </div>
          </div>
        </div>
        <v-btn class="mt-3" variant="text" size="small" prepend-icon="mdi-plus" @click="addLine()">
          Add line
        </v-btn>
      </v-card>

      <!-- Notes -->
      <v-card class="list-card pa-4">
        <v-textarea v-model="deliveryNotes" label="Delivery notes" rows="2" />
      </v-card>

      <!-- Location -->
      <v-card class="list-card pa-4">
        <LocationPicker
          v-model:latitude="latitude"
          v-model:longitude="longitude"
          :area-label="assignedArea"
          :area-unknown="latitude !== null && !assignedArea"
        />
        <v-text-field
          v-model.number="deliveryFee"
          label="Delivery fee"
          type="number"
          min="0"
          inputmode="numeric"
          prefix="Rp"
          class="mt-3"
          hide-details
          @update:model-value="feeTouched = true"
        />
      </v-card>

      <!-- Sticky footer -->
      <v-card class="list-card pa-4 position-sticky" style="bottom: 72px; z-index: 2">
        <div class="d-flex align-center justify-space-between text-body-2 muted mb-1">
          <span>Items</span>
          <span>{{ formatCurrency(itemsTotal) }}</span>
        </div>
        <div v-if="Number(deliveryFee) > 0" class="d-flex align-center justify-space-between text-body-2 muted mb-1">
          <span>Delivery fee</span>
          <span>{{ formatCurrency(Number(deliveryFee)) }}</span>
        </div>
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
