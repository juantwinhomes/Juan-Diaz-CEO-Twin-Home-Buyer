const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createBridge } = require('./bridge.cjs');
const { refreshAll } = require('./refresh.cjs');

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULTS = {
  bridgePort: 3777,
  webhookSecret: '',
  qboClientId: '', qboClientSecret: '', qboRefreshToken: '', qboRealmId: '', qboEnvironment: 'production',
  periodStart: '2026-01-01', periodEnd: '2026-12-31',
  mondayToken: '',
  mondayBoardId: '18392647845',
  mondayNewLeadGroupId: 'topics',
  redstoneBoardId: '18392647066',
  redstoneQtyCol: 'numeric_mm3k840b',
  redstoneCostCol: 'numeric_mm3kd2w',
  mondayColumns: {
    leadName: 'text_mm3vahm9', leadId: 'text_mm3swbma', contactStatus: 'status',
    county: 'dropdown_mkyr1cc6', dateReceived: 'date_mm3sgnvn', notes: 'long_text_mkyrkwjz', location: 'location_mm4kxecc',
  },
  closedStages: ['Acquired', 'Wholesale Closed'],
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

app.whenReady().then(() => {
  createWindow();
  startBridge();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
