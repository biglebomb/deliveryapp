<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAuth } from '../composables/useAuth';
import { useBranch } from '../composables/useBranch';
import { createStaff, deleteStaff, fetchStaff, setDriverActive } from '../services/profiles';
import type { Profile } from '../types/models';

const auth = useAuth();
const branchCtx = useBranch();

const staff = ref<Profile[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const dialog = ref(false);
const form = reactive({
  name: '',
  email: '',
  password: '',
  phone: '',
  role: 'driver' as 'driver' | 'admin',
  branch_id: ''
});

const roleLabels: Record<string, string> = { owner: 'Owner', admin: 'Branch manager', driver: 'Driver' };

const headers = computed(() => [
  { title: 'Name', key: 'name' },
  { title: 'Role', key: 'role', width: '150px' },
  ...(auth.isOwner.value ? [{ title: 'Branch', key: 'branch_id', width: '140px' }] : []),
  { title: 'Phone', key: 'phone' },
  { title: 'Status', key: 'is_active', width: '110px' },
  { title: '', key: 'actions', sortable: false, width: '180px' }
]);

function branchName(id: string): string {
  return branchCtx.branches.value.find((b) => b.id === id)?.name ?? '—';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    staff.value = await fetchStaff();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load team.';
  } finally {
    loading.value = false;
  }
}

function openAdd() {
  Object.assign(form, {
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'driver',
    branch_id: branchCtx.activeBranchId.value ?? ''
  });
  error.value = '';
  dialog.value = true;
}

async function submit() {
  if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
    error.value = 'Name, email, and a password of at least 6 characters are required.';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await createStaff({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim() || null,
      // Only the owner chooses role/branch; managers create drivers in their own branch.
      ...(auth.isOwner.value ? { role: form.role, branch_id: form.branch_id || undefined } : {})
    });
    notice.value = `${roleLabels[form.role]} ${form.email.trim()} created.`;
    dialog.value = false;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not create team member.';
  } finally {
    saving.value = false;
  }
}

async function toggleActive(member: Profile) {
  await setDriverActive(member.id, !member.is_active);
  await load();
}

const memberToDelete = ref<Profile | null>(null);
const deleting = ref(false);

async function confirmDelete() {
  if (!memberToDelete.value) return;
  deleting.value = true;
  error.value = '';
  try {
    await deleteStaff(memberToDelete.value.id);
    memberToDelete.value = null;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not delete member.';
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  void branchCtx.loadBranches();
  void load();
});
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="eyebrow">Team</div>
        <h1 class="title">Team</h1>
      </div>
      <div class="d-flex ga-2">
        <v-btn icon="mdi-refresh" variant="text" :loading="loading" @click="load" />
        <v-btn color="primary" prepend-icon="mdi-account-plus" @click="openAdd">Add member</v-btn>
      </div>
    </div>

    <v-alert v-if="error && !dialog" type="error" class="mb-4">{{ error }}</v-alert>
    <v-alert v-if="notice" type="success" class="mb-4" closable @click:close="notice = ''">{{ notice }}</v-alert>

    <v-card class="list-card">
      <v-data-table
        :headers="headers"
        :items="staff"
        :loading="loading"
        density="comfortable"
        hover
        item-value="id"
      >
        <template #item.name="{ item }">
          <span class="font-weight-bold">{{ item.name || 'Member' }}</span>
        </template>

        <template #item.role="{ item }">
          <v-chip size="x-small" :color="item.role === 'admin' ? 'primary' : 'default'" variant="tonal">
            {{ roleLabels[item.role] }}
          </v-chip>
        </template>

        <template #item.branch_id="{ item }">
          <span class="muted">{{ branchName(item.branch_id) }}</span>
        </template>

        <template #item.phone="{ item }">
          <span class="muted">{{ item.phone || '—' }}</span>
        </template>

        <template #item.is_active="{ item }">
          <v-chip size="x-small" :color="item.is_active ? 'success' : 'default'" variant="tonal">
            {{ item.is_active ? 'Active' : 'Inactive' }}
          </v-chip>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex ga-1 justify-end">
            <v-btn
              :color="item.is_active ? 'error' : 'success'"
              variant="tonal"
              size="x-small"
              @click="toggleActive(item)"
            >
              {{ item.is_active ? 'Deactivate' : 'Activate' }}
            </v-btn>
            <v-btn
              icon="mdi-delete-outline"
              size="x-small"
              variant="text"
              color="error"
              @click="memberToDelete = item"
            />
          </div>
        </template>

        <template #no-data>
          <div class="pa-6 text-center muted">No team members yet. Add a driver or branch manager.</div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Delete confirm -->
    <v-dialog :model-value="memberToDelete !== null" max-width="420" @update:model-value="memberToDelete = null">
      <v-card class="pa-4">
        <div class="section-title mb-2">Delete team member?</div>
        <p class="mb-4">
          Permanently remove <strong>{{ memberToDelete?.name || 'this member' }}</strong> and their login.
          Past orders keep their history. This can't be undone.
        </p>
        <div class="d-flex ga-2 justify-end">
          <v-btn variant="text" :disabled="deleting" @click="memberToDelete = null">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" prepend-icon="mdi-delete" @click="confirmDelete">Delete</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Add member dialog -->
    <v-dialog v-model="dialog" max-width="440">
      <v-card class="pa-4">
        <div class="section-title mb-4">Add team member</div>
        <div class="stack">
          <v-alert v-if="error" type="error" density="compact">{{ error }}</v-alert>
          <template v-if="auth.isOwner.value">
            <v-select
              v-model="form.role"
              :items="[
                { value: 'driver', title: 'Driver' },
                { value: 'admin', title: 'Branch manager' }
              ]"
              label="Role"
              hide-details
            />
            <v-select
              v-model="form.branch_id"
              :items="branchCtx.branches.value"
              item-title="name"
              item-value="id"
              label="Branch"
              prepend-inner-icon="mdi-store-outline"
              hide-details
            />
          </template>
          <v-text-field v-model="form.name" label="Name" required hide-details />
          <v-text-field v-model="form.email" label="Email" type="email" autocomplete="off" required hide-details />
          <v-text-field v-model="form.password" label="Password (min 6 chars)" type="text" autocomplete="new-password" required hide-details />
          <v-text-field v-model="form.phone" label="Phone (optional)" inputmode="tel" hide-details />
        </div>
        <div class="d-flex ga-2 justify-end mt-4">
          <v-btn variant="text" :disabled="saving" @click="dialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" prepend-icon="mdi-account-plus" @click="submit">Create</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </main>
</template>
