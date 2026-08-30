const runtimeEnv = globalThis.process?.env ?? {};

const config = {
  mongodb: {
    uri: runtimeEnv.MONGODB_URI || (typeof __MONGODB_URI__ !== 'undefined' ? __MONGODB_URI__ : ''),
    dbName: 'qltk',
    collections: {
      keys: 'keys',
      licenseRequests: 'licenseRequests',
      accounts: 'accounts',
      templates: 'templates',
    },
  },
  api: {
    base: runtimeEnv.GNDDT_API_BASE || (typeof __GNDDT_API_BASE__ !== 'undefined' ? __GNDDT_API_BASE__ : 'https://api.gnddt.com'),
    webshop: runtimeEnv.GNDDT_WEBSHOP_URL || (typeof __GNDDT_WEBSHOP_URL__ !== 'undefined' ? __GNDDT_WEBSHOP_URL__ : 'https://gnddt.com/cua-hang'),
  },
  // Captcha giải cục bộ bằng Tesseract (offline); api-ninjas chỉ là fallback khi
  // worker Tesseract không khởi tạo được. apiNinjaKey ưu tiên env lúc chạy, fallback
  // về giá trị nhúng lúc build (__API_NINJA__) để bản đóng gói vẫn có key mà không
  // cần file .env đi kèm. maxAttempts đặt TRẦN số lần thử để không bao giờ treo.
  captcha: {
    apiNinjaKey: runtimeEnv.API_NINJA || (typeof __API_NINJA__ !== 'undefined' ? __API_NINJA__ : ''),
    retryDelayMs: 1200,
    minLength: 4,
    maxAttempts: 15,
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
