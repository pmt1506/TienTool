import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  base: './',
  build: {
    outDir: '.vite/renderer/main_window',
    emptyOutDir: true,
  },
});
