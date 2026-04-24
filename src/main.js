import { app, BrowserWindow, ipcMain, screen, session, dialog } from 'electron';
import path from 'node:path';
import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
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
import { getAllCode, getWeeklyCode } from './services/autoService.js';
import * as koffiService from './koffiService.js';
import { getLoginToken } from './services/apiService.js';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

// Configure logging for auto-updater
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow = null;
const activePids = [];

const createWindow = () => {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;

  const windowWidth = 700;
  const windowHeight = 500;
  const margin = 5; // khoảng cách với mép màn hình

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },

    // góc phải trên + margin
    x: x + width - windowWidth - margin,
    y: y + margin,
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    dialog.showMessageBox({
      type: 'info',
      message: 'Có bản cập nhật mới, đang tải...',
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    log.info(log_message);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info);
    dialog.showMessageBox({
      type: 'info',
      message: 'Đã tải xong bản cập nhật, khởi động lại để sử dụng',
    }).then(() => {
      autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.checkForUpdatesAndNotify();

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
  const result = await loginGame(username, password, serverId);
  if (result.success && result.pid) {
    activePids.push(result.pid);
  }
  return result;
});

ipcMain.handle('game:rename-window', async (_event, pid, newName) => {
  return await koffiService.waitAndRename(pid, newName);
});

ipcMain.handle('game:arrange-launchers', async () => {
  // Filter out PIDs that might have been closed (non-existent HWND)
  const validPids = activePids.filter(pid => {
    const rect = koffiService.getWindowRectByPid(pid);
    return rect !== null;
  });

  if (validPids.length === 0) return { success: false, msg: 'Chưa có launcher nào mở.' };

  const displays = screen.getAllDisplays();

  // Group PIDs by monitor
  const monitorGroups = {}; // displayId -> [pids]

  validPids.forEach(pid => {
    const rect = koffiService.getWindowRectByPid(pid);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const display = screen.getDisplayMatching({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    const dId = display.id;
    if (!monitorGroups[dId]) monitorGroups[dId] = [];
    monitorGroups[dId].push(pid);
  });

  // Arrange for each monitor
  for (const display of displays) {
    const pidsInMonitor = monitorGroups[display.id];
    if (!pidsInMonitor || pidsInMonitor.length === 0) continue;

    const count = pidsInMonitor.length;
    let cols = 2;
    if (count > 4) cols = 3;

    // Start at "10 o'clock" position (offset from top-left)
    const START_X = 30;
    const START_Y = 30;

    const rectSample = koffiService.getWindowRectByPid(pidsInMonitor[0]);

    const STEP_X = rectSample.width + 15;   // tăng số này để giãn ngang
    const STEP_Y = rectSample.height + 15;  // giãn dọc

    const workArea = display.workArea;

    pidsInMonitor.forEach((pid, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      const x = workArea.x + START_X + (col * STEP_X);
      const y = workArea.y + START_Y + (row * STEP_Y);

      // useSize = false to preserve current dimensions
      koffiService.moveWindowByPid(pid, x, y, 0, 0, false);
    });
  }

  return { success: true };
});

ipcMain.handle('auto:open-bat-file', async () => {
  try {
    const clickermannDir = app.isPackaged
      ? path.join(process.resourcesPath, 'clickermann')
      : path.join(__dirname, '..', 'src', 'resources', 'clickermann');

    const patchHistory = async (fileName) => {
      const filePath = path.join(clickermannDir, 'data', fileName);
      try {
        const historyData = await fs.readFile(filePath, 'utf8');
        const lines = historyData.split(/\r?\n/).filter(line => line.trim().length > 0);
        const newLines = lines.map(line => {
          const baseName = path.basename(line.trim());
          return path.join(clickermannDir, baseName);
        });
        await fs.writeFile(filePath, newLines.join('\r\n'), 'utf8');
        console.log(`[Main] Updated ${fileName} with dynamic paths:`, clickermannDir);
      } catch (fsErr) {
        console.error(`[Main] Could not update ${fileName}:`, fsErr.message);
      }
    };

    await patchHistory('history.txt');
    await patchHistory('history1.txt');
    await patchHistory('history_editor.txt');

    const batPath = path.join(clickermannDir, 'script_multiple.bat');

    // Replace placeholders or legacy paths in bat files
    try {
      const placeholder = '__CLICKERMANN_DIR__';
      const patchBat = async (p) => {
        let content = await fs.readFile(p, 'utf8');
        let changed = false;
        if (content.includes(placeholder)) {
          content = content.replaceAll(placeholder, clickermannDir);
          changed = true;
        }
        // Fallback for any lingering legacy paths (case-insensitive)
        const legacyRegex = /C:\\Program Files \(x86\)\\[Gg]unny[Cc]lient\\Auto/g;
        if (legacyRegex.test(content)) {
          content = content.replace(legacyRegex, clickermannDir);
          changed = true;
        }
        if (changed) await fs.writeFile(p, content, 'utf8');
      };

      await patchBat(batPath);
      await patchBat(path.join(clickermannDir, 'script.bat'));
    } catch (batErr) {
      console.error('[Main] Could not update bat file:', batErr.message);
    }

    exec(`start "" "${batPath}"`, { cwd: clickermannDir }, (error) => {
      if (error) {
        console.error(`[Main] Error executing bat: ${error.message}`);
      }
    });

    return { success: true };
  } catch (err) {
    console.error('[Main] Error in auto:open-bat-file:', err);
    return { success: false, error: err.message };
  }
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

let isWeeklyAutoStopped = false;

ipcMain.handle('auto:open-weekly-code-txt', async () => {
  const txtPath = path.join(app.getPath('userData'), 'weekly_codes.txt');
  try {
    await fs.access(txtPath);
  } catch {
    await fs.writeFile(txtPath, '', 'utf8');
  }

  return new Promise((resolve) => {
    exec(`start /wait notepad "${txtPath}"`, async (error) => {
      try {
        const content = await fs.readFile(txtPath, 'utf8');
        const codes = content.split(/\r?\n/).map(c => c.trim()).filter(c => c.length > 0);
        resolve({ success: true, codes });
      } catch (err) {
        resolve({ success: false, msg: err.message });
      }
    });
  });
});

ipcMain.handle('auto:get-weekly-code', async (_event, keyId, codes) => {
  isWeeklyAutoStopped = false;

  const onProgress = (data) => {
    mainWindow?.webContents.send('auto:progress', data);
  };

  const checkStop = () => isWeeklyAutoStopped;

  try {
    await getWeeklyCode(keyId, codes, onProgress, checkStop);
    return { success: true };
  } catch (err) {
    console.error('[Main] getWeeklyCode error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auto:stop-weekly-code', () => {
  isWeeklyAutoStopped = true;
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
