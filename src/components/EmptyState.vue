<script setup lang="ts">
defineProps<{
  icon: string;
  title: string;
  text: string;
}>();
</script>

<template>
  <v-card class="list-card text-center pa-6">
    <v-icon :icon="icon" color="primary" size="40" class="mb-2" />
    <div class="section-title">{{ title }}</div>
    <div class="muted mt-1">{{ text }}</div>
  </v-card>
</template>

