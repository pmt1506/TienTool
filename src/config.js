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
  // Thư mục cài GunnyBrowser — trùng với đường dẫn dùng trong loginService.
  game: {
    clientDir: 'C:/Program Files (x86)/gunnyclient',
  },
  // Nguồn tài nguyên game để tính năng "Cập nhật" tải về (giống GunnyClient gốc).
  resource: {
    manifestUrl: 'http://config.gnddt.com/ResourceInfo.xml',
    baseUrl: 'http://res.gnddt.com/',
  },
  app: {
    title: 'TienTool - Gunny2017',
    version: '1.0.0',
  },
};

export default config;
