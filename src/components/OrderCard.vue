<script setup lang="ts">
import { computed } from 'vue';
import { buildOrderSummary, formatCurrency, formatDateTime, whatsappUrl } from '../lib/format';
import type { Order, OrderStatus, PaymentMethod, PaymentStatus, Profile } from '../types/models';
import { orderStatuses, paymentMethods, paymentStatuses } from '../types/models';

const props = defineProps<{
  order: Order;
  editable?: boolean;
  drivers?: Profile[];
}>();

const emit = defineEmits<{
  status: [id: string, status: OrderStatus];
  payment: [id: string, status: PaymentStatus, method: PaymentMethod | null];
  assign: [id: string, driverId: string | null];
}>();

const methodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  qris: 'QRIS',
  transfer: 'Transfer',
  other: 'Other'
};
const methodItems = paymentMethods.map((value) => ({ value, title: methodLabels[value] }));

const summary = computed(() => buildOrderSummary(props.order));
const whatsapp = computed(() => whatsappUrl(props.order.customer?.phone, summary.value));
const driverName = computed(
  () => props.drivers?.find((d) => d.id === props.order.assigned_driver_id)?.name ?? null
);

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
          {{ order.payment_status }}<template v-if="order.payment_method"> · {{ methodLabels[order.payment_method] }}</template>
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

    <div v-if="order.customer?.address || order.delivery_notes || driverName" class="mt-3 muted text-body-2">
      <div v-if="order.customer?.address">{{ order.customer.address }}</div>
      <div v-if="order.delivery_notes">{{ order.delivery_notes }}</div>
      <div v-if="driverName"><v-icon icon="mdi-truck-delivery-outline" size="14" /> {{ driverName }}</div>
    </div>

    <div v-if="editable" class="mt-4 grid cols-2">
      <v-select
        :model-value="order.status"
        :items="orderStatuses"
        label="Status"
        hide-details
        @update:model-value="emit('status', order.id, $event)"
      />
      <v-select
        :model-value="order.payment_status"
        :items="paymentStatuses"
        label="Payment"
        hide-details
        @update:model-value="emit('payment', order.id, $event, order.payment_method)"
      />
      <v-select
        :model-value="order.payment_method"
        :items="methodItems"
        label="Method"
        clearable
        hide-details
        @update:model-value="emit('payment', order.id, order.payment_status, $event)"
      />
      <v-select
        v-if="drivers"
        :model-value="order.assigned_driver_id"
        :items="drivers"
        item-title="name"
        item-value="id"
        label="Driver"
        clearable
        hide-details
        @update:model-value="emit('assign', order.id, $event)"
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
