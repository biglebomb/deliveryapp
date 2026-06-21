<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import EmptyState from '../components/EmptyState.vue';
import { createDriver, fetchDrivers, setDriverActive } from '../services/profiles';
import type { Profile } from '../types/models';

const drivers = ref<Profile[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const form = reactive({ name: '', email: '', password: '', phone: '' });

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

async function submit() {
  if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
    error.value = 'Name, email, and a password of at least 6 characters are required.';
    return;
  }
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    await createDriver({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim() || null
    });
    notice.value = `Driver ${form.email.trim()} created.`;
    Object.assign(form, { name: '', email: '', password: '', phone: '' });
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
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>
    <v-alert v-if="notice" type="success" class="mb-4">{{ notice }}</v-alert>

    <v-card class="list-card pa-4 mb-4">
      <form class="stack" @submit.prevent="submit">
        <div class="section-title">Add driver</div>
        <v-text-field v-model="form.name" label="Name" hide-details required />
        <v-text-field v-model="form.email" label="Email" type="email" autocomplete="off" hide-details required />
        <v-text-field v-model="form.password" label="Password (min 6 chars)" type="text" autocomplete="new-password" hide-details required />
        <v-text-field v-model="form.phone" label="Phone (optional)" inputmode="tel" hide-details />
        <v-btn color="primary" type="submit" :loading="saving" prepend-icon="mdi-account-plus">Create driver</v-btn>
      </form>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />
    <div v-if="drivers.length" class="stack">
      <v-card v-for="driver in drivers" :key="driver.id" class="list-card pa-4">
        <div class="d-flex align-center justify-space-between ga-3">
          <div>
            <div class="section-title">{{ driver.name || 'Driver' }}</div>
            <div class="muted text-body-2">{{ driver.phone || 'No phone' }}</div>
            <v-chip size="small" class="mt-2" :color="driver.is_active ? 'success' : 'default'">
              {{ driver.is_active ? 'active' : 'inactive' }}
            </v-chip>
          </div>
          <v-btn
            :color="driver.is_active ? 'error' : 'success'"
            variant="tonal"
            size="small"
            @click="toggleActive(driver)"
          >
            {{ driver.is_active ? 'Deactivate' : 'Activate' }}
          </v-btn>
        </div>
      </v-card>
    </div>
    <EmptyState v-else-if="!loading" icon="mdi-account-hard-hat" title="No drivers yet" text="Add a driver so you can assign deliveries." />
  </main>
</template>
