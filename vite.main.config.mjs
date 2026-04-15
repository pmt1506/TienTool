import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'mongodb',
        'kerberos',
        'os-dns-native',
        'bson-ext',
        '@mongodb-js/zstd',
        '@aws-sdk/credential-providers',
        'snappy',
        'socks',
        'aws4',
        'mongodb-client-encryption',
        'gcp-metadata',
      ],
    },
  },
});
