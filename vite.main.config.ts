import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Dependências opcionais nativas do `ws`: ele cai no fallback JS quando não existem.
      external: ['bufferutil', 'utf-8-validate'],
    },
  },
});
