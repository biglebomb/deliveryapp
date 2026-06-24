import { ref } from 'vue';

// The branch the app is currently operating in. Services read this to scope
// reads (filter by branch_id) and stamp writes. It's a concrete branch for all
// operational screens; the owner can switch it, staff are pinned to their own.
const STORAGE_KEY = 'deliveryapp.activeBranchId';

const activeBranchId = ref<string | null>(
  typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
);

// Map fallback center: the active branch's coordinates when known, else Jakarta.
const DEFAULT_CENTER = { lat: -6.2088, lng: 106.8456 };
const activeBranchCenter = ref<{ lat: number; lng: number } | null>(null);

export function setActiveBranchCenter(center: { lat: number; lng: number } | null): void {
  activeBranchCenter.value = center;
}

/** Reactive ref to the active branch center (for maps that recenter when it arrives). */
export function branchCenterRef() {
  return activeBranchCenter;
}

/** Default center for maps — the active branch, falling back to Jakarta. */
export function mapCenter(): { lat: number; lng: number } {
  return activeBranchCenter.value ?? DEFAULT_CENTER;
}

/** Reactive ref to the active branch id (for components / router-view keying). */
export function activeBranch() {
  return activeBranchId;
}

export function getActiveBranchId(): string | null {
  return activeBranchId.value;
}

export function setActiveBranchId(id: string | null): void {
  activeBranchId.value = id;
  if (typeof localStorage === 'undefined') return;
  if (id) localStorage.setItem(STORAGE_KEY, id);
  else localStorage.removeItem(STORAGE_KEY);
}

/** Active branch id, or throw — use when an insert must be stamped with a branch. */
export function requireBranchId(): string {
  const id = activeBranchId.value;
  if (!id) throw new Error('No active branch selected.');
  return id;
}
