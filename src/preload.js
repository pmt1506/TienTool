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
});
