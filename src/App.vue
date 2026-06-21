<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from './composables/useAuth';
import { useOnline } from './composables/useOnline';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const { online } = useOnline();

const showNav = computed(() => auth.isAuthenticated.value && route.name !== 'login');
const navValue = computed(() => route.path);

const navItems = [
  { title: 'Home', value: '/', icon: 'mdi-home-outline' },
  { title: 'Orders', value: '/orders', icon: 'mdi-clipboard-list-outline' },
  { title: 'New', value: '/orders/new', icon: 'mdi-plus-circle-outline' },
  { title: 'Delivery', value: '/deliveries', icon: 'mdi-truck-delivery-outline' },
  { title: 'Reports', value: '/reports', icon: 'mdi-chart-bar' }
];

onMounted(() => {
  void auth.init();
});

function go(path: string) {
  void router.push(path);
}
</script>

<template>
  <v-app>
    <v-system-bar v-if="!online" color="warning" height="32">
      <v-icon icon="mdi-wifi-off" size="16" class="mr-2" />
      Offline. Data changes need internet.
    </v-system-bar>

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

