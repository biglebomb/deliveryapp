<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatCurrency } from '../lib/format';
import { fetchBranches } from '../services/branches';
import type { Branch } from '../types/models';

const router = useRouter();
const branches = ref<Branch[]>([]);
const loading = ref(true);
const error = ref('');

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
        <v-btn color="primary" prepend-icon="mdi-store-plus" to="/branches/new">New branch</v-btn>
      </div>
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <v-card class="list-card">
      <v-data-table
        :headers="headers"
        :items="branches"
        :loading="loading"
        density="comfortable"
        hover
        item-value="id"
        @click:row="(_e: unknown, { item }: { item: Branch }) => router.push(`/branches/${item.id}/edit`)"
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
          <v-btn icon="mdi-pencil" size="x-small" variant="text" :to="`/branches/${item.id}/edit`" />
        </template>
        <template #no-data>
          <div class="pa-6 text-center muted">No branches yet.</div>
        </template>
      </v-data-table>
    </v-card>
  </main>
</template>
