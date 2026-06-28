<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useBranch } from '../composables/useBranch';
import { formatCurrency } from '../lib/format';
import { fetchCustomers } from '../services/customers';
import { fetchOrders } from '../services/orders';
import { ordersToCsv, planImport, runImport, CSV_COLUMNS, type ImportPlan } from '../services/ordersIo';
import { fetchPackagingOptions } from '../services/packaging';
import { fetchProducts } from '../services/products';
import type { Customer, Order, PackagingOption, Product } from '../types/models';

const branchCtx = useBranch();
const orders = ref<Order[]>([]);
const products = ref<Product[]>([]);
const packaging = ref<PackagingOption[]>([]);
const customers = ref<Customer[]>([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');

const file = ref<File | null>(null);
const plan = ref<ImportPlan | null>(null);
const importing = ref(false);

const previewHeaders = [
  { title: 'Date', key: 'date', width: '120px' },
  { title: 'Customer', key: 'customerName' },
  { title: 'Items', key: 'itemCount', align: 'end' as const, width: '80px' },
  { title: 'Total', key: 'total', align: 'end' as const, width: '120px' },
  { title: 'Status', key: 'status' }
];

const previewRows = computed(() =>
  (plan.value?.orders ?? []).map((o) => ({
    date: o.date,
    customerName: o.customerName,
    itemCount: o.items.length,
    total: o.total,
    status: o.errors.length ? o.errors.join('; ') : 'OK'
  }))
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    [orders.value, products.value, packaging.value, customers.value] = await Promise.all([
      fetchOrders(true),
      fetchProducts(true),
      fetchPackagingOptions(true),
      fetchCustomers()
    ]);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load data.';
  } finally {
    loading.value = false;
  }
}

function exportCsv() {
  const csv = ordersToCsv(orders.value);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const branch = (branchCtx.current.value?.name ?? 'branch').replace(/\s+/g, '-').toLowerCase();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  a.href = url;
  a.download = `orders-${branch}-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function onFile(f: File | null) {
  plan.value = null;
  notice.value = '';
  error.value = '';
  if (!f) return;
  try {
    const text = await f.text();
    plan.value = planImport(text, {
      products: products.value,
      packaging: packaging.value,
      customers: customers.value,
      existingOrderIds: new Set(orders.value.map((o) => o.id))
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not read the CSV.';
  }
}

async function confirmImport() {
  if (!plan.value) return;
  importing.value = true;
  error.value = '';
  try {
    const result = await runImport(plan.value, customers.value);
    notice.value = `Imported ${result.created} order(s).${result.failed.length ? ` ${result.failed.length} failed.` : ''}`;
    file.value = null;
    plan.value = null;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Import failed.';
  } finally {
    importing.value = false;
  }
}

onMounted(() => {
  void branchCtx.loadBranches();
  void load();
});
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="eyebrow">Orders</div>
        <h1 class="title">Import / Export</h1>
      </div>
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>
    <v-alert v-if="notice" type="success" class="mb-4" closable @click:close="notice = ''">{{ notice }}</v-alert>

    <!-- Export -->
    <v-card class="list-card pa-4 mb-4">
      <div class="section-title mb-1">Export</div>
      <div class="muted text-body-2 mb-3">
        Download this branch's orders as CSV (one row per item). Use it as a backup, or as the template for
        backfilling history — add rows in the same columns and re-import.
      </div>
      <v-btn color="primary" variant="tonal" prepend-icon="mdi-download" :disabled="loading || !orders.length" @click="exportCsv">
        Export orders CSV
      </v-btn>
    </v-card>

    <!-- Import -->
    <v-card class="list-card pa-4">
      <div class="section-title mb-1">Import / backfill</div>
      <div class="muted text-body-2 mb-3">
        Upload a CSV with columns: <code>{{ CSV_COLUMNS.join(', ') }}</code>. Rows sharing an
        <code>order_ref</code> become one order; leave it blank for one order per row. Each imported order is
        recorded as <strong>delivered</strong> on its <code>date</code> and archived (history only). Rows whose
        <code>order_ref</code> already exists are skipped, so re-importing an export won't duplicate.
      </div>

      <v-file-input
        v-model="file"
        label="CSV file"
        accept=".csv,text/csv"
        prepend-icon="mdi-file-delimited-outline"
        density="comfortable"
        hide-details
        @update:model-value="onFile($event as File | null)"
      />

      <template v-if="plan">
        <div class="d-flex ga-2 flex-wrap my-3">
          <v-chip color="success" variant="tonal">{{ plan.importable }} importable</v-chip>
          <v-chip v-if="plan.orders.length - plan.importable > 0" color="error" variant="tonal">
            {{ plan.orders.length - plan.importable }} with errors
          </v-chip>
          <v-chip v-if="plan.skipped > 0" variant="tonal">{{ plan.skipped }} already exist (skipped)</v-chip>
        </div>

        <v-data-table
          :headers="previewHeaders"
          :items="previewRows"
          density="compact"
          :items-per-page="10"
        >
          <template #item.total="{ item }">{{ formatCurrency(item.total) }}</template>
          <template #item.status="{ item }">
            <v-chip v-if="item.status === 'OK'" size="x-small" color="success" variant="tonal">OK</v-chip>
            <span v-else class="text-body-2" style="color: rgb(var(--v-theme-error))">{{ item.status }}</span>
          </template>
        </v-data-table>

        <v-btn
          class="mt-3"
          color="primary"
          prepend-icon="mdi-database-import"
          :loading="importing"
          :disabled="plan.importable === 0"
          @click="confirmImport"
        >
          Import {{ plan.importable }} order(s)
        </v-btn>
      </template>
    </v-card>
  </main>
</template>
