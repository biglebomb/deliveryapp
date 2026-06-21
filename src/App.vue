<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from './composables/useAuth';
import { useOnline } from './composables/useOnline';
import { countPendingInbox } from './services/inbox';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const { online } = useOnline();

const drawer = ref(false);
const pendingInbox = ref(0);

async function loadPending() {
  if (!auth.isAdmin.value) return;
  try {
    pendingInbox.value = await countPendingInbox();
  } catch {
    // ignore — badge is best-effort
  }
}

const showNav = computed(() => auth.isAdmin.value && route.name !== 'login');
const navValue = computed(() => route.path);

// Full menu (hamburger drawer).
const menuItems = [
  { title: 'Dashboard', value: '/', icon: 'mdi-view-dashboard-outline' },
  { title: 'New order', value: '/orders/new', icon: 'mdi-plus-circle-outline' },
  { title: 'Orders', value: '/orders', icon: 'mdi-clipboard-list-outline' },
  { title: 'Inbox', value: '/inbox', icon: 'mdi-inbox-outline' },
  { title: 'Deliveries', value: '/deliveries', icon: 'mdi-truck-delivery-outline' },
  { title: 'Customers', value: '/customers', icon: 'mdi-account-group-outline' },
  { title: 'Products', value: '/products', icon: 'mdi-bottle-tonic-outline' },
  { title: 'Packaging', value: '/packaging', icon: 'mdi-package-variant' },
  { title: 'Areas', value: '/areas', icon: 'mdi-vector-polygon' },
  { title: 'Drivers', value: '/drivers', icon: 'mdi-account-hard-hat' },
  { title: 'Reports', value: '/reports', icon: 'mdi-chart-bar' }
];

// Quick actions (bottom bar).
const navItems = [
  { title: 'Home', value: '/', icon: 'mdi-home-outline' },
  { title: 'Orders', value: '/orders', icon: 'mdi-clipboard-list-outline' },
  { title: 'New', value: '/orders/new', icon: 'mdi-plus-circle-outline' },
  { title: 'Delivery', value: '/deliveries', icon: 'mdi-truck-delivery-outline' },
  { title: 'Reports', value: '/reports', icon: 'mdi-chart-bar' }
];

onMounted(async () => {
  await auth.init();
  void loadPending();
});

// Refresh the pending badge whenever the drawer is opened.
watch(drawer, (open) => {
  if (open) void loadPending();
});

function go(path: string) {
  drawer.value = false;
  if (route.path !== path) void router.push(path);
}

async function signOut() {
  drawer.value = false;
  await auth.signOut();
  await router.push('/login');
}
</script>

<template>
  <v-app>
    <v-system-bar v-if="!online" color="warning" height="32">
      <v-icon icon="mdi-wifi-off" size="16" class="mr-2" />
      Offline. Data changes need internet.
    </v-system-bar>

    <v-app-bar v-if="showNav" color="primary" density="comfortable" flat>
      <v-app-bar-nav-icon aria-label="Menu" @click="drawer = !drawer" />
      <v-app-bar-title class="font-weight-bold">Milk Delivery</v-app-bar-title>
      <v-btn icon="mdi-logout" @click="signOut" />
    </v-app-bar>

    <v-navigation-drawer v-if="showNav" v-model="drawer" temporary>
      <v-list nav density="comfortable">
        <v-list-item
          v-for="item in menuItems"
          :key="item.value"
          :active="navValue === item.value"
          :prepend-icon="item.icon"
          :title="item.title"
          @click="go(item.value)"
        >
          <template v-if="item.value === '/inbox' && pendingInbox > 0" #append>
            <v-badge :content="pendingInbox" color="error" inline />
          </template>
        </v-list-item>
        <v-divider class="my-2" />
        <v-list-item prepend-icon="mdi-logout" title="Sign out" @click="signOut" />
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <router-view />
    </v-main>

    <v-bottom-navigation
      v-if="showNav"
      :model-value="navValue"
      color="primary"
      grow
      mandatory
      class="bottom-safe"
    >
      <v-btn v-for="item in navItems" :key="item.value" :value="item.value" @click="go(item.value)">
        <v-icon :icon="item.icon" />
        <span>{{ item.title }}</span>
      </v-btn>
    </v-bottom-navigation>
  </v-app>
</template>
