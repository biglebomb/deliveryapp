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
    { path: '/deliveries', name: 'deliveries', component: () => import('../views/DeliveriesView.vue') },
    { path: '/customers', name: 'customers', component: () => import('../views/CustomersView.vue') },
    { path: '/products', name: 'products', component: () => import('../views/ProductsView.vue') },
    { path: '/packaging', name: 'packaging', component: () => import('../views/PackagingView.vue') },
    { path: '/areas', name: 'areas', component: () => import('../views/AreasView.vue') },
    { path: '/reports', name: 'reports', component: () => import('../views/ReportsView.vue') }
  ],
  scrollBehavior: () => ({ top: 0 })
});

router.beforeEach(async (to) => {
  const auth = useAuth();
  await auth.init();

  if (to.meta.public) {
    return auth.isAuthenticated.value ? '/' : true;
  }

  return auth.isAuthenticated.value ? true : '/login';
});

