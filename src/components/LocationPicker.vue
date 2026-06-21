<script setup lang="ts">
import { ref } from 'vue';
import { parseLatLng } from '../lib/route';

const latitude = defineModel<number | null>('latitude', { default: null });
const longitude = defineModel<number | null>('longitude', { default: null });
const area = defineModel<string | null>('area', { default: null });

const areaOptions = ['Area A', 'Area B'];
const pasteValue = ref('');
const locating = ref(false);
const hint = ref('');

function setPoint(lat: number, lng: number) {
  latitude.value = Number(lat.toFixed(6));
  longitude.value = Number(lng.toFixed(6));
}

function clearPoint() {
  latitude.value = null;
  longitude.value = null;
  hint.value = '';
}

function useCurrentLocation() {
  if (!('geolocation' in navigator)) {
    hint.value = 'This device has no location support.';
    return;
  }
  locating.value = true;
  hint.value = '';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setPoint(pos.coords.latitude, pos.coords.longitude);
      locating.value = false;
    },
    (err) => {
      hint.value = err.code === err.PERMISSION_DENIED ? 'Location permission denied.' : 'Could not get location.';
      locating.value = false;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function applyPaste() {
  const point = parseLatLng(pasteValue.value);
  if (!point) {
    hint.value = 'Paste "lat,lng" or a Google Maps link.';
    return;
  }
  setPoint(point.lat, point.lng);
  pasteValue.value = '';
  hint.value = '';
}
</script>

<template>
  <div class="stack">
    <div class="d-flex align-center justify-space-between">
      <div class="section-title">Delivery location</div>
      <v-chip v-if="latitude !== null && longitude !== null" color="success" size="small" variant="tonal">
        <v-icon icon="mdi-map-marker-check" size="16" start /> Set
      </v-chip>
    </div>

    <v-btn
      color="primary"
      variant="tonal"
      prepend-icon="mdi-crosshairs-gps"
      :loading="locating"
      block
      @click="useCurrentLocation"
    >
      Use my current location
    </v-btn>

    <div class="d-flex align-center ga-2">
      <v-text-field
        v-model="pasteValue"
        label="Paste lat,lng or Maps link"
        density="comfortable"
        hide-details
        @keyup.enter="applyPaste"
      />
      <v-btn icon="mdi-check" variant="tonal" :disabled="!pasteValue" @click="applyPaste" />
    </div>

    <div v-if="latitude !== null && longitude !== null" class="d-flex align-center justify-space-between muted text-body-2">
      <span>{{ latitude }}, {{ longitude }}</span>
      <v-btn variant="text" size="small" color="error" @click="clearPoint">Clear</v-btn>
    </div>

    <v-select v-model="area" :items="areaOptions" label="Delivery area" clearable hide-details />

    <div v-if="hint" class="text-body-2" style="color: rgb(var(--v-theme-error))">{{ hint }}</div>
  </div>
</template>
