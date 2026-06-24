<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { mapCenter } from '../lib/branchContext';
import { loadGoogleMaps } from '../lib/maps';
import { parseLatLng } from '../lib/route';

defineProps<{ areaLabel?: string | null; areaUnknown?: boolean }>();

const latitude = defineModel<number | null>('latitude', { default: null });
const longitude = defineModel<number | null>('longitude', { default: null });

const pasteValue = ref('');
const locating = ref(false);
const hint = ref('');
const showMap = ref(false);
const mapEl = ref<HTMLElement | null>(null);
const mapError = ref('');

let maps: typeof google.maps | null = null;
let map: google.maps.Map | null = null;
let marker: google.maps.Marker | null = null;

function setPoint(lat: number, lng: number) {
  latitude.value = Number(lat.toFixed(6));
  longitude.value = Number(lng.toFixed(6));
}

function syncMarker(lat: number, lng: number) {
  if (!maps || !map) return;
  if (!marker) {
    marker = new maps.Marker({ map, position: { lat, lng }, draggable: true });
    marker.addListener('dragend', () => {
      const p = marker?.getPosition();
      if (p) setPoint(p.lat(), p.lng());
    });
  } else {
    marker.setPosition({ lat, lng });
  }
}

function clearPoint() {
  latitude.value = null;
  longitude.value = null;
  hint.value = '';
  if (marker) {
    marker.setMap(null);
    marker = null;
  }
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

async function initMap() {
  try {
    maps = await loadGoogleMaps();
    await nextTick();
    if (!mapEl.value) return;
    const hasPoint = latitude.value !== null && longitude.value !== null;
    map = new maps.Map(mapEl.value, {
      center: hasPoint ? { lat: latitude.value as number, lng: longitude.value as number } : mapCenter(),
      zoom: hasPoint ? 16 : 12,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      clickableIcons: false
    });
    if (hasPoint) syncMarker(latitude.value as number, longitude.value as number);
    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) setPoint(e.latLng.lat(), e.latLng.lng());
    });
  } catch (err) {
    mapError.value = err instanceof Error ? err.message : 'Could not load the map.';
  }
}

async function toggleMap() {
  showMap.value = !showMap.value;
  if (showMap.value && !map) await initMap();
}

// Keep the marker in sync when the point changes from GPS / paste / tap.
watch([latitude, longitude], ([lat, lng]) => {
  if (!map || lat === null || lng === null) return;
  const pos = marker?.getPosition();
  if (pos && Math.abs(pos.lat() - lat) < 1e-6 && Math.abs(pos.lng() - lng) < 1e-6) return;
  syncMarker(lat, lng);
  map.panTo({ lat, lng });
});

onBeforeUnmount(() => {
  if (marker) marker.setMap(null);
});
</script>

<template>
  <div class="stack">
    <div class="d-flex align-center justify-space-between">
      <div class="section-title">Delivery location</div>
      <div class="d-flex align-center ga-2">
        <v-chip v-if="areaLabel" color="primary" size="small" variant="tonal">{{ areaLabel }}</v-chip>
        <v-chip v-else-if="areaUnknown" color="warning" size="small" variant="tonal">Outside zones</v-chip>
        <v-chip v-if="latitude !== null && longitude !== null" color="success" size="small" variant="tonal">
          <v-icon icon="mdi-map-marker-check" size="16" start /> Set
        </v-chip>
      </div>
    </div>

    <div class="d-flex ga-2">
      <v-btn
        color="primary"
        variant="tonal"
        prepend-icon="mdi-crosshairs-gps"
        :loading="locating"
        class="flex-grow-1"
        @click="useCurrentLocation"
      >
        My location
      </v-btn>
      <v-btn
        :color="showMap ? 'primary' : undefined"
        :variant="showMap ? 'flat' : 'tonal'"
        prepend-icon="mdi-map-marker-radius"
        class="flex-grow-1"
        @click="toggleMap"
      >
        Pick on map
      </v-btn>
    </div>

    <div v-show="showMap">
      <div class="muted text-body-2 mb-1">Tap the map to drop a pin, drag it to adjust.</div>
      <div v-if="mapError" class="text-body-2 mb-1" style="color: rgb(var(--v-theme-error))">{{ mapError }}</div>
      <div ref="mapEl" class="pick-map" />
    </div>

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

    <div v-if="hint" class="text-body-2" style="color: rgb(var(--v-theme-error))">{{ hint }}</div>
  </div>
</template>

<style scoped>
.pick-map {
  width: 100%;
  height: 260px;
  border-radius: 12px;
  overflow: hidden;
}
</style>
