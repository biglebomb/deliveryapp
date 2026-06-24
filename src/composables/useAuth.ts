import type { Session } from '@supabase/supabase-js';
import { computed, ref } from 'vue';
import { getActiveBranchId, setActiveBranchId } from '../lib/branchContext';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Profile } from '../types/models';

const session = ref<Session | null>(null);
const profile = ref<Profile | null>(null);
const loading = ref(true);
let initPromise: Promise<void> | null = null;

async function loadProfile() {
  if (!supabase || !session.value) {
    profile.value = null;
    return;
  }
  const { data } = await supabase.from('profiles').select('*').eq('id', session.value.user.id).single();
  profile.value = (data as Profile) ?? null;
  syncActiveBranch();
}

// Set the operating branch from the signed-in profile. The owner may have a
// stored choice (they can switch); staff are always pinned to their own branch.
function syncActiveBranch() {
  const p = profile.value;
  if (!p) {
    setActiveBranchId(null);
    return;
  }
  if (p.role === 'owner') {
    setActiveBranchId(getActiveBranchId() ?? p.branch_id);
  } else {
    setActiveBranchId(p.branch_id);
  }
}

async function runInit() {
  if (!supabase) {
    loading.value = false;
    return;
  }
  const { data } = await supabase.auth.getSession();
  session.value = data.session;
  await loadProfile();
  supabase.auth.onAuthStateChange((_event, nextSession) => {
    session.value = nextSession;
    void loadProfile();
  });
  loading.value = false;
}

export function useAuth() {
  // Shared promise so every caller (router guard, App mount) awaits the same
  // fully-resolved init — including the profile/role load — avoiding a race.
  function init() {
    if (!initPromise) initPromise = runInit();
    return initPromise;
  }

  async function signIn(email: string, password: string) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    session.value = data.session;
    await loadProfile();
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    profile.value = null;
    setActiveBranchId(null);
  }

  const role = computed(() => profile.value?.role ?? null);
  // Owner has the full admin app plus cross-branch switching.
  const isAdmin = computed(() => role.value === 'admin' || role.value === 'owner');

  return {
    init,
    signIn,
    signOut,
    session,
    profile,
    role,
    loading,
    isAuthenticated: computed(() => Boolean(session.value)),
    isAdmin,
    isOwner: computed(() => role.value === 'owner'),
    // Anyone authenticated who is not admin/owner is treated as a driver (least privilege).
    isDriver: computed(() => Boolean(session.value) && !isAdmin.value),
    isSupabaseConfigured
  };
}
