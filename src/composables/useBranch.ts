import { computed, ref } from 'vue';
import { activeBranch, setActiveBranchId } from '../lib/branchContext';
import { fetchBranches } from '../services/branches';
import type { Branch } from '../types/models';
import { useAuth } from './useAuth';

const branches = ref<Branch[]>([]);
let loaded = false;

export function useBranch() {
  const auth = useAuth();
  const activeBranchId = activeBranch();

  async function loadBranches(force = false) {
    if (loaded && !force) return;
    branches.value = await fetchBranches();
    loaded = true;
  }

  const current = computed(() => branches.value.find((b) => b.id === activeBranchId.value) ?? null);

  // Only the owner may operate across branches; staff stay on their own.
  function switchBranch(id: string) {
    if (!auth.isOwner.value) return;
    setActiveBranchId(id);
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
