<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { formatCurrency } from '../lib/format';
import { deleteProduct, fetchProducts, saveProduct } from '../services/products';
import type { Product } from '../types/models';

const products = ref<Product[]>([]);
const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const error = ref('');
const dialog = ref(false);
const toDelete = ref<Product | null>(null);
const form = reactive({ id: '', name: '', description: '', price: 0, is_active: true });

const isEditing = computed(() => !!form.id);

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Price', key: 'price', align: 'end' as const, width: '120px' },
  { title: 'Status', key: 'is_active', width: '100px' },
  { title: 'Description', key: 'description' },
  { title: '', key: 'actions', sortable: false, width: '80px' }
];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    products.value = await fetchProducts(true);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load products.';
  } finally {
    loading.value = false;
  }
}

function openAdd() {
  Object.assign(form, { id: '', name: '', description: '', price: 0, is_active: true });
  dialog.value = true;
}

function openEdit(product: Product) {
  Object.assign(form, {
    id: product.id,
    name: product.name,
    description: product.description ?? '',
    price: Number(product.price),
    is_active: product.is_active
  });
  dialog.value = true;
}

async function submit() {
  saving.value = true;
  error.value = '';
  try {
    await saveProduct({
      id: form.id || undefined,
      name: form.name,
      description: form.description || null,
      price: Number(form.price),
      is_active: form.is_active
    });
    dialog.value = false;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not save product.';
  } finally {
    saving.value = false;
  }
}

async function confirmDelete() {
  if (!toDelete.value) return;
  deleting.value = true;
  error.value = '';
  try {
    await deleteProduct(toDelete.value.id);
    toDelete.value = null;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not delete product.';
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="eyebrow">Catalog</div>
        <h1 class="title">Products</h1>
      </div>
      <div class="d-flex ga-2">
        <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openAdd">Add</v-btn>
      </div>
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <v-card class="list-card">
      <v-data-table
        :headers="headers"
        :items="products"
        :loading="loading"
        density="comfortable"
        hover
        item-value="id"
      >
        <template #item.price="{ item }">
          <span class="font-weight-bold">{{ formatCurrency(item.price) }}</span>
        </template>

        <template #item.is_active="{ item }">
          <v-chip size="x-small" :color="item.is_active ? 'success' : 'default'" variant="tonal">
            {{ item.is_active ? 'Active' : 'Inactive' }}
          </v-chip>
        </template>

        <template #item.description="{ item }">
          <span class="muted text-body-2">{{ item.description || '—' }}</span>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex ga-1">
            <v-btn icon="mdi-pencil" size="x-small" variant="text" @click="openEdit(item)" />
            <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error" @click="toDelete = item" />
          </div>
        </template>

        <template #no-data>
          <div class="pa-6 text-center muted">No products yet. Add products before creating orders.</div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Add / Edit dialog -->
    <v-dialog v-model="dialog" max-width="480">
      <v-card class="pa-4">
        <div class="section-title mb-4">{{ isEditing ? 'Edit product' : 'Add product' }}</div>
        <div class="stack">
          <v-alert v-if="error" type="error" density="compact">{{ error }}</v-alert>
          <v-text-field v-model="form.name" label="Product name" required hide-details />
          <v-textarea v-model="form.description" label="Description" rows="2" hide-details />
          <v-text-field
            v-model.number="form.price"
            label="Price"
            type="number"
            min="0"
            inputmode="numeric"
            prefix="Rp"
            required
            hide-details
          />
          <v-switch v-model="form.is_active" color="primary" label="Active" hide-details />
        </div>
        <div class="d-flex ga-2 justify-end mt-4">
          <v-btn variant="text" :disabled="saving" @click="dialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" prepend-icon="mdi-content-save" @click="submit">Save</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Delete confirm -->
    <v-dialog :model-value="toDelete !== null" max-width="420" @update:model-value="toDelete = null">
      <v-card class="pa-4">
        <div class="section-title mb-2">Delete product?</div>
        <p class="mb-1">Remove <strong>{{ toDelete?.name }}</strong> from the catalog.</p>
        <p class="muted text-body-2 mb-4">Past orders keep their saved name and price.</p>
        <div class="d-flex ga-2 justify-end">
          <v-btn variant="text" :disabled="deleting" @click="toDelete = null">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" prepend-icon="mdi-delete" @click="confirmDelete">Delete</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </main>
</template>
