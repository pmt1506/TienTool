import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { connect, disconnect } from './database/mongodb.js';
import { loginByKey } from './services/authService.js';
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from './services/accountService.js';
import { loginGame } from './services/loginService.js';
import * as koffiService from './koffiService.js';


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow = null;
const createWindow = () => {
  const display = screen.getPrimaryDisplay();
  const { x, y, width } = display.workArea;

  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },

    x: x + width - 900,
    y: y,
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
};

// ─── IPC Handlers ───────────────────────────────────────────────

// Window controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle('window:close', () => mainWindow?.close());

// Auth
ipcMain.handle('auth:login', async (_event, key) => {
  return await loginByKey(key);
});

// Accounts CRUD
ipcMain.handle('accounts:list', async (_event, keyId) => {
  return await getAccounts(keyId);
});

ipcMain.handle('accounts:create', async (_event, data) => {
  return await createAccount(data);
});

ipcMain.handle('accounts:update', async (_event, id, data) => {
  return await updateAccount(id, data);
});

ipcMain.handle('accounts:delete', async (_event, id) => {
  return await deleteAccount(id);
});

// Game
ipcMain.handle('game:login', async (_event, username, password, serverId) => {
  return await loginGame(username, password, serverId);
});

ipcMain.handle('game:rename-window', async (_event, pid, newName) => {
  return await koffiService.waitAndRename(pid, newName);
});

// ─── App Lifecycle ──────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    await connect();
    createWindow();
    console.log('[App] MongoDB connected, creating window...');
  } catch (err) {
    console.error('[App] Failed to connect MongoDB:', err.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  await disconnect();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
