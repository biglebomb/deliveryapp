<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useDisplay } from 'vuetify';
import EmptyState from '../components/EmptyState.vue';
import LocationPicker from '../components/LocationPicker.vue';
import { useBranch } from '../composables/useBranch';
import { formatCurrency, formatDateTime } from '../lib/format';
import { assignArea, resolveDeliveryFee } from '../lib/route';
import { fetchAreas } from '../services/areas';
import { fetchCustomers, saveCustomer } from '../services/customers';
import { isMapsLink, resolveMapsLink } from '../services/geo';
import { fetchInbox, markInbox } from '../services/inbox';
import { createOrder } from '../services/orders';
import { fetchPackagingOptions } from '../services/packaging';
import { fetchProducts } from '../services/products';
import type { Area, Customer, InboxItem, PackagingOption, Product } from '../types/models';

const { mobile } = useDisplay();
const branchCtx = useBranch();
const items = ref<InboxItem[]>([]);
const products = ref<Product[]>([]);
const customers = ref<Customer[]>([]);
const areas = ref<Area[]>([]);
const packagingOptions = ref<PackagingOption[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');

const active = ref<InboxItem | null>(null);
const linkCustomerId = ref<string | null>(null);
const newCustomer = reactive({ name: '', phone: '' });
const draftAddress = ref('');
const draftNotes = ref('');
const draftItems = ref<{ productId: string | null; quantity: number; packagingId: string | null }[]>([]);
const draftLat = ref<number | null>(null);
const draftLng = ref<number | null>(null);
const geocoding = ref(false);

/** First Google Maps share link found anywhere in the raw WhatsApp text. */
const rawMapsLink = computed(() => {
  const text = active.value?.raw_text ?? '';
  const match = text.match(/https?:\/\/\S+/g)?.find((url) => isMapsLink(url));
  return match ?? null;
});

const draftArea = computed(() =>
  draftLat.value !== null && draftLng.value !== null
    ? assignArea({ lat: draftLat.value, lng: draftLng.value }, areas.value)
    : null
);

const defaultPackagingId = computed(
  () => (packagingOptions.value.find((p) => p.is_default) ?? packagingOptions.value[0])?.id ?? null
);
const productItems = computed(() => products.value.map((p) => ({ value: p.id, title: p.name })));
const packagingItems = computed(() =>
  packagingOptions.value.map((p) => ({ value: p.id, title: p.price > 0 ? `${p.name} (+${formatCurrency(p.price)})` : p.name }))
);

const draftItemsTotal = computed(() =>
  draftItems.value.reduce((sum, d) => {
    const product = products.value.find((p) => p.id === d.productId);
    const pack = packagingOptions.value.find((p) => p.id === d.packagingId);
    if (!product) return sum;
    return sum + (Number(product.price) + Number(pack?.price ?? 0)) * d.quantity;
  }, 0)
);

// Auto delivery fee from the resolved area, falling back to the branch default.
const draftDeliveryFee = computed(() =>
  resolveDeliveryFee(draftArea.value, areas.value, branchCtx.current.value?.delivery_fee ?? 0)
);
const draftTotal = computed(() => draftItemsTotal.value + draftDeliveryFee.value);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [inboxRows, productRows, customerRows, areaRows, packagingRows] = await Promise.all([
      fetchInbox('pending'),
      fetchProducts(false),
      fetchCustomers(),
      fetchAreas(),
      fetchPackagingOptions(false),
      branchCtx.loadBranches()
    ]);
    items.value = inboxRows;
    products.value = productRows;
    customers.value = customerRows;
    areas.value = areaRows;
    packagingOptions.value = packagingRows;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load the inbox.';
  } finally {
    loading.value = false;
  }
}

function review(item: InboxItem) {
  active.value = item;
  error.value = '';
  // Prefill: try matching an existing customer by name, else new-customer fields.
  const parsedName = item.parsed?.customer_name ?? '';
  const existing = customers.value.find((c) => c.name.toLowerCase() === parsedName.toLowerCase());
  linkCustomerId.value = existing?.id ?? null;
  newCustomer.name = parsedName;
  newCustomer.phone = item.parsed?.phone ?? '';
  draftAddress.value = item.parsed?.address ?? '';
  draftNotes.value = item.parsed?.notes ?? '';
  draftLat.value = item.latitude;
  draftLng.value = item.longitude;
  draftItems.value = (item.parsed?.items ?? []).map((pi) => ({
    productId: pi.product_id ?? null,
    quantity: pi.quantity || 1,
    packagingId: defaultPackagingId.value
  }));
}

function addLine() {
  draftItems.value.push({ productId: null, quantity: 1, packagingId: defaultPackagingId.value });
}

function removeLine(index: number) {
  draftItems.value.splice(index, 1);
}

/** Resolve coordinates from the Google Maps link found in the raw WhatsApp text. */
async function findLocation() {
  const link = rawMapsLink.value;
  if (!link) {
    error.value = 'No Maps link found in the message.';
    return;
  }
  geocoding.value = true;
  error.value = '';
  try {
    const point = await resolveMapsLink(link);
    if (point) {
      draftLat.value = point.lat;
      draftLng.value = point.lng;
    } else {
      error.value = 'Could not find coordinates for that link.';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Lookup failed.';
  } finally {
    geocoding.value = false;
  }
}

async function confirm() {
  const item = active.value;
  if (!item) return;
  const lineItems = draftItems.value
    .filter((d) => d.productId)
    .map((d) => ({
      product: products.value.find((p) => p.id === d.productId)!,
      quantity: d.quantity,
      packaging: packagingOptions.value.find((p) => p.id === d.packagingId) ?? null
    }));
  if (!lineItems.length) {
    error.value = 'Map at least one item to a product.';
    return;
  }

  saving.value = true;
  error.value = '';
  try {
    const lat = draftLat.value;
    const lng = draftLng.value;
    const address = draftAddress.value.trim() || null;

    let customer: Customer | null = linkCustomerId.value
      ? customers.value.find((c) => c.id === linkCustomerId.value) ?? null
      : null;
    if (!customer) {
      customer = await saveCustomer({
        name: newCustomer.name.trim() || 'Pelanggan WhatsApp',
        phone: newCustomer.phone.trim() || null,
        address,
        latitude: lat,
        longitude: lng
      });
    } else if (address && !customer.address) {
      // Fill in the address for an existing customer that doesn't have one yet.
      customer = await saveCustomer({ id: customer.id, name: customer.name, address });
    }

    const deliveryArea = draftArea.value;

    await createOrder({
      customer,
      items: lineItems,
      status: 'pending',
      paymentStatus: 'unpaid',
      deliveryNotes: draftNotes.value.trim() || null,
      deliveryFee: draftDeliveryFee.value,
      latitude: lat,
      longitude: lng,
      deliveryArea
    });

    await markInbox(item.id, 'confirmed');
    active.value = null;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not confirm the order.';
  } finally {
    saving.value = false;
  }
}

async function reject(item: InboxItem) {
  await markInbox(item.id, 'rejected');
  if (active.value?.id === item.id) active.value = null;
  await load();
}

onMounted(load);
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="eyebrow">WhatsApp</div>
        <h1 class="title">Inbox</h1>
      </div>
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
    </div>

    <v-alert v-if="error && !active" type="error" class="mb-4">{{ error }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <div v-if="items.length" class="stack">
      <v-card v-for="item in items" :key="item.id" class="list-card pa-4">
        <div class="d-flex align-start justify-space-between ga-3">
          <div>
            <div class="section-title">{{ item.parsed?.customer_name || 'Unknown customer' }}</div>
            <div class="muted text-body-2">{{ formatDateTime(item.created_at) }}</div>
          </div>
          <v-chip v-if="item.latitude !== null" size="small" color="success" variant="tonal">
            <v-icon icon="mdi-map-marker" size="14" start /> pinned
          </v-chip>
          <v-chip v-else size="small" color="warning" variant="tonal">no location</v-chip>
        </div>

        <div class="mt-2 stack">
          <div v-for="(it, i) in item.parsed?.items ?? []" :key="i" class="text-body-2">
            {{ it.quantity }}x {{ it.name }}
            <v-icon v-if="!it.product_id" icon="mdi-help-circle-outline" size="14" color="warning" />
          </div>
        </div>
        <div v-if="item.parsed?.address" class="text-body-2 mt-2">
          <v-icon icon="mdi-map-marker-outline" size="14" /> {{ item.parsed.address }}
        </div>
        <div v-if="item.parsed?.notes" class="muted text-body-2 mt-1">
          <v-icon icon="mdi-note-text-outline" size="14" /> {{ item.parsed.notes }}
        </div>
        <div v-if="item.raw_text" class="muted text-body-2 mt-2" style="white-space: pre-wrap">"{{ item.raw_text }}"</div>

        <div class="d-flex ga-2 mt-4">
          <v-btn color="primary" prepend-icon="mdi-check" @click="review(item)">Review</v-btn>
          <v-btn variant="text" color="error" prepend-icon="mdi-close" @click="reject(item)">Reject</v-btn>
        </div>
      </v-card>
    </div>
    <EmptyState v-else-if="!loading" icon="mdi-inbox-outline" title="Inbox empty" text="Parsed WhatsApp orders waiting for review will show here." />

    <v-dialog
      :model-value="active !== null"
      :fullscreen="mobile"
      max-width="640"
      scrollable
      @update:model-value="active = null"
    >
      <v-card v-if="active">
        <!-- Header -->
        <v-toolbar density="compact" color="surface">
          <v-btn icon="mdi-close" variant="text" :disabled="saving" @click="active = null" />
          <v-toolbar-title class="text-body-1 font-weight-bold">Review order</v-toolbar-title>
          <template #append>
            <v-btn color="success" variant="tonal" :loading="saving" prepend-icon="mdi-check-circle" @click="confirm">
              Confirm
            </v-btn>
          </template>
        </v-toolbar>

        <v-card-text class="pa-4 stack">
          <v-alert v-if="error" type="error" density="compact">{{ error }}</v-alert>

          <!-- Raw text collapsible -->
          <v-expansion-panels v-if="active.raw_text" variant="accordion">
            <v-expansion-panel>
              <v-expansion-panel-title class="text-body-2 muted py-2">Teks asli WhatsApp</v-expansion-panel-title>
              <v-expansion-panel-text>
                <div class="text-body-2" style="white-space: pre-wrap">{{ active.raw_text }}</div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <!-- Location -->
          <div>
            <div class="section-title text-body-1 mb-2">Lokasi</div>
            <LocationPicker
              v-model:latitude="draftLat"
              v-model:longitude="draftLng"
              :area-label="draftArea"
              :area-unknown="draftLat !== null && !draftArea"
            />
            <v-btn
              v-if="rawMapsLink"
              :loading="geocoding"
              variant="text"
              size="small"
              prepend-icon="mdi-map-search"
              class="mt-1"
              @click="findLocation"
            >
              Find from Maps link
            </v-btn>
          </div>

          <!-- Customer -->
          <div>
            <div class="section-title text-body-1 mb-2">Pelanggan</div>
            <v-autocomplete
              v-model="linkCustomerId"
              :items="customers"
              item-title="name"
              item-value="id"
              label="Link existing customer (optional)"
              clearable
              hide-details
              class="mb-3"
            />
            <div v-if="!linkCustomerId" class="stack">
              <v-text-field v-model="newCustomer.name" label="New customer name" hide-details />
              <v-text-field v-model="newCustomer.phone" label="Phone" inputmode="tel" hide-details />
            </div>
            <v-textarea v-model="draftAddress" label="Address" rows="2" auto-grow hide-details class="mt-3" />
            <v-textarea v-model="draftNotes" label="Delivery notes" rows="1" auto-grow hide-details class="mt-3" />
          </div>

          <!-- Items -->
          <div>
            <div class="section-title text-body-1 mb-2">Items</div>
            <div class="stack">
              <div v-for="(line, i) in draftItems" :key="i" class="pa-3 rounded" style="border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))">
                <div class="d-flex ga-2 align-center mb-2">
                  <v-select v-model="line.productId" :items="productItems" label="Product" density="compact" hide-details class="flex-grow-1" />
                  <v-btn icon="mdi-close" variant="text" size="small" @click="removeLine(i)" />
                </div>
                <div class="d-flex ga-2">
                  <v-text-field v-model.number="line.quantity" type="number" min="1" label="Qty" density="compact" hide-details style="max-width: 88px" />
                  <v-select v-model="line.packagingId" :items="packagingItems" label="Packaging" density="compact" hide-details class="flex-grow-1" />
                </div>
              </div>
            </div>
            <v-btn variant="text" size="small" prepend-icon="mdi-plus" class="mt-2" @click="addLine">Add item</v-btn>
          </div>

          <!-- Total + actions -->
          <div class="d-flex align-center justify-space-between pt-2">
            <span class="muted">Total</span>
            <span class="metric-value">{{ formatCurrency(draftTotal) }}</span>
          </div>

          <v-btn color="success" size="large" :loading="saving" prepend-icon="mdi-check-circle" block @click="confirm">
            Confirm order
          </v-btn>
        </v-card-text>
      </v-card>
    </v-dialog>
  </main>
</template>
