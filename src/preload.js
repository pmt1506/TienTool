const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  openLogWindow: () => ipcRenderer.invoke('window:open-log'),

  // Auth
  login: (key) => ipcRenderer.invoke('auth:login', key),
  checkKey: (key) => ipcRenderer.invoke('auth:check-key', key),
  createRegisterRequest: (email) => ipcRenderer.invoke('auth:create-register-request', email),
  getRegisterRequestStatus: (requestId) => ipcRenderer.invoke('auth:get-register-request-status', requestId),
  resendLicenseEmail: (email) => ipcRenderer.invoke('auth:resend-license-email', email),
  exportKeyTxt: (email, key) => ipcRenderer.invoke('auth:export-key-txt', email, key),
  getSavedKey: () => ipcRenderer.invoke('auth:get-saved-key'),
  saveKey: (key) => ipcRenderer.invoke('auth:save-key', key),
  clearSavedKey: () => ipcRenderer.invoke('auth:clear-saved-key'),

  // Accounts CRUD
  getAccounts: (keyId) => ipcRenderer.invoke('accounts:list', keyId),
  createAccount: (data) => ipcRenderer.invoke('accounts:create', data),
  createAccountsBatch: (list) => ipcRenderer.invoke('accounts:create-batch', list),
  updateAccount: (id, data) => ipcRenderer.invoke('accounts:update', id, data),
  deleteAccount: (id) => ipcRenderer.invoke('accounts:delete', id),
  deleteAccountsBatch: (ids) => ipcRenderer.invoke('accounts:delete-batch', ids),

  // Templates
  getTemplates: (keyId) => ipcRenderer.invoke('templates:list', keyId),
  createTemplate: (data) => ipcRenderer.invoke('templates:create', data),
  updateTemplate: (id, data) => ipcRenderer.invoke('templates:update', id, data),
  deleteTemplate: (id) => ipcRenderer.invoke('templates:delete', id),

  // Game
  loginGame: (username, password, serverId, accountType, prefix, maxLength, checkReg) => ipcRenderer.invoke('game:login', username, password, serverId, accountType, prefix, maxLength, checkReg),
  renameWindow: (pid, newName) => ipcRenderer.invoke('game:rename-window', pid, newName),
  arrangeLaunchers: () => ipcRenderer.invoke('game:arrange-launchers'),
  arrangeLaunchers100: (pids) => ipcRenderer.invoke('game:arrange-launchers-100', pids),
  registerCharacter: (username, password, serverId, prefix, maxLength) => ipcRenderer.invoke('game:register-character', username, password, serverId, prefix, maxLength),
  registerAccount: (username, password, options) => ipcRenderer.invoke('game:register-account', username, password, options),
  claimAndUseSubscriberCodes: (username, password, token, targetServer) => ipcRenderer.invoke('game:claim-and-use-subscriber-codes', username, password, token, targetServer),
  onSubscriberCodesProgress: (callback) => ipcRenderer.on('subscriber-codes:progress', (_event, data) => callback(data)),
  checkAccountOnline: (username, password) => ipcRenderer.invoke('game:check-online', username, password),
  clearCache: () => ipcRenderer.invoke('game:clear-cache'),
  updateResources: () => ipcRenderer.invoke('game:update-resources'),
  stopUpdate: () => ipcRenderer.invoke('game:stop-update'),

  // Auto
  // get token api -- getLoginToken api service
  getTokenApi: (username, password) => ipcRenderer.invoke('auto:get-token-api', username, password),
  setupFirstRun: () => ipcRenderer.invoke('auto:setup-first-run'),
  openBatFile: () => ipcRenderer.invoke('auto:open-bat-file'),
  getAllCode: (keyId) => ipcRenderer.invoke('auto:get-all-code', keyId),
  stopGetAllCode: () => ipcRenderer.invoke('auto:stop-all-code'),
  openWeeklyCodeTxt: () => ipcRenderer.invoke('auto:open-weekly-code-txt'),
  getWeeklyCode: (keyId, codes) => ipcRenderer.invoke('auto:get-weekly-code', keyId, codes),
  stopGetWeeklyCode: () => ipcRenderer.invoke('auto:stop-weekly-code'),
  
  // Reset Mark
  resetMark: (accounts) => ipcRenderer.invoke('game:reset-mark', accounts),
  stopResetMark: () => ipcRenderer.invoke('game:stop-reset-mark'),

  // Quà VIP 10 Tuần
  claimVipRewardWeek: (accounts) => ipcRenderer.invoke('game:vip-reward-week', accounts),
  stopVipRewardWeek: () => ipcRenderer.invoke('game:stop-vip-reward-week'),

  onAutoProgress: (callback) => ipcRenderer.on('auto:progress', (_event, data) => callback(data)),
  onShowDialog: (callback) => ipcRenderer.on('auto:show-dialog', (_event, data) => callback(data)),
  sendDialogResponse: (channel) => ipcRenderer.send(channel),
  onAppLog: (callback) => ipcRenderer.on('app:log', (_event, msg) => callback(msg)),
  // Ghi lại thao tác người dùng vào cùng bảng log với log tiến trình chính.
  logAction: (msg) => ipcRenderer.send('app:user-log', msg),

  // Webshop
  openWebshop: (token) => ipcRenderer.invoke('open-webshop', token),

  // Auto Update
  onUpdateAvailable: (callback) => ipcRenderer.on('update:available', (_event, info) => callback(info)),
  onUpdateProgress: (callback) => ipcRenderer.on('update:progress', (_event, progressObj) => callback(progressObj)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update:downloaded', (_event, info) => callback(info)),
  installUpdate: () => ipcRenderer.invoke('update:install'),
});
