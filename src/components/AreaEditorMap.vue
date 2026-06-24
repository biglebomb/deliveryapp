<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { mapCenter } from '../lib/branchContext';
import { loadGoogleMaps } from '../lib/maps';
import type { AreaPoint } from '../types/models';

const props = withDefaults(
  defineProps<{
    color?: string;
    overlays?: Array<{ id: string; color: string | null; polygon: AreaPoint[] }>;
  }>(),
  { color: '#0f766e', overlays: () => [] }
);
const path = defineModel<AreaPoint[]>({ default: () => [] });

const mapEl = ref<HTMLElement | null>(null);
const error = ref('');
const pointCount = ref(0);

let maps: typeof google.maps | null = null;
let map: google.maps.Map | null = null;
let polygon: google.maps.Polygon | null = null;
let overlayPolys: google.maps.Polygon[] = [];
let lastEmitted = '';
let suppress = false;

function readPath(): AreaPoint[] {
  if (!polygon) return [];
  return polygon
    .getPath()
    .getArray()
    .map((p) => ({ lat: Number(p.lat().toFixed(6)), lng: Number(p.lng().toFixed(6)) }));
}

function emit(points: AreaPoint[]) {
  pointCount.value = points.length;
  lastEmitted = JSON.stringify(points);
  path.value = points;
}

function syncFromPolygon() {
  if (suppress) return;
  emit(readPath());
}

// Re-bind path listeners (the MVCArray identity changes after setPath).
function bindPath() {
  if (!polygon || !maps) return;
  const p = polygon.getPath();
  maps.event.clearInstanceListeners(p);
  ['set_at', 'insert_at', 'remove_at'].forEach((ev) => p.addListener(ev, syncFromPolygon));
}

function setPath(points: AreaPoint[]) {
  if (!polygon) return;
  suppress = true;
  polygon.setPath(points);
  bindPath();
  suppress = false;
  emit(points);
  if (maps && map && points.length) {
    const bounds = new maps.LatLngBounds();
    points.forEach((pt) => bounds.extend(pt));
    map.fitBounds(bounds, 48);
  }
}

function undo() {
  if (!polygon) return;
  const p = polygon.getPath();
  if (p.getLength()) p.removeAt(p.getLength() - 1); // fires remove_at -> syncFromPolygon
}

function clearPoints() {
  setPath([]);
}

function renderOverlays() {
  if (!maps || !map) return;
  overlayPolys.forEach((p) => p.setMap(null));
  overlayPolys = [];
  props.overlays.forEach((o) => {
    if (!o.polygon || o.polygon.length < 3) return;
    const poly = new maps!.Polygon({
      paths: o.polygon,
      editable: false,
      clickable: false,
      map: map!,
      fillColor: o.color ?? '#64748b',
      fillOpacity: 0.12,
      strokeColor: o.color ?? '#64748b',
      strokeWeight: 1.5,
      strokeOpacity: 0.8
    });
    overlayPolys.push(poly);
  });

  // When not actively drawing, frame the shown overlays so they're visible.
  if (map && path.value.length < 1 && overlayPolys.length) {
    const bounds = new maps.LatLngBounds();
    props.overlays.forEach((o) => o.polygon?.forEach((pt) => bounds.extend(pt)));
    if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
  }
}

onMounted(async () => {
  try {
    maps = await loadGoogleMaps();
    if (!mapEl.value) return;
    map = new maps.Map(mapEl.value, {
      center: mapCenter(),
      zoom: 12,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      clickableIcons: false
    });

    polygon = new maps.Polygon({
      editable: true,
      map,
      fillColor: props.color,
      fillOpacity: 0.2,
      strokeColor: props.color,
      strokeWeight: 2
    });
    // setPath (not the `paths` constructor option) guarantees a single ring MVCArray
    // even when empty — otherwise getPath() is undefined and listener binding crashes.
    polygon.setPath(path.value);
    pointCount.value = path.value.length;
    bindPath();

    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng && polygon) polygon.getPath().push(e.latLng); // fires insert_at -> sync
    });

    if (path.value.length) {
      const bounds = new maps.LatLngBounds();
      path.value.forEach((pt) => bounds.extend(pt));
      map.fitBounds(bounds, 48);
    }
    renderOverlays();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load the map.';
  }
});

// React to external changes (editing a different area, or a form reset).
watch(path, (next) => {
  if (!polygon) return;
  if (JSON.stringify(next) === lastEmitted) return; // ignore our own echo
  setPath(next);
});

watch(() => props.overlays, renderOverlays, { deep: true });
</script>

<template>
  <div class="area-editor">
    <div v-if="error" class="map-fallback">
      <v-icon icon="mdi-map-marker-off" size="32" class="mb-2" />
      <div>{{ error }}</div>
    </div>
    <div ref="mapEl" class="map-canvas" />
    <div class="editor-bar">
      <v-chip size="small" :color="pointCount >= 3 ? 'success' : 'warning'" variant="flat">
        {{ pointCount >= 3 ? `${pointCount} points` : `Tap map to add points (${pointCount}/3)` }}
      </v-chip>
      <div class="d-flex ga-1">
        <v-btn size="small" variant="tonal" icon="mdi-undo" :disabled="!pointCount" @click="undo" />
        <v-btn size="small" variant="tonal" icon="mdi-delete-outline" :disabled="!pointCount" @click="clearPoints" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.area-editor {
  position: relative;
  width: 100%;
  height: 360px;
  border-radius: 16px;
  overflow: hidden;
}
.map-canvas {
  width: 100%;
  height: 100%;
}
.editor-bar {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.map-fallback {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-error));
}
</style>
