import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import DashboardView from '../views/DashboardView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/orders', name: 'orders', component: () => import('../views/OrdersView.vue') },
    { path: '/orders/new', name: 'new-order', component: () => import('../views/NewOrderView.vue') },
    { path: '/orders/:id/edit', name: 'edit-order', component: () => import('../views/EditOrderView.vue') },
    { path: '/inbox', name: 'inbox', component: () => import('../views/InboxView.vue') },
    { path: '/subscriptions', name: 'subscriptions', component: () => import('../views/SubscriptionsView.vue') },
    { path: '/deliveries', name: 'deliveries', component: () => import('../views/DeliveriesView.vue') },
    { path: '/customers', name: 'customers', component: () => import('../views/CustomersView.vue') },
    { path: '/products', name: 'products', component: () => import('../views/ProductsView.vue') },
    { path: '/packaging', name: 'packaging', component: () => import('../views/PackagingView.vue') },
    { path: '/areas', name: 'areas', component: () => import('../views/AreasView.vue') },
    { path: '/reports', name: 'reports', component: () => import('../views/ReportsView.vue') },
    { path: '/drivers', name: 'drivers', component: () => import('../views/DriversView.vue') },
    { path: '/branches', name: 'branches', component: () => import('../views/BranchesView.vue'), meta: { ownerOnly: true } },
    { path: '/branches/new', name: 'branch-new', component: () => import('../views/BranchEditView.vue'), meta: { ownerOnly: true } },
    { path: '/branches/:id/edit', name: 'branch-edit', component: () => import('../views/BranchEditView.vue'), meta: { ownerOnly: true } },
    { path: '/driver', name: 'driver', component: () => import('../views/DriverView.vue') }
  ],
  scrollBehavior: () => ({ top: 0 })
});

function homeFor(isAdmin: boolean): string {
  return isAdmin ? '/' : '/driver';
}

router.beforeEach(async (to) => {
  const auth = useAuth();
  await auth.init();

  if (to.meta.public) {
    return auth.isAuthenticated.value ? homeFor(auth.isAdmin.value) : true;
  }

  if (!auth.isAuthenticated.value) return '/login';

  // Drivers can only reach their own route; admins use the full app (not the driver view).
  if (!auth.isAdmin.value && to.name !== 'driver') return '/driver';
  if (auth.isAdmin.value && to.name === 'driver') return '/';

  // HQ-only routes (e.g. Branches) are owner-only; branch managers are redirected home.
  if (to.meta.ownerOnly && !auth.isOwner.value) return '/';

  return true;
});

