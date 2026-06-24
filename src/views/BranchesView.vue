<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import LocationPicker from '../components/LocationPicker.vue';
import { useBranch } from '../composables/useBranch';
import { formatCurrency } from '../lib/format';
import { createBranch, fetchBranches, updateBranch } from '../services/branches';
import type { Branch } from '../types/models';

const branchCtx = useBranch();
const branches = ref<Branch[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const dialog = ref(false);
const editingId = ref<string | null>(null);
const form = reactive<{
  name: string; address: string; phone: string; delivery_fee: number;
  latitude: number | null; longitude: number | null; is_active: boolean;
}>({ name: '', address: '', phone: '', delivery_fee: 0, latitude: null, longitude: null, is_active: true });

const headers = [
  { title: 'Branch', key: 'name' },
  { title: 'Address', key: 'address' },
  { title: 'Delivery fee', key: 'delivery_fee', width: '130px' },
  { title: 'Status', key: 'is_active', width: '110px' },
  { title: '', key: 'actions', sortable: false, width: '90px' }
];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    branches.value = await fetchBranches();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load branches.';
  } finally {
    loading.value = false;
  }
}

function openAdd() {
  editingId.value = null;
  Object.assign(form, { name: '', address: '', phone: '', delivery_fee: 0, latitude: null, longitude: null, is_active: true });
  error.value = '';
  dialog.value = true;
}

function openEdit(branch: Branch) {
  editingId.value = branch.id;
  Object.assign(form, {
    name: branch.name,
    address: branch.address ?? '',
    phone: branch.phone ?? '',
    delivery_fee: Number(branch.delivery_fee ?? 0),
    latitude: branch.latitude,
    longitude: branch.longitude,
    is_active: branch.is_active
  });
  error.value = '';
  dialog.value = true;
}

async function submit() {
  if (!form.name.trim()) {
    error.value = 'Name is required.';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const values = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      delivery_fee: Number(form.delivery_fee || 0),
      latitude: form.latitude,
      longitude: form.longitude
    };
    if (editingId.value) {
      await updateBranch(editingId.value, { ...values, is_active: form.is_active });
    } else {
      await createBranch(values);
    }
    dialog.value = false;
    await Promise.all([load(), branchCtx.loadBranches(true)]);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not save branch.';
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
        <div class="eyebrow">HQ</div>
        <h1 class="title">Branches</h1>
      </div>
      <div class="d-flex ga-2">
        <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
        <v-btn color="primary" prepend-icon="mdi-store-plus" @click="openAdd">New branch</v-btn>
      </div>
    </div>

    <v-alert v-if="error && !dialog" type="error" class="mb-4">{{ error }}</v-alert>

    <v-card class="list-card">
      <v-data-table
        :headers="headers"
        :items="branches"
        :loading="loading"
        density="comfortable"
        hover
        item-value="id"
      >
        <template #item.name="{ item }">
          <span class="font-weight-bold">{{ item.name }}</span>
        </template>
        <template #item.address="{ item }">
          <span class="muted">{{ item.address || '—' }}</span>
        </template>
        <template #item.delivery_fee="{ item }">
          <span class="muted">{{ formatCurrency(item.delivery_fee) }}</span>
        </template>
        <template #item.is_active="{ item }">
          <v-chip size="x-small" :color="item.is_active ? 'success' : 'default'" variant="tonal">
            {{ item.is_active ? 'Active' : 'Inactive' }}
          </v-chip>
        </template>
        <template #item.actions="{ item }">
          <v-btn icon="mdi-pencil" size="x-small" variant="text" @click="openEdit(item)" />
        </template>
        <template #no-data>
          <div class="pa-6 text-center muted">No branches yet.</div>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="dialog" max-width="440">
      <v-card class="pa-4">
        <div class="section-title mb-4">{{ editingId ? 'Edit branch' : 'New branch' }}</div>
        <div class="stack">
          <v-alert v-if="error" type="error" density="compact">{{ error }}</v-alert>
          <v-text-field v-model="form.name" label="Name" required hide-details />
          <v-text-field v-model="form.address" label="Address (optional)" hide-details />
          <v-text-field v-model="form.phone" label="Phone (optional)" inputmode="tel" hide-details />
          <v-text-field
            v-model.number="form.delivery_fee"
            label="Default delivery fee"
            type="number"
            min="0"
            inputmode="numeric"
            prefix="Rp"
            hint="Used when an order's area has no fee of its own"
            persistent-hint
          />
          <LocationPicker v-model:latitude="form.latitude" v-model:longitude="form.longitude" />
          <div class="muted text-body-2" style="margin-top: -8px">Map center for this branch (areas, deliveries, picking locations).</div>
          <v-switch v-if="editingId" v-model="form.is_active" color="primary" label="Active" hide-details />
        </div>
        <div class="d-flex ga-2 justify-end mt-4">
          <v-btn variant="text" :disabled="saving" @click="dialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" prepend-icon="mdi-content-save" @click="submit">Save</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </main>
</template>
