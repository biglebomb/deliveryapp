import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import './styles.css';

import { createApp } from 'vue';
import { registerSW } from 'virtual:pwa-register';
import App from './App.vue';
import { vuetify } from './plugins/vuetify';
import { router } from './router';

registerSW({ immediate: true });

createApp(App).use(router).use(vuetify).mount('#app');

