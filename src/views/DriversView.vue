<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { createDriver, fetchDrivers, setDriverActive } from '../services/profiles';
import type { Profile } from '../types/models';

const drivers = ref<Profile[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const dialog = ref(false);
const form = reactive({ name: '', email: '', password: '', phone: '' });

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Phone', key: 'phone' },
  { title: 'Status', key: 'is_active', width: '110px' },
  { title: '', key: 'actions', sortable: false, width: '130px' }
];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    drivers.value = await fetchDrivers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load drivers.';
  } finally {
    loading.value = false;
  }
}

function openAdd() {
  Object.assign(form, { name: '', email: '', password: '', phone: '' });
  error.value = '';
  dialog.value = true;
}

async function submit() {
  if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
    error.value = 'Name, email, and a password of at least 6 characters are required.';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await createDriver({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim() || null
    });
    notice.value = `Driver ${form.email.trim()} created.`;
    dialog.value = false;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not create driver.';
  } finally {
    saving.value = false;
  }
}

async function toggleActive(driver: Profile) {
  await setDriverActive(driver.id, !driver.is_active);
  await load();
}

onMounted(load);
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="eyebrow">Team</div>
        <h1 class="title">Drivers</h1>
      </div>
      <div class="d-flex ga-2">
        <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
        <v-btn color="primary" prepend-icon="mdi-account-plus" @click="openAdd">Add driver</v-btn>
      </div>
    </div>

    <v-alert v-if="error && !dialog" type="error" class="mb-4">{{ error }}</v-alert>
    <v-alert v-if="notice" type="success" class="mb-4" closable @click:close="notice = ''">{{ notice }}</v-alert>

    <v-card class="list-card">
      <v-data-table
        :headers="headers"
        :items="drivers"
        :loading="loading"
        density="comfortable"
        hover
        item-value="id"
      >
        <template #item.name="{ item }">
          <span class="font-weight-bold">{{ item.name || 'Driver' }}</span>
        </template>

        <template #item.phone="{ item }">
          <span class="muted">{{ item.phone || '—' }}</span>
        </template>

        <template #item.is_active="{ item }">
          <v-chip size="x-small" :color="item.is_active ? 'success' : 'default'" variant="tonal">
            {{ item.is_active ? 'Active' : 'Inactive' }}
          </v-chip>
        </template>

        <template #item.actions="{ item }">
          <v-btn
            :color="item.is_active ? 'error' : 'success'"
            variant="tonal"
            size="x-small"
            @click="toggleActive(item)"
          >
            {{ item.is_active ? 'Deactivate' : 'Activate' }}
          </v-btn>
        </template>

        <template #no-data>
          <div class="pa-6 text-center muted">No drivers yet. Add a driver to assign deliveries.</div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Add driver dialog -->
    <v-dialog v-model="dialog" max-width="440">
      <v-card class="pa-4">
        <div class="section-title mb-4">Add driver</div>
        <div class="stack">
          <v-alert v-if="error" type="error" density="compact">{{ error }}</v-alert>
          <v-text-field v-model="form.name" label="Name" required hide-details />
          <v-text-field v-model="form.email" label="Email" type="email" autocomplete="off" required hide-details />
          <v-text-field v-model="form.password" label="Password (min 6 chars)" type="text" autocomplete="new-password" required hide-details />
          <v-text-field v-model="form.phone" label="Phone (optional)" inputmode="tel" hide-details />
        </div>
        <div class="d-flex ga-2 justify-end mt-4">
          <v-btn variant="text" :disabled="saving" @click="dialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" prepend-icon="mdi-account-plus" @click="submit">Create</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </main>
</template>
