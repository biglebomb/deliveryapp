<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { branchCenterRef, mapCenter } from '../lib/branchContext';
import { loadGoogleMaps } from '../lib/maps';
import type { GeoPoint, RouteStop } from '../lib/route';

const props = defineProps<{
  stops: RouteStop[];
  start?: GeoPoint | null;
  directions?: google.maps.DirectionsResult | null;
  maxZoom?: number;
}>();

const emit = defineEmits<{ select: [id: string] }>();

const mapEl = ref<HTMLElement | null>(null);
const error = ref('');

let maps: typeof google.maps | null = null;
let map: google.maps.Map | null = null;
let markerById = new Map<string, google.maps.Marker>();
let startMarker: google.maps.Marker | null = null;
let renderer: google.maps.DirectionsRenderer | null = null;

// Viewport-fit tracking. We only refit when stops are added or the start/route
// changes — never on a pure removal — so completing a delivery leaves the
// driver's current pan/zoom untouched.
let hasFit = false;
let prevStart: GeoPoint | null = null;
let prevDirections: google.maps.DirectionsResult | null = null;

function clearMarkers() {
  markerById.forEach((m) => m.setMap(null));
  markerById = new Map();
}

/** Add/update/remove pins to match props.stops without recreating the whole set. */
function syncMarkers(): boolean {
  let added = false;
  const seen = new Set<string>();

  props.stops.forEach((stop, index) => {
    seen.add(stop.id);
    const label = { text: String(index + 1), color: '#ffffff', fontWeight: '700' };
    const existing = markerById.get(stop.id);
    if (existing) {
      existing.setPosition({ lat: stop.lat, lng: stop.lng });
      existing.setLabel(label);
      existing.setTitle(stop.label);
    } else {
      const marker = new maps!.Marker({
        map: map!,
        position: { lat: stop.lat, lng: stop.lng },
        label,
        title: stop.label
      });
      marker.addListener('click', () => emit('select', stop.id));
      markerById.set(stop.id, marker);
      added = true;
    }
  });

  for (const [id, marker] of markerById) {
    if (!seen.has(id)) {
      marker.setMap(null);
      markerById.delete(id);
    }
  }

  return added;
}

function draw() {
  if (!map || !maps) return;

  const added = syncMarkers();

  const startChanged = (props.start ?? null) !== prevStart;
  prevStart = props.start ?? null;
  if (startMarker) {
    startMarker.setMap(null);
    startMarker = null;
  }
  if (props.start) {
    startMarker = new maps.Marker({
      map,
      position: { lat: props.start.lat, lng: props.start.lng },
      title: 'Start',
      icon: {
        path: maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#2563eb',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2
      }
    });
  }

  // Directions polyline (road path) when available.
  const directionsChanged = (props.directions ?? null) !== prevDirections;
  prevDirections = props.directions ?? null;
  if (props.directions) {
    if (!renderer) {
      renderer = new maps.DirectionsRenderer({ suppressMarkers: true, preserveViewport: true });
      renderer.setMap(map);
    }
    renderer.setDirections(props.directions);
  } else if (renderer) {
    renderer.setMap(null);
    renderer = null;
  }

  // Only (re)fit on the first paint or when something was added/changed — a pure
  // removal (a delivered stop) keeps the current view.
  const shouldFit = !hasFit || added || startChanged || directionsChanged;
  if (shouldFit && (props.stops.length || props.start)) {
    const bounds = new maps.LatLngBounds();
    props.stops.forEach((stop) => bounds.extend({ lat: stop.lat, lng: stop.lng }));
    if (props.start) bounds.extend({ lat: props.start.lat, lng: props.start.lng });

    map.fitBounds(bounds, 64);
    hasFit = true;
    const count = props.stops.length + (props.start ? 1 : 0);
    const cap = props.maxZoom ?? 16;
    if (count === 1) {
      // A single (or very close) destination would otherwise zoom in to street level —
      // keep some surrounding context so the driver can orient.
      map.setZoom(cap);
    } else {
      // fitBounds resolves the zoom asynchronously; cap it once the map settles, but
      // leave manual zoom free afterwards.
      maps.event.addListenerOnce(map, 'idle', () => {
        if (map && (map.getZoom() ?? 0) > cap) map.setZoom(cap);
      });
    }
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
      gestureHandling: 'greedy'
    });
    draw();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load the map.';
  }
});

onBeforeUnmount(() => {
  clearMarkers();
  if (renderer) renderer.setMap(null);
});

watch(() => [props.stops, props.start, props.directions], draw, { deep: true });

// Recenter if the branch center resolves after mount, while there's nothing to frame.
watch(branchCenterRef(), (center) => {
  if (map && center && !props.stops.length && !props.start) map.setCenter(center);
});
</script>

<template>
  <div class="delivery-map">
    <div v-if="error" class="map-fallback">
      <v-icon icon="mdi-map-marker-off" size="32" class="mb-2" />
      <div>{{ error }}</div>
    </div>
    <div ref="mapEl" class="map-canvas" />
  </div>
</template>

<style scoped>
.delivery-map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
  border-radius: 16px;
  overflow: hidden;
}
.map-canvas {
  width: 100%;
  height: 100%;
  min-height: 320px;
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
