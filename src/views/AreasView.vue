<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import AreaEditorMap from '../components/AreaEditorMap.vue';
import EmptyState from '../components/EmptyState.vue';
import { deleteArea, fetchAreas, saveArea } from '../services/areas';
import type { Area, AreaPoint } from '../types/models';

const colors = ['#0f766e', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#16a34a'];

const areas = ref<Area[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const form = reactive<{ id: string; name: string; color: string; polygon: AreaPoint[] }>({
  id: '',
  name: '',
  color: colors[0],
  polygon: []
});
const areaToDelete = ref<Area | null>(null);
const deleting = ref(false);

// Which saved areas are overlaid on the editor map.
const shownIds = ref<string[]>([]);
const overlays = computed(() =>
  areas.value
    .filter((a) => shownIds.value.includes(a.id) && a.id !== form.id)
    .map((a) => ({ id: a.id, color: a.color, polygon: a.polygon }))
);
const allShown = computed({
  get: () => areas.value.length > 0 && shownIds.value.length === areas.value.length,
  set: (value: boolean) => {
    shownIds.value = value ? areas.value.map((a) => a.id) : [];
  }
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    areas.value = await fetchAreas();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load areas.';
  } finally {
    loading.value = false;
  }
}

function edit(area: Area) {
  Object.assign(form, {
    id: area.id,
    name: area.name,
    color: area.color ?? colors[0],
    polygon: area.polygon.map((p) => ({ ...p }))
  });
}

function reset() {
  Object.assign(form, { id: '', name: '', color: colors[0], polygon: [] });
}

async function submit() {
  if (!form.name.trim() || form.polygon.length < 3) {
    error.value = 'Give the area a name and draw at least 3 points.';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await saveArea({
      id: form.id || undefined,
      name: form.name.trim(),
      color: form.color,
      polygon: form.polygon
    });
    reset();
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not save area.';
  } finally {
    saving.value = false;
  }
}

async function confirmDelete() {
  if (!areaToDelete.value) return;
  deleting.value = true;
  error.value = '';
  try {
    await deleteArea(areaToDelete.value.id);
    if (form.id === areaToDelete.value.id) reset();
    areaToDelete.value = null;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not delete area.';
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
        <div class="eyebrow">Delivery zones</div>
        <h1 class="title">Areas</h1>
      </div>
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <v-card class="list-card pa-4 mb-4">
      <form class="stack" @submit.prevent="submit">
        <div class="section-title">{{ form.id ? 'Edit area' : 'New area' }}</div>
        <v-text-field v-model="form.name" label="Area name" placeholder="e.g. North Jakarta" hide-details required />

        <div class="d-flex align-center ga-2">
          <span class="muted text-body-2">Color</span>
          <v-btn
            v-for="c in colors"
            :key="c"
            icon
            size="x-small"
            :style="{ backgroundColor: c, border: form.color === c ? '3px solid #0f172a' : 'none' }"
            @click="form.color = c"
          />
        </div>

        <AreaEditorMap v-model="form.polygon" :color="form.color" :overlays="overlays" />

        <div class="d-flex ga-2">
          <v-btn color="primary" type="submit" :loading="saving" :disabled="!form.name || form.polygon.length < 3" prepend-icon="mdi-content-save">
            Save area
          </v-btn>
          <v-btn variant="text" @click="reset">Clear</v-btn>
        </div>
      </form>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />
    <div v-if="areas.length" class="stack">
      <div class="d-flex align-center justify-space-between px-1">
        <span class="section-title">Saved areas</span>
        <v-switch v-model="allShown" color="primary" label="Show all on map" density="compact" hide-details inset />
      </div>
      <v-card v-for="area in areas" :key="area.id" class="list-card pa-4">
        <div class="d-flex align-center justify-space-between ga-3">
          <div class="d-flex align-center ga-3">
            <v-checkbox v-model="shownIds" :value="area.id" color="primary" hide-details density="compact" />
            <v-avatar size="20" :style="{ backgroundColor: area.color ?? '#0f766e' }" />
            <div>
              <div class="section-title">{{ area.name }}</div>
              <div class="muted text-body-2">{{ area.polygon.length }} points</div>
            </div>
          </div>
          <div class="d-flex">
            <v-btn icon="mdi-pencil" variant="text" @click="edit(area)" />
            <v-btn icon="mdi-delete-outline" variant="text" color="error" @click="areaToDelete = area" />
          </div>
        </div>
      </v-card>
    </div>
    <EmptyState v-else-if="!loading" icon="mdi-vector-polygon" title="No areas yet" text="Draw a delivery zone to auto-assign orders by location." />

    <v-dialog :model-value="areaToDelete !== null" max-width="420" @update:model-value="areaToDelete = null">
      <v-card class="pa-4">
        <div class="section-title mb-2">Delete area?</div>
        <p class="mb-4">Remove <strong>{{ areaToDelete?.name }}</strong>. Existing orders keep their saved area label.</p>
        <div class="d-flex ga-2 justify-end">
          <v-btn variant="text" :disabled="deleting" @click="areaToDelete = null">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" prepend-icon="mdi-delete" @click="confirmDelete">Delete</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </main>
</template>
