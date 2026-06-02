import { defineConfig, loadEnv } from 'vite';
import { builtinModules } from 'node:module';

const builtins = [
  'electron',
  ...builtinModules.map((m) => [m, `node:${m}`]).flat(),
];

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
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
      __MONGODB_URI__: JSON.stringify(env.MONGODB_URI || process.env.MONGODB_URI || ''),
      __GNDDT_API_BASE__: JSON.stringify(env.GNDDT_API_BASE || process.env.GNDDT_API_BASE || 'https://api.gnddt.com'),
      __GNDDT_WEBSHOP_URL__: JSON.stringify(env.GNDDT_WEBSHOP_URL || process.env.GNDDT_WEBSHOP_URL || 'https://gnddt.com/cua-hang'),
    },
  };
});
