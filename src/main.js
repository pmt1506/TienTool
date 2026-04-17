import { app, BrowserWindow, ipcMain, screen, session } from 'electron';
import path from 'node:path';
import { exec } from 'node:child_process';
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
import { getAllCode } from './services/autoService.js';
import * as koffiService from './koffiService.js';
import { getLoginToken } from './services/apiService.js';


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

ipcMain.handle('auto:open-bat-file', async () => {
  const batPath = 'C:\\Tool Login\\Auto\\script_multiple.bat';

  exec(`start "" "${batPath}"`, (error) => {
    if (error) {
      console.error(`[Main] Error executing bat: ${error.message}`);
    }
  });

  return { success: true };
});

// Auto nhận code
let isAutoStopped = false;

ipcMain.handle('auto:get-all-code', async (_event, keyId) => {
  isAutoStopped = false;

  const onProgress = (data) => {
    mainWindow?.webContents.send('auto:progress', data);
  };

  const checkStop = () => isAutoStopped;

  try {
    await getAllCode(keyId, onProgress, checkStop);
    return { success: true };
  } catch (err) {
    console.error('[Main] getAllCode error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auto:stop-all-code', () => {
  isAutoStopped = true;
  return { success: true };
});


ipcMain.handle('auto:get-token-api', async (_event, username, password) => {
  // if (checkStop && checkStop()) return null;
  return await getLoginToken(username, password);
});



// Mở webshop
ipcMain.handle('open-webshop', async (event, token) => {
  const ses = session.defaultSession;

  // url https://sv3.gnddt.com/cua-hang
  await ses.cookies.set({
    url: 'https://api3.gnddt.com', // domain API
    name: 'Authorization',         // hoặc Token (tùy backend)
    value: token,
    path: '/',
  });

  // Mở cửa sổ mới
  const win = new BrowserWindow({
    // full screen
    fullscreen: true,
    webPreferences: {
      session: ses, // quan trọng: dùng session đã set cookie
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL('https://sv3.gnddt.com/cua-hang');

  return { success: true };
})

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
