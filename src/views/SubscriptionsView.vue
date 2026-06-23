<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { formatCurrency } from '../lib/format';
import { fetchCustomers } from '../services/customers';
import { fetchPackagingOptions } from '../services/packaging';
import { fetchProducts } from '../services/products';
import {
  deleteSubscription,
  fetchSubscriptions,
  renewSubscription,
  saveSubscription,
  setSubscriptionStatus
} from '../services/subscriptions';
import type {
  Customer,
  PackagingOption,
  Product,
  Subscription,
  SubscriptionItem,
  SubscriptionStatus
} from '../types/models';
import { weekdayLabels } from '../types/models';

const { mobile } = useDisplay();
const subscriptions = ref<Subscription[]>([]);
const customers = ref<Customer[]>([]);
const products = ref<Product[]>([]);
const packagingOptions = ref<PackagingOption[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const dialog = ref(false);

type FormLine = { productId: string | null; quantity: number; packagingId: string | null };
const form = reactive<{
  id: string;
  customer_id: string | null;
  lines: FormLine[];
  weekdays: number[];
  deliveries_total: number;
  amount_paid: number;
  delivery_notes: string;
}>({
  id: '',
  customer_id: null,
  lines: [{ productId: null, quantity: 1, packagingId: null }],
  weekdays: [1, 2, 3, 4, 5],
  deliveries_total: 30,
  amount_paid: 0,
  delivery_notes: ''
});

// Renew dialog
const renewTarget = ref<Subscription | null>(null);
const renewDeliveries = ref(30);
const renewPayment = ref(0);
const renewing = ref(false);

const isEditing = computed(() => !!form.id);

const customerItems = computed(() => customers.value.map((c) => ({ title: c.name, value: c.id })));
const productItems = computed(() =>
  products.value.map((p) => ({ title: `${p.name} · ${formatCurrency(p.price)}`, value: p.id }))
);
const packagingItems = computed(() => [
  { title: 'No packaging', value: null as string | null },
  ...packagingOptions.value.map((p) => ({
    title: p.price > 0 ? `${p.name} (+${formatCurrency(p.price)})` : p.name,
    value: p.id as string | null
  }))
]);

function lineTotal(line: FormLine): number {
  const product = products.value.find((p) => p.id === line.productId);
  const pack = packagingOptions.value.find((p) => p.id === line.packagingId);
  if (!product) return 0;
  return (Number(product.price) + Number(pack?.price ?? 0)) * (line.quantity || 0);
}
const pricePerDelivery = computed(() => form.lines.reduce((sum, l) => sum + lineTotal(l), 0));

const statusConfig: Record<SubscriptionStatus, { color: string; label: string }> = {
  active: { color: 'success', label: 'Active' },
  paused: { color: 'warning', label: 'Paused' },
  completed: { color: 'info', label: 'Completed' },
  cancelled: { color: 'error', label: 'Cancelled' }
};

const headers = [
  { title: 'Customer', key: 'customer' },
  { title: 'Items', key: 'items', sortable: false },
  { title: 'Days', key: 'weekdays', sortable: false },
  { title: 'Remaining', key: 'remaining', align: 'end' as const, width: '120px' },
  { title: 'Status', key: 'status', width: '110px' },
  { title: '', key: 'actions', sortable: false, width: '90px' }
];

function remaining(sub: Subscription): number {
  return sub.deliveries_total - sub.deliveries_used;
}
function itemsLabel(sub: Subscription): string {
  return sub.items.map((i) => `${i.quantity}× ${i.product_name}`).join(', ');
}
function daysLabel(sub: Subscription): string {
  return [...sub.weekdays].sort((a, b) => a - b).map((d) => weekdayLabels[d]).join(' ');
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    [subscriptions.value, customers.value, products.value, packagingOptions.value] = await Promise.all([
      fetchSubscriptions(),
      fetchCustomers(),
      fetchProducts(),
      fetchPackagingOptions()
    ]);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load subscriptions.';
  } finally {
    loading.value = false;
  }
}

function addLine() {
  form.lines.push({ productId: null, quantity: 1, packagingId: null });
}
function removeLine(i: number) {
  form.lines.splice(i, 1);
  if (form.lines.length === 0) addLine();
}

function openAdd() {
  Object.assign(form, {
    id: '',
    customer_id: null,
    lines: [{ productId: null, quantity: 1, packagingId: null }],
    weekdays: [1, 2, 3, 4, 5],
    deliveries_total: 30,
    amount_paid: 0,
    delivery_notes: ''
  });
  error.value = '';
  dialog.value = true;
}

function openEdit(sub: Subscription) {
  Object.assign(form, {
    id: sub.id,
    customer_id: sub.customer_id,
    lines: sub.items.map((i) => ({ productId: i.product_id, quantity: i.quantity, packagingId: i.packaging_id })),
    weekdays: [...sub.weekdays],
    deliveries_total: sub.deliveries_total,
    amount_paid: Number(sub.amount_paid),
    delivery_notes: sub.delivery_notes ?? ''
  });
  error.value = '';
  dialog.value = true;
}

// Suggest the upfront amount = price per delivery × deliveries, until the owner edits it.
function suggestPayment() {
  form.amount_paid = pricePerDelivery.value * form.deliveries_total;
}

async function submit() {
  if (!form.customer_id) {
    error.value = 'Choose a customer.';
    return;
  }
  if (form.weekdays.length === 0) {
    error.value = 'Pick at least one delivery day.';
    return;
  }
  const items: SubscriptionItem[] = [];
  for (const line of form.lines) {
    const product = products.value.find((p) => p.id === line.productId);
    if (!product || line.quantity < 1) continue;
    const pack = packagingOptions.value.find((p) => p.id === line.packagingId) ?? null;
    items.push({
      product_id: product.id,
      product_name: product.name,
      unit_price: Number(product.price),
      quantity: line.quantity,
      packaging_id: pack?.id ?? null,
      packaging_name: pack?.name ?? null,
      packaging_fee: Number(pack?.price ?? 0)
    });
  }
  if (items.length === 0) {
    error.value = 'Add at least one product.';
    return;
  }

  saving.value = true;
  error.value = '';
  try {
    await saveSubscription({
      id: form.id || undefined,
      customer_id: form.customer_id,
      items,
      weekdays: form.weekdays,
      deliveries_total: form.deliveries_total,
      amount_paid: form.amount_paid,
      delivery_notes: form.delivery_notes || null
    });
    dialog.value = false;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not save subscription.';
  } finally {
    saving.value = false;
  }
}

async function togglePause(sub: Subscription) {
  await setSubscriptionStatus(sub.id, sub.status === 'paused' ? 'active' : 'paused');
  await load();
}

async function cancelSub(sub: Subscription) {
  await setSubscriptionStatus(sub.id, 'cancelled');
  await load();
}

async function removeSub(sub: Subscription) {
  await deleteSubscription(sub.id);
  await load();
}

function openRenew(sub: Subscription) {
  renewTarget.value = sub;
  renewDeliveries.value = sub.deliveries_total;
  renewPayment.value = Number(sub.price_per_delivery) * sub.deliveries_total;
}

async function confirmRenew() {
  if (!renewTarget.value) return;
  renewing.value = true;
  try {
    await renewSubscription(renewTarget.value.id, renewDeliveries.value, renewPayment.value);
    renewTarget.value = null;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not renew subscription.';
  } finally {
    renewing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="eyebrow">Recurring</div>
        <h1 class="title">Subscriptions</h1>
      </div>
      <div class="d-flex ga-2">
        <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openAdd">Add</v-btn>
      </div>
    </div>

    <v-alert v-if="error && !dialog" type="error" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>

    <v-card class="list-card">
      <v-data-table :headers="headers" :items="subscriptions" :loading="loading" density="comfortable" hover item-value="id">
        <template #item.customer="{ item }">
          <span class="font-weight-bold">{{ item.customer?.name ?? 'Customer' }}</span>
        </template>

        <template #item.items="{ item }">
          <span class="text-body-2" style="max-width: 240px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
            {{ itemsLabel(item) }}
          </span>
        </template>

        <template #item.weekdays="{ item }">
          <span class="muted text-body-2">{{ daysLabel(item) }}</span>
        </template>

        <template #item.remaining="{ item }">
          <span class="font-weight-bold" :class="remaining(item) <= 3 && item.status === 'active' ? 'text-error' : ''">
            {{ remaining(item) }}
          </span>
          <span class="muted text-body-2"> / {{ item.deliveries_total }}</span>
        </template>

        <template #item.status="{ item }">
          <v-chip size="x-small" :color="statusConfig[item.status].color" variant="tonal">
            {{ statusConfig[item.status].label }}
          </v-chip>
        </template>

        <template #item.actions="{ item }">
          <v-menu>
            <template #activator="{ props }">
              <v-btn icon="mdi-dots-vertical" size="small" variant="text" v-bind="props" />
            </template>
            <v-list density="compact">
              <v-list-item prepend-icon="mdi-pencil" title="Edit" @click="openEdit(item)" />
              <v-list-item prepend-icon="mdi-refresh" title="Renew / add deliveries" @click="openRenew(item)" />
              <v-list-item
                v-if="item.status === 'active' || item.status === 'paused'"
                :prepend-icon="item.status === 'paused' ? 'mdi-play' : 'mdi-pause'"
                :title="item.status === 'paused' ? 'Resume' : 'Pause'"
                @click="togglePause(item)"
              />
              <v-list-item
                v-if="item.status !== 'cancelled'"
                prepend-icon="mdi-cancel"
                title="Cancel"
                @click="cancelSub(item)"
              />
              <v-list-item prepend-icon="mdi-delete-outline" title="Delete" base-color="error" @click="removeSub(item)" />
            </v-list>
          </v-menu>
        </template>

        <template #no-data>
          <div class="pa-6 text-center muted">No subscriptions yet. Add one for a prepaid recurring customer.</div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Add / Edit dialog -->
    <v-dialog v-model="dialog" :fullscreen="mobile" max-width="600" scrollable>
      <v-card>
        <v-toolbar density="compact" color="surface">
          <v-btn icon="mdi-close" variant="text" @click="dialog = false" />
          <v-toolbar-title class="text-body-1 font-weight-bold">
            {{ isEditing ? 'Edit subscription' : 'Add subscription' }}
          </v-toolbar-title>
          <template #append>
            <v-btn color="primary" variant="tonal" :loading="saving" @click="submit">Save</v-btn>
          </template>
        </v-toolbar>
        <v-card-text class="pa-4 stack">
          <v-alert v-if="error" type="error" density="compact">{{ error }}</v-alert>

          <v-select v-model="form.customer_id" :items="customerItems" label="Customer" hide-details />

          <!-- Recurring items -->
          <div>
            <div class="section-title mb-2">Items per delivery</div>
            <div
              v-for="(line, i) in form.lines"
              :key="i"
              class="pa-3 rounded mb-2"
              style="border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))"
            >
              <div class="d-flex ga-2 align-center mb-2">
                <v-select v-model="line.productId" :items="productItems" label="Product" hide-details class="flex-grow-1" />
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
                <v-select v-model="line.packagingId" :items="packagingItems" label="Packaging" hide-details class="flex-grow-1" />
              </div>
            </div>
            <v-btn variant="text" size="small" prepend-icon="mdi-plus" @click="addLine">Add item</v-btn>
          </div>

          <!-- Delivery days -->
          <div>
            <div class="section-title mb-2">Delivery days</div>
            <v-btn-toggle v-model="form.weekdays" multiple divided color="primary" density="comfortable">
              <v-btn v-for="(label, d) in weekdayLabels" :key="d" :value="d" size="small">{{ label }}</v-btn>
            </v-btn-toggle>
          </div>

          <!-- Prepaid plan -->
          <div class="d-flex ga-2">
            <v-text-field
              v-model.number="form.deliveries_total"
              label="Prepaid deliveries"
              type="number"
              min="1"
              inputmode="numeric"
              hide-details
              class="flex-grow-1"
            />
            <v-text-field
              v-model.number="form.amount_paid"
              label="Amount paid upfront"
              type="number"
              min="0"
              inputmode="numeric"
              prefix="Rp"
              hide-details
              class="flex-grow-1"
            >
              <template #append-inner>
                <v-btn size="x-small" variant="text" @click="suggestPayment">auto</v-btn>
              </template>
            </v-text-field>
          </div>
          <div class="muted text-body-2">
            Per delivery: {{ formatCurrency(pricePerDelivery) }} · Plan value:
            {{ formatCurrency(pricePerDelivery * form.deliveries_total) }}
          </div>

          <v-textarea v-model="form.delivery_notes" label="Delivery notes (optional)" rows="2" hide-details />
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Renew dialog -->
    <v-dialog :model-value="renewTarget !== null" max-width="420" @update:model-value="renewTarget = null">
      <v-card class="pa-4">
        <div class="section-title mb-2">Renew subscription</div>
        <p class="muted text-body-2 mb-4">Add prepaid deliveries for <strong>{{ renewTarget?.customer?.name }}</strong>.</p>
        <div class="stack">
          <v-text-field v-model.number="renewDeliveries" label="Add deliveries" type="number" min="1" inputmode="numeric" hide-details />
          <v-text-field v-model.number="renewPayment" label="Payment received" type="number" min="0" inputmode="numeric" prefix="Rp" hide-details />
        </div>
        <div class="d-flex ga-2 justify-end mt-4">
          <v-btn variant="text" :disabled="renewing" @click="renewTarget = null">Cancel</v-btn>
          <v-btn color="primary" :loading="renewing" prepend-icon="mdi-refresh" @click="confirmRenew">Renew</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </main>
</template>
