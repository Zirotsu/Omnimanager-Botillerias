const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { LicenseManager } = require('./license-manager.cjs');
const { DatabaseManager } = require('./database-manager.cjs');

let mainWindow = null;
let licenseManager = null;
let databaseManager = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1050,
    minHeight: 680,
    title: 'OmniManager Botillerías',
    show: false,
    backgroundColor: '#081018',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      backgroundThrottling: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://127.0.0.1:5173');
  }
}

function registerIpc() {
  ipcMain.handle('omni:license:status', () => licenseManager.getStatus());
  ipcMain.handle('omni:license:start-demo', () => licenseManager.activateDemo());
  ipcMain.handle('omni:license:activate', (_event, token) => licenseManager.activateCommercial(token));
  ipcMain.handle('omni:license:installation-id', () => licenseManager.getInstallationId());
  ipcMain.handle('omni:database:info', () => databaseManager.getInfo());
  ipcMain.handle('omni:database:backup', (_event, label) => databaseManager.backupNow(label));
  ipcMain.handle('omni:app:info', () => ({
    name: 'OmniManager Botillerías',
    version: app.getVersion(),
    packaged: app.isPackaged
  }));
}

app.whenReady().then(() => {
  app.setAppUserModelId('cl.helixfix.omnimanager.botillerias');

  licenseManager = new LicenseManager({
    userDataPath: app.getPath('userData'),
    resourcesPath: process.resourcesPath
  });

  databaseManager = new DatabaseManager({
    userDataPath: app.getPath('userData')
  });
  databaseManager.initialize();

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('before-quit', () => {
  databaseManager?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
