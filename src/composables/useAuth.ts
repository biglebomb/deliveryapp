import type { Session } from '@supabase/supabase-js';
import { computed, ref } from 'vue';
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
  }

  const role = computed(() => profile.value?.role ?? null);

  return {
    init,
    signIn,
    signOut,
    session,
    profile,
    role,
    loading,
    isAuthenticated: computed(() => Boolean(session.value)),
    isAdmin: computed(() => role.value === 'admin'),
    // Anyone authenticated who is not an admin is treated as a driver (least privilege).
    isDriver: computed(() => Boolean(session.value) && role.value !== 'admin'),
    isSupabaseConfigured
  };
}
