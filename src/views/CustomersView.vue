<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRefs } from 'vue';
import { useDisplay } from 'vuetify';
import LocationPicker from '../components/LocationPicker.vue';
import { whatsappUrl } from '../lib/format';
import { fetchCustomers, saveCustomer } from '../services/customers';
import type { Customer } from '../types/models';

const { mobile } = useDisplay();
const customers = ref<Customer[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const dialog = ref(false);
const form = reactive<{
  id: string; name: string; phone: string; address: string; notes: string;
  latitude: number | null; longitude: number | null;
}>({ id: '', name: '', phone: '', address: '', notes: '', latitude: null, longitude: null });
const { latitude: formLat, longitude: formLng } = toRefs(form);

const isEditing = computed(() => !!form.id);

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Phone', key: 'phone' },
  { title: 'Address', key: 'address' },
  { title: 'Location', key: 'location', sortable: false, width: '100px' },
  { title: '', key: 'actions', sortable: false, width: '80px' }
];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    customers.value = await fetchCustomers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load customers.';
  } finally {
    loading.value = false;
  }
}

function openAdd() {
  Object.assign(form, { id: '', name: '', phone: '', address: '', notes: '', latitude: null, longitude: null });
  dialog.value = true;
}

function openEdit(customer: Customer) {
  Object.assign(form, {
    id: customer.id,
    name: customer.name,
    phone: customer.phone ?? '',
    address: customer.address ?? '',
    notes: customer.notes ?? '',
    latitude: customer.latitude,
    longitude: customer.longitude
  });
  dialog.value = true;
}

async function submit() {
  saving.value = true;
  error.value = '';
  try {
    await saveCustomer({
      id: form.id || undefined,
      name: form.name,
      phone: form.phone || null,
      address: form.address || null,
      notes: form.notes || null,
      latitude: form.latitude,
      longitude: form.longitude
    });
    dialog.value = false;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not save customer.';
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
        <div class="eyebrow">Address book</div>
        <h1 class="title">Customers</h1>
      </div>
      <div class="d-flex ga-2">
        <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
        <v-btn color="primary" prepend-icon="mdi-account-plus" @click="openAdd">Add</v-btn>
      </div>
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <v-card class="list-card">
      <v-data-table
        :headers="headers"
        :items="customers"
        :loading="loading"
        density="comfortable"
        hover
        item-value="id"
      >
        <template #item.phone="{ item }">
          <span class="muted">{{ item.phone || '—' }}</span>
        </template>

        <template #item.address="{ item }">
          <span class="text-body-2" style="max-width: 220px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
            {{ item.address || '—' }}
          </span>
        </template>

        <template #item.location="{ item }">
          <v-chip v-if="item.latitude !== null" size="x-small" color="success" variant="tonal">
            <v-icon icon="mdi-map-marker" size="12" start /> pinned
          </v-chip>
          <v-chip v-else size="x-small" variant="tonal">no pin</v-chip>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex ga-1">
            <v-btn
              v-if="whatsappUrl(item.phone)"
              :href="whatsappUrl(item.phone) || undefined"
              target="_blank"
              rel="noopener"
              icon="mdi-whatsapp"
              size="x-small"
              variant="text"
              color="success"
            />
            <v-btn icon="mdi-pencil" size="x-small" variant="text" @click="openEdit(item)" />
          </div>
        </template>

        <template #no-data>
          <div class="pa-6 text-center muted">No customers yet. Add one to speed up order entry.</div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Add / Edit dialog -->
    <v-dialog v-model="dialog" :fullscreen="mobile" max-width="560" scrollable>
      <v-card>
        <v-toolbar density="compact" color="surface">
          <v-btn icon="mdi-close" variant="text" @click="dialog = false" />
          <v-toolbar-title class="text-body-1 font-weight-bold">
            {{ isEditing ? 'Edit customer' : 'Add customer' }}
          </v-toolbar-title>
          <template #append>
            <v-btn color="primary" variant="tonal" :loading="saving" @click="submit">Save</v-btn>
          </template>
        </v-toolbar>
        <v-card-text class="pa-4 stack">
          <v-alert v-if="error" type="error" density="compact">{{ error }}</v-alert>
          <v-text-field v-model="form.name" label="Name" required hide-details />
          <v-text-field v-model="form.phone" label="Phone" inputmode="tel" hide-details />
          <v-textarea v-model="form.address" label="Address" rows="2" hide-details />
          <v-textarea v-model="form.notes" label="Notes" rows="2" hide-details />
          <LocationPicker v-model:latitude="formLat" v-model:longitude="formLng" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </main>
</template>
