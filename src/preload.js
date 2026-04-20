const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Auth
  login: (key) => ipcRenderer.invoke('auth:login', key),

  // Accounts CRUD
  getAccounts: (keyId) => ipcRenderer.invoke('accounts:list', keyId),
  createAccount: (data) => ipcRenderer.invoke('accounts:create', data),
  updateAccount: (id, data) => ipcRenderer.invoke('accounts:update', id, data),
  deleteAccount: (id) => ipcRenderer.invoke('accounts:delete', id),

  // Game
  loginGame: (username, password, serverId) => ipcRenderer.invoke('game:login', username, password, serverId),
  renameWindow: (pid, newName) => ipcRenderer.invoke('game:rename-window', pid, newName),
  arrangeLaunchers: () => ipcRenderer.invoke('game:arrange-launchers'),

  // Auto
  // get token api -- getLoginToken api service
  getTokenApi: (username, password) => ipcRenderer.invoke('auto:get-token-api', username, password),
  openBatFile: () => ipcRenderer.invoke('auto:open-bat-file'),
  getAllCode: (keyId) => ipcRenderer.invoke('auto:get-all-code', keyId),
  stopGetAllCode: () => ipcRenderer.invoke('auto:stop-all-code'),
  onAutoProgress: (callback) => ipcRenderer.on('auto:progress', (_event, data) => callback(data)),

  // Webshop
  openWebshop: (token) => ipcRenderer.invoke('open-webshop', token),
});
