<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    label?: string;
    lockedLabel?: string;
  }>(),
  { disabled: false, label: 'Delivered', lockedLabel: 'Mark paid first' }
);

const emit = defineEmits<{ complete: []; blocked: [] }>();

const fg = ref<HTMLElement | null>(null);
const x = ref(0);
const animating = ref(false);

// Don't start a swipe when the gesture begins on something the driver taps.
const INTERACTIVE = 'button, a, input, select, textarea, .v-btn, .v-field, .v-overlay, [data-no-swipe]';

let startX = 0;
let startY = 0;
let width = 0;
let capturing = false;
let aborted = false;
let active = false;

function onDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
  startX = e.clientX;
  startY = e.clientY;
  width = fg.value?.offsetWidth ?? 0;
  capturing = false;
  aborted = false;
  active = true;
  animating.value = false;
}

function onMove(e: PointerEvent) {
  if (!active || aborted) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  if (!capturing) {
    // Let vertical scrolls through; only hijack clearly-horizontal drags.
    if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
      aborted = true;
      return;
    }
    if (dx > 10 && dx > Math.abs(dy)) {
      capturing = true;
      fg.value?.setPointerCapture(e.pointerId);
    } else {
      return;
    }
  }
  x.value = Math.max(0, Math.min(dx, width));
}

function threshold(): number {
  return Math.min(width * 0.5, 160);
}

function onUp() {
  if (!active) return;
  active = false;
  if (!capturing) return;
  capturing = false;
  animating.value = true;
  if (x.value >= threshold()) {
    if (props.disabled) {
      x.value = 0;
      emit('blocked');
    } else {
      x.value = width;
      window.setTimeout(() => emit('complete'), 180);
    }
  } else {
    x.value = 0;
  }
}
</script>

<template>
  <div class="swipe">
    <div class="swipe-bg" :class="{ locked: disabled }">
      <v-icon :icon="disabled ? 'mdi-lock-outline' : 'mdi-gesture-swipe-right'" />
      <span>{{ disabled ? lockedLabel : label }}</span>
    </div>
    <div
      ref="fg"
      class="swipe-fg"
      :class="{ animating }"
      :style="{ transform: `translateX(${x}px)` }"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.swipe {
  position: relative;
}
.swipe-bg {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 24px;
  color: #fff;
  font-weight: 700;
  background: rgb(var(--v-theme-success));
}
.swipe-bg.locked {
  background: rgba(var(--v-theme-on-surface), 0.3);
}
.swipe-fg {
  position: relative;
  touch-action: pan-y;
  user-select: none;
}
.swipe-fg.animating {
  transition: transform 0.18s ease;
}
</style>
