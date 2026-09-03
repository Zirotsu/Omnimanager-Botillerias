const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { LicenseManager } = require('./license-manager.cjs');
const { DatabaseManager } = require('./database-manager.cjs');
const { LocalDataStore } = require('./local-data-store.cjs');
const { CashRegisterStore } = require('./cash-register-store.cjs');

let mainWindow = null;
let licenseManager = null;
let databaseManager = null;
let dataStore = null;
let cashRegisterStore = null;

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

  if (app.isPackaged) mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  else mainWindow.loadURL('http://127.0.0.1:5173');
}

function requireActiveLicense() {
  const status = licenseManager.getStatus();
  if (status.status !== 'active') throw new Error('La licencia no está activa.');
  return status;
}

async function printHtml(payload = {}) {
  requireActiveLicense();
  const title = String(payload.title || 'OmniManager').slice(0, 120);
  const body = String(payload.html || '');
  if (!body.trim()) throw new Error('No hay contenido para imprimir.');

  const printWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 720,
    title,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });

  const document = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title.replace(/[<>&"]/g, '')}</title><style>
    @page { size: 80mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    html,body { margin:0; padding:0; background:#fff; color:#111; }
    body { width:72mm; max-width:72mm; font:11px/1.3 Arial,sans-serif; }
    h1 { font-size:18px; margin:0 0 3px; } h2 { font-size:14px; margin:10px 0 5px; }
    .center{text-align:center}.muted{color:#666}.line{border-top:1px dashed #777;margin:9px 0}
    .row{display:flex;justify-content:space-between;gap:10px;margin:4px 0}.total{font-size:16px;font-weight:800}
    table{width:100%;border-collapse:collapse}th,td{padding:4px 0;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}th:last-child,td:last-child{text-align:right}
    .small{font-size:9px}.strong{font-weight:800}
  </style></head><body>${body}</body></html>`;

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
    return await new Promise((resolve, reject) => {
      printWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        if (success) resolve({ ok: true });
        else reject(new Error(failureReason || 'Windows canceló la impresión.'));
      });
    });
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
}

function registerIpc() {
  ipcMain.handle('omni:license:status', () => licenseManager.getStatus());
  ipcMain.handle('omni:license:start-demo', () => licenseManager.activateDemo());
  ipcMain.handle('omni:license:activate', (_event, token) => licenseManager.activateCommercial(token));
  ipcMain.handle('omni:license:installation-id', () => licenseManager.getInstallationId());

  ipcMain.handle('omni:database:info', () => { requireActiveLicense(); return databaseManager.getInfo(); });
  ipcMain.handle('omni:database:backup', (_event, label) => { requireActiveLicense(); return databaseManager.backupNow(label); });
  ipcMain.handle('omni:data:snapshot', () => { requireActiveLicense(); return dataStore.snapshot(); });
  ipcMain.handle('omni:data:replace-snapshot', (_event, snapshot) => { requireActiveLicense(); databaseManager.backupNow('antes-restaurar'); return dataStore.replaceSnapshot(snapshot); });
  ipcMain.handle('omni:data:list', (_event, collection) => { requireActiveLicense(); return dataStore.list(collection); });
  ipcMain.handle('omni:data:put', (_event, collection, id, data) => { requireActiveLicense(); return dataStore.put(collection, id, data); });
  ipcMain.handle('omni:data:remove', (_event, collection, id) => { requireActiveLicense(); return dataStore.remove(collection, id); });
  ipcMain.handle('omni:data:save-profile', (_event, profile) => { requireActiveLicense(); return dataStore.saveProfile(profile); });
  ipcMain.handle('omni:data:import-products', (_event, products) => { requireActiveLicense(); return dataStore.importProducts(products); });
  ipcMain.handle('omni:data:import-barcodes', (_event, mappings) => { requireActiveLicense(); return dataStore.importBarcodes(mappings); });
  ipcMain.handle('omni:data:adjust-stock', (_event, payload) => { requireActiveLicense(); return dataStore.adjustStock(payload); });
  ipcMain.handle('omni:data:commit-sale', (_event, payload) => { requireActiveLicense(); return dataStore.commitSale(payload); });
  ipcMain.handle('omni:data:void-sale', (_event, saleId) => { requireActiveLicense(); return dataStore.voidSale(saleId); });
  ipcMain.handle('omni:data:commit-purchase', (_event, payload) => { requireActiveLicense(); return dataStore.commitPurchase(payload); });
  ipcMain.handle('omni:data:void-purchase', (_event, purchaseId) => { requireActiveLicense(); return dataStore.voidPurchase(purchaseId); });
  ipcMain.handle('omni:data:open-cash', (_event, payload) => { requireActiveLicense(); return cashRegisterStore.open(payload); });
  ipcMain.handle('omni:data:close-cash', (_event, payload) => { requireActiveLicense(); return cashRegisterStore.close(payload); });
  ipcMain.handle('omni:print:html', (_event, payload) => printHtml(payload));

  ipcMain.handle('omni:app:info', () => ({ name: 'OmniManager Botillerías', version: app.getVersion(), packaged: app.isPackaged }));
}

app.whenReady().then(() => {
  app.setAppUserModelId('cl.helixfix.omnimanager.botillerias');
  licenseManager = new LicenseManager({ userDataPath: app.getPath('userData'), resourcesPath: process.resourcesPath });
  databaseManager = new DatabaseManager({ userDataPath: app.getPath('userData') });
  databaseManager.initialize();
  dataStore = new LocalDataStore({ databasePath: databaseManager.databasePath });
  cashRegisterStore = new CashRegisterStore({ store: dataStore });
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('before-quit', () => { dataStore?.close(); databaseManager?.close(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
