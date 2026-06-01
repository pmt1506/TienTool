import { app, BrowserWindow, ipcMain, screen, session, dialog } from 'electron';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import started from 'electron-squirrel-startup';
import { connect, disconnect, getDb } from './database/mongodb.js';
import {
  loginByKey,
  checkKeyExists,
  createRegistrationRequest,
  getRegistrationRequestStatus,
  resendLicenseEmail,
} from './services/authService.js';
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from './services/accountService.js';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from './services/templateService.js';
import { loginGame } from './services/loginService.js';
import { registerCharacter } from './services/registerService.js';
import { startResetMark } from './services/resetMarkService.js';
import * as koffiService from './koffiService.js';
import { getLoginToken } from './services/apiService.js';
import { getAllCode, getWeeklyCode } from './services/autoService.js';
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
let logWindow = null;
const activePids = [];
let hasShownDbError = false;
const savedLicensePath = () => path.join(app.getPath('userData'), 'license.json');

// Patch console to send logs to renderer
const originalLog = console.log;
const originalError = console.error;

function sendLogToWindow(level, args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    mainWindow.webContents.send('app:log', `[${level}] ${msg}`);
  }
  if (logWindow && !logWindow.isDestroyed()) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    logWindow.webContents.send('app:log', `[${level}] ${msg}`);
  }
}

console.log = (...args) => {
  originalLog(...args);
  sendLogToWindow('INFO', args);
};

console.error = (...args) => {
  originalError(...args);
  sendLogToWindow('ERROR', args);
};

async function ensureDbConnected() {
  try {
    getDb();
    return true;
  } catch {
    try {
      await connect();
      hasShownDbError = false;
      console.log('[App] MongoDB connected (lazy)');
      return true;
    } catch (err) {
      console.error('[App] Failed to connect MongoDB:', err.message);
      if (!hasShownDbError) {
        hasShownDbError = true;
        dialog.showMessageBox({
          type: 'error',
          title: 'Kết nối dữ liệu thất bại',
          message: 'Không thể kết nối MongoDB. Vui lòng kiểm tra MONGODB_URI và thử lại.',
          detail: String(err.message || err),
        });
      }
      return false;
    }
  }
}


const createWindow = () => {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;

  const windowWidth = 700;
  const windowHeight = 550;
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

ipcMain.handle('window:open-log', () => {
  if (logWindow) {
    if (logWindow.isMinimized()) logWindow.restore();
    logWindow.focus();
    return;
  }

  logWindow = new BrowserWindow({
    width: 650,
    height: 450,
    title: 'TienTool - Logs',
    frame: false,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    logWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?page=log`);
  } else {
    logWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      { search: 'page=log' }
    );
  }

  logWindow.on('closed', () => {
    logWindow = null;
  });
});

// Auth
ipcMain.handle('auth:login', async (_event, key) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await loginByKey(key);
});

ipcMain.handle('auth:check-key', async (_event, key) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await checkKeyExists(key);
});

ipcMain.handle('auth:create-register-request', async (_event, email) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await createRegistrationRequest(email);
});

ipcMain.handle('auth:get-register-request-status', async (_event, requestId) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await getRegistrationRequestStatus(requestId);
});

ipcMain.handle('auth:resend-license-email', async (_event, email) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await resendLicenseEmail(email);
});

ipcMain.handle('auth:get-saved-key', async () => {
  try {
    const content = await fs.readFile(savedLicensePath(), 'utf8');
    const data = JSON.parse(content);
    return { success: true, key: String(data.key || '').trim() };
  } catch {
    return { success: true, key: '' };
  }
});

ipcMain.handle('auth:save-key', async (_event, key) => {
  try {
    await fs.mkdir(path.dirname(savedLicensePath()), { recursive: true });
    await fs.writeFile(savedLicensePath(), JSON.stringify({ key: String(key || '').trim() }), 'utf8');
    return { success: true };
  } catch (error) {
    console.error('[Main] Save key error:', error.message);
    return { success: false, error: 'Khong luu duoc key tren may.' };
  }
});

ipcMain.handle('auth:clear-saved-key', async () => {
  try {
    await fs.rm(savedLicensePath(), { force: true });
    return { success: true };
  } catch (error) {
    console.error('[Main] Clear saved key error:', error.message);
    return { success: false, error: 'Khong xoa duoc key da luu.' };
  }
});

// Accounts CRUD
ipcMain.handle('accounts:list', async (_event, keyId) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await getAccounts(keyId);
});

ipcMain.handle('accounts:create', async (_event, data) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await createAccount(data);
});

ipcMain.handle('accounts:update', async (_event, id, data) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await updateAccount(id, data);
});

ipcMain.handle('accounts:delete', async (_event, id) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await deleteAccount(id);
});

// Templates CRUD
ipcMain.handle('templates:list', async (_event, keyId) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await getTemplates(keyId);
});

ipcMain.handle('templates:create', async (_event, data) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await createTemplate(data);
});

ipcMain.handle('templates:update', async (_event, id, data) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await updateTemplate(id, data);
});

ipcMain.handle('templates:delete', async (_event, id) => {
  if (!(await ensureDbConnected())) {
    return { success: false, error: 'Khong ket noi duoc database.' };
  }
  return await deleteTemplate(id);
});

// Game
ipcMain.handle('game:login', async (_event, username, password, serverId, accountType, prefix, maxLength, checkReg) => {
  const result = await loginGame(username, password, serverId, accountType, prefix, maxLength, checkReg);
  if (result.success && result.pid) {
    activePids.push(result.pid);
  }
  return result;
});

ipcMain.handle('game:register-character', async (_event, username, password, serverId, prefix, maxLength) => {
  return await registerCharacter(username, password, serverId, prefix, maxLength);
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

ipcMain.handle('game:arrange-launchers-100', async (_event, targetPids) => {
  let pidsToArrange = targetPids;
  if (!pidsToArrange || pidsToArrange.length === 0) {
    pidsToArrange = activePids.filter(pid => {
      const rect = koffiService.getWindowRectByPid(pid);
      return rect !== null;
    });
  }

  const validPids = pidsToArrange.filter(pid => {
    const rect = koffiService.getWindowRectByPid(pid);
    return rect !== null;
  });

  if (validPids.length === 0) return { success: false, msg: 'Chưa có launcher nào mở.' };

  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;

  validPids.forEach((pid, index) => {
    if (index >= 4) return;

    const rect = koffiService.getWindowRectByPid(pid);
    if (!rect) return;

    let x = workArea.x;
    let y = workArea.y;

    // Index 0: Top-Left
    // Index 1: Top-Right
    if (index === 1 || index === 3) {
      x = workArea.x + workArea.width - rect.width;
    }
    // Index 2: Bottom-Left
    // Index 3: Bottom-Right
    if (index === 2 || index === 3) {
      y = workArea.y + workArea.height - rect.height;
    }

    // useSize = false to keep current dimensions
    koffiService.moveWindowByPid(pid, x, y, 0, 0, false);
  });

  return { success: true };
});

ipcMain.handle('auto:setup-first-run', async () => {
  try {
    const sourceClickermannDir = app.isPackaged
      ? path.join(process.resourcesPath, 'clickermann')
      : path.join(app.getAppPath(), 'src', 'resources', 'clickermann');

    const clickermannDir = path.join(app.getPath('userData'), 'clickermann');
    const clickermannExe = path.join(clickermannDir, 'Clickermann.exe');

    log.info(`[Main] Setup first run - Source: ${sourceClickermannDir}, Target: ${clickermannDir}`);

    let needsFullCopy = false;

    try {
      await fs.access(clickermannExe);
    } catch {
      needsFullCopy = true;
    }

    if (needsFullCopy) {
      log.info('[Main] Clickermann.exe not found in userData — performing initial copy...');

      await fs.mkdir(clickermannDir, { recursive: true });
      await fs.cp(sourceClickermannDir, clickermannDir, { recursive: true });

      log.info('[Main] Full copy of Clickermann completed successfully!');
    } else {
      try {
        await mergeClickermann(sourceClickermannDir, clickermannDir);
      } catch (mergeErr) {
        log.warn('[Main] Merge copy failed (non-critical):', mergeErr.message);
      }
    }

    try {
      for (const batName of ['script_multiple.bat', 'script.bat']) {
        const srcBat = path.join(sourceClickermannDir, batName);
        const destBat = path.join(clickermannDir, batName);
        await fs.copyFile(srcBat, destBat);
      }
    } catch (batCopyErr) {
      log.warn('[Main] Could not update bat files from source:', batCopyErr.message);
    }

    await fs.access(clickermannExe);

    log.info(`[Main] Clickermann exists: ${clickermannExe}`);
    log.info('[Main] Executing Clickermann.exe as Administrator...');

    const escapedExe = clickermannExe.replace(/'/g, "''");
    const escapedDir = clickermannDir.replace(/'/g, "''");
    const psCommand = `Start-Process -FilePath '${escapedExe}' -WorkingDirectory '${escapedDir}' -Verb RunAs -ErrorAction Stop`;

    try {
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        psCommand,
      ], {
        detached: false,
        windowsHide: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderrOutput = '';
      child.stderr.on('data', (chunk) => {
        stderrOutput += chunk.toString();
      });

      child.on('error', (spawnErr) => {
        log.error(`[Main] Error spawning PowerShell: ${spawnErr.message}`);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          log.error(`[Main] PowerShell exited with code ${code}. ${stderrOutput.trim()}`);
        } else {
          log.info('[Main] PowerShell command executed, waiting for UAC/Clickermann process.');
        }
      });
    } catch (spawnErr) {
      log.error(`[Main] Error spawning PowerShell: ${spawnErr.message}`);
    }

    return { success: true };
  } catch (err) {
    log.error('[Main] Error in auto:setup-first-run:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auto:open-bat-file', async () => {
  try {
    // Source: bundled clickermann in resources (install dir) — gets overwritten on updates
    const sourceClickermannDir = app.isPackaged
      ? path.join(process.resourcesPath, 'clickermann')
      : path.join(app.getAppPath(), 'src', 'resources', 'clickermann');

    // Destination: persistent copy in userData — survives updates
    const clickermannDir = path.join(app.getPath('userData'), 'clickermann');
    const clickermannExe = path.join(clickermannDir, 'Clickermann.exe');

    log.info(`[Main] Source clickermann: ${sourceClickermannDir}`);
    log.info(`[Main] Target clickermann: ${clickermannDir}`);

    // Check if Clickermann.exe exists (not just folder) to detect partial/missing copies
    let needsFullCopy = false;
    try {
      await fs.access(clickermannExe);
      log.info('[Main] Clickermann.exe found in userData — skipping full copy.');
    } catch {
      needsFullCopy = true;
    }

    if (needsFullCopy) {
      log.info('[Main] Clickermann.exe not found in userData — performing initial copy...');
      try {
        // Ensure target dir exists
        await fs.mkdir(clickermannDir, { recursive: true });
        await fs.cp(sourceClickermannDir, clickermannDir, { recursive: true });
        log.info('[Main] Full copy of Clickermann completed successfully!');
      } catch (cpErr) {
        log.error('[Main] Error copying Clickermann:', cpErr);
        // If copy fails, try to use the source dir directly as fallback
      }
    } else {
      // Merge: copy only new files from source that don't already exist in userData
      // This handles app updates that may ship new/updated scripts without overwriting user customizations
      try {
        await mergeClickermann(sourceClickermannDir, clickermannDir);
      } catch (mergeErr) {
        log.warn('[Main] Merge copy failed (non-critical):', mergeErr.message);
      }
    }

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
        log.info(`[Main] Updated ${fileName} with dynamic paths: ${clickermannDir}`);
      } catch (fsErr) {
        log.warn(`[Main] Could not update ${fileName}: ${fsErr.message}`);
      }
    };

    await patchHistory('history.txt');
    await patchHistory('history1.txt');
    await patchHistory('history_editor.txt');

    // Always update bat files from source (they use %~dp0, not user-customizable)
    try {
      for (const batName of ['script_multiple.bat', 'script.bat']) {
        const srcBat = path.join(sourceClickermannDir, batName);
        const destBat = path.join(clickermannDir, batName);
        await fs.copyFile(srcBat, destBat);
      }
      log.info('[Main] Updated bat files from source.');
    } catch (batCopyErr) {
      log.warn('[Main] Could not update bat files from source:', batCopyErr.message);
    }

    const batPath = path.join(clickermannDir, 'script_multiple.bat');

    exec(`start "" "${batPath}"`, { cwd: clickermannDir }, (error) => {
      if (error) {
        log.error(`[Main] Error executing bat: ${error.message}`);
      }
    });

    return { success: true };
  } catch (err) {
    log.error('[Main] Error in auto:open-bat-file:', err);
    return { success: false, error: err.message };
  }
});

/**
 * Merge files from source → destination without overwriting existing files.
 * Only copies files that don't exist in the destination yet.
 * This preserves user-customized scripts while allowing new files from updates.
 */
async function mergeClickermann(srcDir, destDir) {
  let entries;
  try {
    entries = await fs.readdir(srcDir, { withFileTypes: true });
  } catch {
    return; // source doesn't exist (dev mode without resources folder)
  }

  await fs.mkdir(destDir, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await mergeClickermann(srcPath, destPath);
    } else {
      try {
        await fs.access(destPath);
        // File already exists in userData — do NOT overwrite
      } catch {
        // File doesn't exist — copy it from source
        await fs.copyFile(srcPath, destPath);
        log.info(`[Main] Merged new file: ${entry.name}`);
      }
    }
  }
}

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
    url: 'https://api.gnddt.com', // domain API
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

// Reset Mark (Reset Ấn V15)
let stopResetMarkFlag = false;

ipcMain.handle('game:reset-mark', async (event, accounts) => {
  stopResetMarkFlag = false;
  try {
    await startResetMark(
      accounts,
      (progressData) => {
        // Use existing auto:progress channel
        event.sender.send('auto:progress', progressData);
      },
      () => stopResetMarkFlag
    );
    return { success: true };
  } catch (err) {
    console.error('game:reset-mark error', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('game:stop-reset-mark', async () => {
  stopResetMarkFlag = true;
  return { success: true };
});

// ─── App Lifecycle ──────────────────────────────────────────────

app.whenReady().then(async () => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Periodically check and auto-close the IP Vietnam alert
  setInterval(() => {
    koffiService.autoCloseAlertByTitle('Javascript Alert');
  }, 2000);
});

app.on('window-all-closed', async () => {
  await disconnect();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
