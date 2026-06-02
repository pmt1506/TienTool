const config = {
  mongodb: {
    uri: process.env.MONGODB_URI,
    dbName: 'qltk',
    collections: {
      keys: 'keys',
      licenseRequests: 'licenseRequests',
      accounts: 'accounts',
      templates: 'templates',
    },
  },
  api: {
    base: process.env.GNDDT_API_BASE || 'https://api.gnddt.com',
    webshop: process.env.GNDDT_WEBSHOP_URL || 'https://gnddt.com/cua-hang',
  },
  app: {
    title: 'TienTool - Gunny2017',
    version: '1.0.0',
  },
};

export default config;
