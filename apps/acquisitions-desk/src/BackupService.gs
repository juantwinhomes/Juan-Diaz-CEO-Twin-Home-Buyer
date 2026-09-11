/**
 * BackupService.gs — daily timestamped copy of the Master Database into a Drive folder, logged in BACKUP_LOG.
 */

function getBackupFolder_() {
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}
/** Runs as the script owner (time trigger). Never throws — failures are logged to BACKUP_LOG and ERROR_LOG. */
function runDailyBackup() {
  // Callable by the time trigger (owner) or an ADMIN from the app; anyone else is refused.
  try { if (!isOwnerSession_()) requireCapability_(getCurrentUser_(), 'backup'); }
  catch (e) { return fail_(e.code || 'ACCESS_DENIED', e.message); }
  var id = generateEventId_('BKP'), ts = nowUtcIso_(), name = APP_NAME + ' Backup - ' + Utilities.formatDate(new Date(), getBusinessTimezone_(), 'yyyy-MM-dd HH:mm');
  try {
    var folder = getBackupFolder_();
    var copy = DriveApp.getFileById(getDbId_()).makeCopy(name, folder);
    appendRowObject_(SHEETS.BACKUP_LOG, { backup_id: id, timestamp: ts, backup_file_id: copy.getId(), backup_name: name, status: 'SUCCESS', error: '' });
    pruneOldBackups_(folder);
    return { ok: true, data: { backup_id: id, file_id: copy.getId(), name: name, folder_id: folder.getId() } };
  } catch (e) {
    try { appendRowObject_(SHEETS.BACKUP_LOG, { backup_id: id, timestamp: ts, backup_file_id: '', backup_name: name, status: 'FAILED', error: String(e && e.message || e).slice(0, 1000) }); } catch (e2) {}
    logError_('runDailyBackup', null, e, 'BACKUP', id);
    return fail_('BACKUP_FAILED', String(e && e.message || e));
  }
}
/** Optional retention: SETTINGS backup_retention_days (0 = keep everything). Old copies go to trash, never permanently deleted. */
function pruneOldBackups_(folder) {
  var days = getSettingNumber_('backup_retention_days', 0); if (!days) return;
  var cutoff = Date.now() - days * 86400000, files = folder.getFiles();
  while (files.hasNext()) { var f = files.next(); if (f.getName().indexOf(APP_NAME + ' Backup') === 0 && f.getDateCreated().getTime() < cutoff) f.setTrashed(true); }
}
/** Client-callable manual backup (ADMIN). */
function createDatabaseBackup() {
  return guarded_('createDatabaseBackup', function (user) {
    var r = runDailyBackup();
    if (r.ok) audit_(user, 'BACKUP', r.data.backup_id, 'BACKUP_CREATED', r.data);
    return r;
  }, { capability: 'backup' });
}
function getBackupLog(limit) {
  return guarded_('getBackupLog', function (user) { return ok_(readTable_(SHEETS.BACKUP_LOG).rows.slice(-(Math.min(200, toNum_(limit) || 30))).reverse()); }, { capability: 'view_audit' });
}
