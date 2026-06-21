import { onMounted, onUnmounted, ref } from 'vue';

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);

export function useOnline() {
  function update() {
    online.value = navigator.onLine;
  }

  onMounted(() => {
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  });

  onUnmounted(() => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  });

  return { online };
}

