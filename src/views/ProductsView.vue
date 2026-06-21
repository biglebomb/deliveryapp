<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import EmptyState from '../components/EmptyState.vue';
import { formatCurrency } from '../lib/format';
import { fetchProducts, saveProduct } from '../services/products';
import type { Product } from '../types/models';

const products = ref<Product[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const form = reactive({ id: '', name: '', description: '', price: 0, is_active: true });

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

function edit(product: Product) {
  Object.assign(form, {
    id: product.id,
    name: product.name,
    description: product.description ?? '',
    price: Number(product.price),
    is_active: product.is_active
  });
}

function reset() {
  Object.assign(form, { id: '', name: '', description: '', price: 0, is_active: true });
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
    reset();
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not save product.';
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
        <div class="eyebrow">Catalog</div>
        <h1 class="title">Products</h1>
      </div>
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <v-card class="list-card pa-4 mb-4">
      <form class="stack" @submit.prevent="submit">
        <v-text-field v-model="form.name" label="Product name" required />
        <v-textarea v-model="form.description" label="Description" rows="2" />
        <v-text-field v-model.number="form.price" label="Price" type="number" min="0" inputmode="numeric" required />
        <v-switch v-model="form.is_active" color="primary" label="Active" hide-details />
        <div class="d-flex ga-2">
          <v-btn color="primary" type="submit" :loading="saving" prepend-icon="mdi-content-save">
            Save
          </v-btn>
          <v-btn variant="text" @click="reset">Clear</v-btn>
        </div>
      </form>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />
    <div v-if="products.length" class="stack">
      <v-card v-for="product in products" :key="product.id" class="list-card pa-4">
        <div class="d-flex align-start justify-space-between ga-3">
          <div>
            <div class="section-title">{{ product.name }}</div>
            <div class="font-weight-bold mt-1">{{ formatCurrency(product.price) }}</div>
            <div v-if="product.description" class="muted text-body-2 mt-1">{{ product.description }}</div>
            <v-chip size="small" class="mt-2" :color="product.is_active ? 'success' : 'default'">
              {{ product.is_active ? 'active' : 'inactive' }}
            </v-chip>
          </div>
          <v-btn icon="mdi-pencil" variant="text" @click="edit(product)" />
        </div>
      </v-card>
    </div>
    <EmptyState v-else-if="!loading" icon="mdi-bottle-tonic-outline" title="No products" text="Add products before creating orders." />
  </main>
</template>

