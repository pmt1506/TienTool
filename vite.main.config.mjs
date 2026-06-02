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
      entry: 'src/main.js',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        ...builtins,
        'mongodb',
        'koffi',
        'electron-log',
        'electron-updater',
        'electron-squirrel-startup',
      ],
    },
    emptyOutDir: false,
  },
  define: {
    MAIN_WINDOW_VITE_NAME: JSON.stringify('main_window'),
    MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined',
    'process.env.MONGODB_URI': JSON.stringify(process.env.MONGODB_URI || ''),
    'process.env.GNDDT_API_BASE': JSON.stringify(process.env.GNDDT_API_BASE || 'https://api.gnddt.com'),
    'process.env.GNDDT_WEBSHOP_URL': JSON.stringify(process.env.GNDDT_WEBSHOP_URL || 'https://sv3.gnddt.com/cua-hang'),
  },
});
