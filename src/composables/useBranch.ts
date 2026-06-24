import { computed, ref } from 'vue';
import { activeBranch, setActiveBranchCenter, setActiveBranchId } from '../lib/branchContext';
import { fetchBranches } from '../services/branches';
import type { Branch } from '../types/models';
import { useAuth } from './useAuth';

const branches = ref<Branch[]>([]);
let loaded = false;

export function useBranch() {
  const auth = useAuth();
  const activeBranchId = activeBranch();

  // Keep the shared map center in sync with the active branch's coordinates.
  function syncCenter() {
    const b = branches.value.find((x) => x.id === activeBranchId.value);
    setActiveBranchCenter(
      b && b.latitude != null && b.longitude != null
        ? { lat: Number(b.latitude), lng: Number(b.longitude) }
        : null
    );
  }

  async function loadBranches(force = false) {
    if (!loaded || force) {
      branches.value = await fetchBranches();
      loaded = true;
    }
    syncCenter();
  }

  const current = computed(() => branches.value.find((b) => b.id === activeBranchId.value) ?? null);

  // Only the owner may operate across branches; staff stay on their own.
  function switchBranch(id: string) {
    if (!auth.isOwner.value) return;
    setActiveBranchId(id);
    syncCenter();
  }

  return {
    branches,
    current,
    activeBranchId,
    loadBranches,
    switchBranch,
    canSwitch: auth.isOwner
  };
}
