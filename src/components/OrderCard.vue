<script setup lang="ts">
import { computed } from 'vue';
import { buildOrderSummary, formatCurrency, formatDateTime, whatsappUrl } from '../lib/format';
import type { Order, OrderStatus, PaymentStatus } from '../types/models';
import { orderStatuses, paymentStatuses } from '../types/models';

const props = defineProps<{
  order: Order;
  editable?: boolean;
}>();

const emit = defineEmits<{
  status: [id: string, status: OrderStatus];
  payment: [id: string, status: PaymentStatus];
}>();

const summary = computed(() => buildOrderSummary(props.order));
const whatsapp = computed(() => whatsappUrl(props.order.customer?.phone, summary.value));

async function copySummary() {
  await navigator.clipboard.writeText(summary.value);
}
</script>

<template>
  <v-card class="list-card pa-4">
    <div class="d-flex align-start justify-space-between ga-3">
      <div>
        <div class="section-title">{{ order.customer?.name ?? 'Customer' }}</div>
        <div class="muted text-body-2">{{ formatDateTime(order.order_date) }}</div>
      </div>
      <div class="text-right">
        <div class="font-weight-bold">{{ formatCurrency(order.total_amount) }}</div>
        <v-chip size="small" :color="order.payment_status === 'paid' ? 'success' : 'warning'" class="mt-1">
          {{ order.payment_status }}
        </v-chip>
      </div>
    </div>

    <div class="mt-3 stack">
      <div v-for="item in order.order_items" :key="item.id" class="d-flex justify-space-between ga-3">
        <span>
          {{ item.quantity }}x {{ item.product_name_snapshot }}
          <span v-if="item.packaging_fee_snapshot > 0 && item.packaging_name_snapshot" class="muted">· {{ item.packaging_name_snapshot }}</span>
        </span>
        <span class="font-weight-medium">{{ formatCurrency(item.subtotal) }}</span>
      </div>
    </div>

    <div v-if="order.customer?.address || order.delivery_notes" class="mt-3 muted text-body-2">
      <div v-if="order.customer?.address">{{ order.customer.address }}</div>
      <div v-if="order.delivery_notes">{{ order.delivery_notes }}</div>
    </div>

    <div class="mt-4 grid" :class="{ 'cols-2': editable }">
      <v-select
        v-if="editable"
        :model-value="order.status"
        :items="orderStatuses"
        label="Status"
        hide-details
        @update:model-value="emit('status', order.id, $event)"
      />
      <v-select
        v-if="editable"
        :model-value="order.payment_status"
        :items="paymentStatuses"
        label="Payment"
        hide-details
        @update:model-value="emit('payment', order.id, $event)"
      />
    </div>

    <div class="d-flex ga-2 mt-4">
      <v-btn
        :disabled="!whatsapp"
        :href="whatsapp || undefined"
        target="_blank"
        rel="noopener"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-whatsapp"
      >
        WhatsApp
      </v-btn>
      <v-btn variant="text" prepend-icon="mdi-content-copy" @click="copySummary">Copy</v-btn>
    </div>
  </v-card>
</template>

