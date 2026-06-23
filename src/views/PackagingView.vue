<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { formatCurrency } from '../lib/format';
import { deletePackagingOption, fetchPackagingOptions, savePackagingOption } from '../services/packaging';
import type { PackagingOption } from '../types/models';

const options = ref<PackagingOption[]>([]);
const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const error = ref('');
const dialog = ref(false);
const toDelete = ref<PackagingOption | null>(null);
const form = reactive({ id: '', name: '', price: 0, is_active: true, is_default: false });

const isEditing = computed(() => !!form.id);

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Extra charge', key: 'price', align: 'end' as const, width: '130px' },
  { title: 'Default', key: 'is_default', width: '90px', sortable: false },
  { title: 'Status', key: 'is_active', width: '100px' },
  { title: '', key: 'actions', sortable: false, width: '80px' }
];

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

function openAdd() {
  Object.assign(form, { id: '', name: '', price: 0, is_active: true, is_default: false });
  dialog.value = true;
}

function openEdit(option: PackagingOption) {
  Object.assign(form, {
    id: option.id,
    name: option.name,
    price: Number(option.price),
    is_active: option.is_active,
    is_default: option.is_default
  });
  dialog.value = true;
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
    dialog.value = false;
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
      <div class="d-flex ga-2">
        <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openAdd">Add</v-btn>
      </div>
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <v-card class="list-card">
      <v-data-table
        :headers="headers"
        :items="options"
        :loading="loading"
        density="comfortable"
        hover
        item-value="id"
      >
        <template #item.price="{ item }">
          <span class="font-weight-bold">
            {{ item.price > 0 ? `+ ${formatCurrency(item.price)}` : '—' }}
          </span>
        </template>

        <template #item.is_default="{ item }">
          <v-chip v-if="item.is_default" size="x-small" color="primary" variant="tonal">Default</v-chip>
        </template>

        <template #item.is_active="{ item }">
          <v-chip size="x-small" :color="item.is_active ? 'success' : 'default'" variant="tonal">
            {{ item.is_active ? 'Active' : 'Inactive' }}
          </v-chip>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex ga-1">
            <v-btn icon="mdi-pencil" size="x-small" variant="text" @click="openEdit(item)" />
            <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error" @click="toDelete = item" />
          </div>
        </template>

        <template #no-data>
          <div class="pa-6 text-center muted">No packaging options. Add options like Plastik or Botol.</div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Add / Edit dialog -->
    <v-dialog v-model="dialog" max-width="420">
      <v-card class="pa-4">
        <div class="section-title mb-4">{{ isEditing ? 'Edit packaging' : 'Add packaging' }}</div>
        <div class="stack">
          <v-alert v-if="error" type="error" density="compact">{{ error }}</v-alert>
          <v-text-field v-model="form.name" label="Name" placeholder="e.g. Botol" required hide-details />
          <v-text-field
            v-model.number="form.price"
            label="Extra charge per unit"
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
