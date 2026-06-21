<script setup lang="ts">
import { onMounted, reactive, ref, toRefs } from 'vue';
import EmptyState from '../components/EmptyState.vue';
import LocationPicker from '../components/LocationPicker.vue';
import { whatsappUrl } from '../lib/format';
import { fetchCustomers, saveCustomer } from '../services/customers';
import type { Customer } from '../types/models';

const customers = ref<Customer[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const form = reactive<{
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
}>({ id: '', name: '', phone: '', address: '', notes: '', latitude: null, longitude: null });
const { latitude: formLat, longitude: formLng } = toRefs(form);

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

function edit(customer: Customer) {
  Object.assign(form, {
    id: customer.id,
    name: customer.name,
    phone: customer.phone ?? '',
    address: customer.address ?? '',
    notes: customer.notes ?? '',
    latitude: customer.latitude,
    longitude: customer.longitude
  });
}

function reset() {
  Object.assign(form, { id: '', name: '', phone: '', address: '', notes: '', latitude: null, longitude: null });
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
    reset();
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
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <v-card class="list-card pa-4 mb-4">
      <form class="stack" @submit.prevent="submit">
        <v-text-field v-model="form.name" label="Name" required />
        <v-text-field v-model="form.phone" label="Phone" inputmode="tel" />
        <v-textarea v-model="form.address" label="Address" rows="2" />
        <v-textarea v-model="form.notes" label="Notes" rows="2" />
        <LocationPicker v-model:latitude="formLat" v-model:longitude="formLng" />
        <div class="d-flex ga-2">
          <v-btn color="primary" type="submit" :loading="saving" prepend-icon="mdi-content-save">
            Save
          </v-btn>
          <v-btn variant="text" @click="reset">Clear</v-btn>
        </div>
      </form>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />
    <div v-if="customers.length" class="stack">
      <v-card v-for="customer in customers" :key="customer.id" class="list-card pa-4">
        <div class="d-flex align-start justify-space-between ga-3">
          <div>
            <div class="section-title">{{ customer.name }}</div>
            <div class="muted text-body-2">{{ customer.phone || 'No phone' }}</div>
            <div class="mt-2">{{ customer.address }}</div>
            <div v-if="customer.notes" class="muted text-body-2 mt-1">{{ customer.notes }}</div>
          </div>
          <v-btn icon="mdi-pencil" variant="text" @click="edit(customer)" />
        </div>
        <v-btn
          class="mt-3"
          :disabled="!whatsappUrl(customer.phone)"
          :href="whatsappUrl(customer.phone) || undefined"
          target="_blank"
          rel="noopener"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-whatsapp"
        >
          WhatsApp
        </v-btn>
      </v-card>
    </div>
    <EmptyState v-else-if="!loading" icon="mdi-account-group-outline" title="No customers" text="Add a customer to speed up order entry." />
  </main>
</template>

