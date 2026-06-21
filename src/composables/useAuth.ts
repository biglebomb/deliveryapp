import type { Session } from '@supabase/supabase-js';
import { computed, ref } from 'vue';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const session = ref<Session | null>(null);
const loading = ref(true);
let initialized = false;

export function useAuth() {
  async function init() {
    if (initialized) return;
    initialized = true;

    if (!supabase) {
      loading.value = false;
      return;
    }

    const { data } = await supabase.auth.getSession();
    session.value = data.session;
    supabase.auth.onAuthStateChange((_event, nextSession) => {
      session.value = nextSession;
    });
    loading.value = false;
  }

  async function signIn(email: string, password: string) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  return {
    init,
    signIn,
    signOut,
    session,
    loading,
    isAuthenticated: computed(() => Boolean(session.value)),
    isSupabaseConfigured
  };
}

