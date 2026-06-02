const runtimeEnv = globalThis.process?.env ?? {};

const config = {
  mongodb: {
    uri: runtimeEnv.MONGODB_URI || __MONGODB_URI__,
    dbName: 'qltk',
    collections: {
      keys: 'keys',
      licenseRequests: 'licenseRequests',
      accounts: 'accounts',
      templates: 'templates',
    },
  },
  api: {
    base: runtimeEnv.GNDDT_API_BASE || __GNDDT_API_BASE__,
    webshop: runtimeEnv.GNDDT_WEBSHOP_URL || __GNDDT_WEBSHOP_URL__,
  },
  app: {
    title: 'TienTool - Gunny2017',
    version: '1.0.0',
  },
};

export default config;
