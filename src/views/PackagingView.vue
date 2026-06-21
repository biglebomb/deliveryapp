<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import EmptyState from '../components/EmptyState.vue';
import { formatCurrency } from '../lib/format';
import { deletePackagingOption, fetchPackagingOptions, savePackagingOption } from '../services/packaging';
import type { PackagingOption } from '../types/models';

const options = ref<PackagingOption[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const form = reactive({ id: '', name: '', price: 0, is_active: true, is_default: false });
const toDelete = ref<PackagingOption | null>(null);
const deleting = ref(false);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    options.value = await fetchPackagingOptions(true);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load packaging.';
  } finally {
    loading.value = false;
  }
}

function edit(option: PackagingOption) {
  Object.assign(form, {
    id: option.id,
    name: option.name,
    price: Number(option.price),
    is_active: option.is_active,
    is_default: option.is_default
  });
}

function reset() {
  Object.assign(form, { id: '', name: '', price: 0, is_active: true, is_default: false });
}

async function submit() {
  saving.value = true;
  error.value = '';
  try {
    await savePackagingOption({
      id: form.id || undefined,
      name: form.name,
      price: Number(form.price),
      is_active: form.is_active,
      is_default: form.is_default
    });
    reset();
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not save packaging.';
  } finally {
    saving.value = false;
  }
}

async function confirmDelete() {
  if (!toDelete.value) return;
  deleting.value = true;
  error.value = '';
  try {
    await deletePackagingOption(toDelete.value.id);
    if (form.id === toDelete.value.id) reset();
    toDelete.value = null;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not delete packaging.';
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
        <h1 class="title">Packaging</h1>
      </div>
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <v-card class="list-card pa-4 mb-4">
      <form class="stack" @submit.prevent="submit">
        <div class="section-title">{{ form.id ? 'Edit option' : 'New option' }}</div>
        <v-text-field v-model="form.name" label="Name" placeholder="e.g. Botol" required hide-details />
        <v-text-field
          v-model.number="form.price"
          label="Extra charge (per unit)"
          type="number"
          min="0"
          inputmode="numeric"
          prefix="Rp"
          hide-details
        />
        <div class="d-flex ga-4">
          <v-switch v-model="form.is_active" color="primary" label="Active" hide-details />
          <v-switch v-model="form.is_default" color="primary" label="Default" hide-details />
        </div>
        <div class="d-flex ga-2">
          <v-btn color="primary" type="submit" :loading="saving" prepend-icon="mdi-content-save">Save</v-btn>
          <v-btn variant="text" @click="reset">Clear</v-btn>
        </div>
      </form>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />
    <div v-if="options.length" class="stack">
      <v-card v-for="option in options" :key="option.id" class="list-card pa-4">
        <div class="d-flex align-start justify-space-between ga-3">
          <div>
            <div class="section-title">
              {{ option.name }}
              <v-chip v-if="option.is_default" size="x-small" color="primary" variant="tonal" class="ml-1">default</v-chip>
            </div>
            <div class="font-weight-bold mt-1">
              {{ option.price > 0 ? `+ ${formatCurrency(option.price)}` : 'No extra charge' }}
            </div>
            <v-chip size="small" class="mt-2" :color="option.is_active ? 'success' : 'default'">
              {{ option.is_active ? 'active' : 'inactive' }}
            </v-chip>
          </div>
          <div class="d-flex">
            <v-btn icon="mdi-pencil" variant="text" @click="edit(option)" />
            <v-btn icon="mdi-delete-outline" variant="text" color="error" @click="toDelete = option" />
          </div>
        </div>
      </v-card>
    </div>
    <EmptyState v-else-if="!loading" icon="mdi-package-variant" title="No packaging options" text="Add options like Plastik or Botol with their extra charge." />

    <v-dialog :model-value="toDelete !== null" max-width="420" @update:model-value="toDelete = null">
      <v-card class="pa-4">
        <div class="section-title mb-2">Delete packaging?</div>
        <p class="mb-4">Remove <strong>{{ toDelete?.name }}</strong>. Past orders keep their saved packaging label and fee.</p>
        <div class="d-flex ga-2 justify-end">
          <v-btn variant="text" :disabled="deleting" @click="toDelete = null">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" prepend-icon="mdi-delete" @click="confirmDelete">Delete</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </main>
</template>
