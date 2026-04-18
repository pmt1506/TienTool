import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

const builtins = [
  'electron',
  ...builtinModules.map((m) => [m, `node:${m}`]).flat(),
];

// https://vitejs.dev/config
export default defineConfig({
  build: {
    outDir: '.vite/build',
    lib: {
      entry: 'src/preload.js',
      formats: ['cjs'],
      fileName: () => 'preload.js',
    },
    rollupOptions: {
      external: [
        ...builtins,
      ],
    },
    emptyOutDir: false,
  },
});
