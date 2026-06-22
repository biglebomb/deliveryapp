<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
let markers: google.maps.Marker[] = [];
let startMarker: google.maps.Marker | null = null;
let renderer: google.maps.DirectionsRenderer | null = null;

const JAKARTA: GeoPoint = { lat: -6.2088, lng: 106.8456 };

function clearMarkers() {
  markers.forEach((m) => m.setMap(null));
  markers = [];
}

function draw() {
  if (!map || !maps) return;

  clearMarkers();
  const bounds = new maps.LatLngBounds();

  props.stops.forEach((stop, index) => {
    const marker = new maps!.Marker({
      map: map!,
      position: { lat: stop.lat, lng: stop.lng },
      label: { text: String(index + 1), color: '#ffffff', fontWeight: '700' },
      title: stop.label
    });
    marker.addListener('click', () => emit('select', stop.id));
    markers.push(marker);
    bounds.extend({ lat: stop.lat, lng: stop.lng });
  });

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
    bounds.extend({ lat: props.start.lat, lng: props.start.lng });
  }

  // Directions polyline (road path) when available.
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

  if (props.stops.length || props.start) {
    map.fitBounds(bounds, 64);
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
      center: JAKARTA,
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
