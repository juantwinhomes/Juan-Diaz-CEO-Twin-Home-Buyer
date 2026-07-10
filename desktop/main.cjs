const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createBridge } = require('./bridge.cjs');
const { refreshAll } = require('./refresh.cjs');
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch { /* dev mode without dep */ }

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULTS = {
  bridgePort: 3777,
  webhookSecret: '',
  qboClientId: '', qboClientSecret: '', qboRefreshToken: '', qboRealmId: '', qboEnvironment: 'production',
  periodStart: '2026-01-01', periodEnd: '2026-12-31',
  mondayToken: '',
  mondayBoardId: '18421418228',            // 📬 Direct Mail & Postcard Leads
  mondayNewLeadGroupId: 'group_mm54scqh',  // 🚨 New Leads
  redstoneBoardId: '18392647066',
  redstoneQtyCol: 'numeric_mm3k840b',
  redstoneCostCol: 'numeric_mm3kd2w',
  mondayColumns: {
    source: 'color_mm54emr0', leadStage: 'color_mm548bx', campaign: 'text_mm54s1vj',
    mailBatch: 'text_mm54ertw', leadId: 'text_mm54em6', phone: 'phone_mm54d58j',
    location: 'location_mm5432yk', dateReceived: 'date_mm542afm', notes: 'long_text_mm54j54x',
  },
  closedStages: ['Acquired', 'Closed / Won'],
};

function loadConfig() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}
function saveConfig(patch) {
  const merged = { ...loadConfig(), ...patch };
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(merged, null, 2));
  return merged;
}

const logBuffer = [];
const pushLog = (line) => {
  const stamped = `${new Date().toLocaleTimeString()}  ${line}`;
  logBuffer.push(stamped);
  if (logBuffer.length > 500) logBuffer.shift();
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('bridge-log', stamped);
};

let bridgeServer = null;
function startBridge() {
  return new Promise((resolve) => {
    if (bridgeServer) return resolve({ ok: true, already: true, port: loadConfig().bridgePort });
    const cfg = loadConfig();
    const appExpress = createBridge(loadConfig, pushLog);
    bridgeServer = http.createServer(appExpress);
    bridgeServer.on('error', (e) => { pushLog('[bridge] error: ' + e.message); resolve({ ok: false, error: e.message }); });
    bridgeServer.listen(cfg.bridgePort, () => { pushLog(`[bridge] listening on http://localhost:${cfg.bridgePort}`); resolve({ ok: true, port: cfg.bridgePort }); });
  });
}
function stopBridge() {
  return new Promise((resolve) => {
    if (!bridgeServer) return resolve({ ok: true, stopped: false });
    bridgeServer.close(() => { bridgeServer = null; pushLog('[bridge] stopped'); resolve({ ok: true, stopped: true }); });
  });
}

function dashboardPath() {
  // Packaged: extraResources; dev: repo root.
  const packaged = path.join(process.resourcesPath || '', 'thb_kpi_dashboard.html');
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', 'thb_kpi_dashboard.html');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 900, backgroundColor: '#141413',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('cfg:get', () => loadConfig());
ipcMain.handle('cfg:save', (_e, patch) => saveConfig(patch));
ipcMain.handle('bridge:start', () => startBridge());
ipcMain.handle('bridge:stop', () => stopBridge());
ipcMain.handle('bridge:status', () => ({ running: !!bridgeServer, port: loadConfig().bridgePort, logs: logBuffer.slice(-200) }));
ipcMain.handle('dashboard:path', () => dashboardPath());
ipcMain.handle('data:refresh', async () => { try { return { ok: true, data: await refreshAll(loadConfig()) }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('open:external', (_e, url) => shell.openExternal(url));

// --- Auto-update: check on launch and once a day, download + install on quit ---
function setupAutoUpdate() {
  if (!autoUpdater || !app.isPackaged) { pushLog('[update] auto-update inactive (dev mode)'); return; }
  autoUpdater.autoDownload = true;
  autoUpdater.on('checking-for-update', () => pushLog('[update] checking for updates…'));
  autoUpdater.on('update-available', (i) => pushLog(`[update] new version ${i?.version} available — downloading`));
  autoUpdater.on('update-not-available', () => pushLog('[update] up to date'));
  autoUpdater.on('download-progress', (p) => pushLog(`[update] downloading ${Math.round(p.percent)}%`));
  autoUpdater.on('update-downloaded', (i) => pushLog(`[update] version ${i?.version} downloaded — installs on next quit`));
  autoUpdater.on('error', (e) => pushLog('[update] error: ' + (e?.message || e)));
  const check = () => { autoUpdater.checkForUpdatesAndNotify().catch((e) => pushLog('[update] check failed: ' + e.message)); };
  check();
  setInterval(check, 24 * 60 * 60 * 1000); // daily
}

ipcMain.handle('update:check', () => { if (autoUpdater && app.isPackaged) autoUpdater.checkForUpdatesAndNotify(); return { ok: true }; });

app.whenReady().then(() => {
  createWindow();
  startBridge();
  setupAutoUpdate();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
