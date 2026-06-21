<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRefs, watch } from 'vue';
import { useRouter } from 'vue-router';
import LocationPicker from '../components/LocationPicker.vue';
import { formatCurrency } from '../lib/format';
import { assignArea } from '../lib/route';
import { fetchAreas } from '../services/areas';
import { fetchCustomers, saveCustomer } from '../services/customers';
import { createOrder } from '../services/orders';
import { fetchPackagingOptions } from '../services/packaging';
import { fetchProducts } from '../services/products';
import type { Area, Customer, NewOrderItem, OrderStatus, PackagingOption, PaymentStatus, Product } from '../types/models';

const router = useRouter();
const customers = ref<Customer[]>([]);
const products = ref<Product[]>([]);
const areas = ref<Area[]>([]);
const packagingOptions = ref<PackagingOption[]>([]);
const selectedCustomerId = ref<string | null>(null);
const quantities = reactive<Record<string, number>>({});
const packagingByProduct = reactive<Record<string, string>>({});
const deliveryNotes = ref('');
const latitude = ref<number | null>(null);
const longitude = ref<number | null>(null);
const status = ref<OrderStatus>('pending');
const paymentStatus = ref<PaymentStatus>('unpaid');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const newCustomer = reactive<{
  name: string;
  phone: string;
  address: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
}>({ name: '', phone: '', address: '', notes: '', latitude: null, longitude: null });
const { latitude: newCustLat, longitude: newCustLng } = toRefs(newCustomer);

const selectedCustomer = computed(() => customers.value.find((customer) => customer.id === selectedCustomerId.value) ?? null);

// Area is derived from the delivery coordinates via the saved polygons.
const assignedArea = computed(() => {
  if (latitude.value === null || longitude.value === null) return null;
  return assignArea({ lat: latitude.value, lng: longitude.value }, areas.value);
});

// Default the delivery location to the chosen customer's saved location (editable after).
watch(selectedCustomer, (customer) => {
  if (customer && customer.latitude !== null && customer.longitude !== null) {
    latitude.value = customer.latitude;
    longitude.value = customer.longitude;
  }
});
const defaultPackaging = computed<PackagingOption | null>(
  () => packagingOptions.value.find((option) => option.is_default) ?? packagingOptions.value[0] ?? null
);
function packagingFor(productId: string): PackagingOption | null {
  const id = packagingByProduct[productId];
  return packagingOptions.value.find((option) => option.id === id) ?? defaultPackaging.value;
}

const packagingItems = computed(() =>
  packagingOptions.value.map((option) => ({
    value: option.id,
    title: option.price > 0 ? `${option.name} (+${formatCurrency(option.price)})` : option.name
  }))
);

const selectedItems = computed<NewOrderItem[]>(() =>
  products.value
    .map((product) => ({ product, quantity: quantities[product.id] ?? 0, packaging: packagingFor(product.id) }))
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
    const [customerRows, productRows, areaRows, packagingRows] = await Promise.all([
      fetchCustomers(),
      fetchProducts(false),
      fetchAreas(),
      fetchPackagingOptions(false)
    ]);
    customers.value = customerRows;
    products.value = productRows;
    areas.value = areaRows;
    packagingOptions.value = packagingRows;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load order form.';
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

async function addCustomer() {
  if (!newCustomer.name.trim()) return;
  const customer = await saveCustomer({
    name: newCustomer.name.trim(),
    phone: newCustomer.phone.trim() || null,
    address: newCustomer.address.trim() || null,
    notes: newCustomer.notes.trim() || null,
    latitude: newCustomer.latitude,
    longitude: newCustomer.longitude
  });
  customers.value = [...customers.value, customer].sort((a, b) => a.name.localeCompare(b.name));
  selectedCustomerId.value = customer.id;
  Object.assign(newCustomer, { name: '', phone: '', address: '', notes: '', latitude: null, longitude: null });
}

async function submit() {
  if (!selectedCustomer.value || selectedItems.value.length === 0) {
    error.value = 'Choose a customer and at least one product.';
    return;
  }

  saving.value = true;
  error.value = '';
  try {
    await createOrder({
      customer: selectedCustomer.value,
      items: selectedItems.value,
      status: status.value,
      paymentStatus: paymentStatus.value,
      deliveryNotes: deliveryNotes.value.trim() || null,
      latitude: latitude.value,
      longitude: longitude.value,
      deliveryArea: assignedArea.value
    });
    await router.push('/orders');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not create order.';
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
        <div class="eyebrow">Quick order</div>
        <h1 class="title">New order</h1>
      </div>
      <v-btn icon="mdi-close" variant="text" @click="router.push('/orders')" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <form class="stack" @submit.prevent="submit">
      <v-card class="list-card pa-4">
        <div class="section-title mb-3">Customer</div>
        <v-autocomplete
          v-model="selectedCustomerId"
          :items="customers"
          item-title="name"
          item-value="id"
          label="Search customer"
          prepend-inner-icon="mdi-account-search"
          hide-details
        />

        <v-expansion-panels class="mt-3" variant="accordion">
          <v-expansion-panel>
            <v-expansion-panel-title>Add new customer</v-expansion-panel-title>
            <v-expansion-panel-text>
              <div class="stack">
                <v-text-field v-model="newCustomer.name" label="Name" hide-details />
                <v-text-field v-model="newCustomer.phone" label="Phone" inputmode="tel" hide-details />
                <v-textarea v-model="newCustomer.address" label="Address" rows="2" hide-details />
                <v-textarea v-model="newCustomer.notes" label="Notes" rows="2" hide-details />
                <LocationPicker v-model:latitude="newCustLat" v-model:longitude="newCustLng" />
                <v-btn color="primary" variant="tonal" prepend-icon="mdi-account-plus" @click="addCustomer">
                  Add customer
                </v-btn>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card>

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
        <div class="grid cols-2">
          <v-select v-model="status" :items="['pending', 'preparing', 'delivering']" label="Status" />
          <v-select v-model="paymentStatus" :items="['unpaid', 'paid']" label="Payment" />
        </div>
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
          Save order
        </v-btn>
      </v-card>
    </form>
  </main>
</template>

