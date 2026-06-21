<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const auth = useAuth();
const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.signIn(email.value, password.value);
    await router.push('/');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not sign in.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="page">
    <div class="d-flex align-center ga-3 mb-8">
      <v-avatar color="primary" size="48">
        <v-icon icon="mdi-bottle-tonic-outline" color="white" />
      </v-avatar>
      <div>
        <div class="eyebrow">Fresh Milk</div>
        <h1 class="title">Delivery Manager</h1>
      </div>
    </div>

    <v-alert v-if="!auth.isSupabaseConfigured" type="warning" class="mb-4">
      Supabase environment variables are not set. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
    </v-alert>

    <v-card class="list-card pa-4">
      <form class="stack" @submit.prevent="submit">
        <v-text-field v-model="email" label="Email" type="email" autocomplete="email" required />
        <v-text-field v-model="password" label="Password" type="password" autocomplete="current-password" required />
        <v-alert v-if="error" type="error" density="comfortable">{{ error }}</v-alert>
        <v-btn color="primary" size="large" type="submit" :loading="loading" block>Sign in</v-btn>
      </form>
    </v-card>
  </main>
</template>

