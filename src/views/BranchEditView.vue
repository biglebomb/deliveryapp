<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import LocationPicker from '../components/LocationPicker.vue';
import { useBranch } from '../composables/useBranch';
import { createBranch, fetchBranch, updateBranch } from '../services/branches';

const route = useRoute();
const router = useRouter();
const branchCtx = useBranch();

const branchId = route.params.id as string | undefined;
const isEdit = Boolean(branchId);

const loading = ref(isEdit);
const saving = ref(false);
const error = ref('');

const form = reactive<{
  name: string; address: string; phone: string; delivery_fee: number;
  latitude: number | null; longitude: number | null; is_active: boolean;
  reimburse_per_km: number; reimburse_per_delivery: number; reimburse_per_unit: number; reimburse_revenue_pct: number;
}>({
  name: '', address: '', phone: '', delivery_fee: 0, latitude: null, longitude: null, is_active: true,
  reimburse_per_km: 0, reimburse_per_delivery: 0, reimburse_per_unit: 0, reimburse_revenue_pct: 0
});

async function load() {
  if (!branchId) return;
  loading.value = true;
  error.value = '';
  try {
    const branch = await fetchBranch(branchId);
    Object.assign(form, {
      name: branch.name,
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      delivery_fee: Number(branch.delivery_fee ?? 0),
      latitude: branch.latitude,
      longitude: branch.longitude,
      is_active: branch.is_active,
      reimburse_per_km: Number(branch.reimburse_per_km ?? 0),
      reimburse_per_delivery: Number(branch.reimburse_per_delivery ?? 0),
      reimburse_per_unit: Number(branch.reimburse_per_unit ?? 0),
      reimburse_revenue_pct: Number(branch.reimburse_revenue_pct ?? 0)
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load branch.';
  } finally {
    loading.value = false;
  }
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
    if (branchId) {
      await updateBranch(branchId, {
        ...values,
        is_active: form.is_active,
        reimburse_per_km: Number(form.reimburse_per_km || 0),
        reimburse_per_delivery: Number(form.reimburse_per_delivery || 0),
        reimburse_per_unit: Number(form.reimburse_per_unit || 0),
        reimburse_revenue_pct: Number(form.reimburse_revenue_pct || 0)
      });
    } else {
      await createBranch(values);
    }
    await branchCtx.loadBranches(true);
    await router.push('/branches');
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
        <div class="eyebrow">HQ · Branches</div>
        <h1 class="title">{{ isEdit ? 'Edit branch' : 'New branch' }}</h1>
      </div>
      <v-btn icon="mdi-close" variant="text" @click="router.push('/branches')" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <form v-if="!loading" class="stack" @submit.prevent="submit">
      <!-- Details -->
      <v-card class="list-card pa-4">
        <div class="section-title mb-3">Details</div>
        <div class="stack">
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
          <v-switch v-if="isEdit" v-model="form.is_active" color="primary" label="Active" hide-details />
        </div>
      </v-card>

      <!-- Location -->
      <v-card class="list-card pa-4">
        <div class="section-title mb-1">Map center</div>
        <div class="muted text-body-2 mb-3">Where maps open for this branch — areas, deliveries, picking locations.</div>
        <LocationPicker v-model:latitude="form.latitude" v-model:longitude="form.longitude" />
      </v-card>

      <!-- Reimbursement -->
      <v-card v-if="isEdit" class="list-card pa-4">
        <div class="section-title mb-1">Driver reimbursement</div>
        <div class="muted text-body-2 mb-3">Per period, a driver earns the sum of these. Set any to 0 to disable.</div>
        <div class="grid cols-2">
          <v-text-field v-model.number="form.reimburse_per_km" label="Per km" type="number" min="0" prefix="Rp" hide-details />
          <v-text-field v-model.number="form.reimburse_per_delivery" label="Per delivery" type="number" min="0" prefix="Rp" hide-details />
          <v-text-field v-model.number="form.reimburse_per_unit" label="Per unit sold" type="number" min="0" prefix="Rp" hide-details />
          <v-text-field v-model.number="form.reimburse_revenue_pct" label="Of revenue" type="number" min="0" step="0.1" suffix="%" hide-details />
        </div>
      </v-card>

      <v-card class="list-card pa-4 position-sticky" style="bottom: 72px; z-index: 2">
        <div class="d-flex ga-2 justify-end">
          <v-btn variant="text" :disabled="saving" @click="router.push('/branches')">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" prepend-icon="mdi-content-save" type="submit">Save</v-btn>
        </div>
      </v-card>
    </form>
  </main>
</template>
