/**
 * ClearTools.gs — empties the tool inventory so real builds can be entered from scratch.
 *
 * Run `previewClearTools()` first: it lists what would go and writes nothing.
 * Then run `clearTools()`. It takes a backup copy of the whole database first, then removes every row from
 * TOOL_INVENTORY, TOOL_TRAINING and TOOL_RUNS.
 *
 * This is the one place in the desk that deletes rather than archives, because a seeded example is not history.
 * The backup is the undo: BACKUP_LOG names the copy in Drive. Afterwards setupDatabase will not put the examples
 * back, so an empty inventory stays empty.
 */
var PROP_TOOLS_SEEDED = 'tools_seeded';

function previewClearTools() { return logResult_('previewClearTools', runClearTools_(false)); }
function clearTools() { return logResult_('clearTools', runClearTools_(true)); }

function runClearTools_(write) {
  return guarded_('runClearTools', function (user) {
    requireCapability_(user, 'manage_tools');
    var tools = readTable_(SHEETS.TOOL_INVENTORY).rows;
    var report = {
      mode: write ? 'cleared' : 'preview (nothing written)',
      tools: tools.length, training_records: readTable_(SHEETS.TOOL_TRAINING).rows.length,
      runs: readTable_(SHEETS.TOOL_RUNS).rows.length,
      names: tools.map(function (t) { return toStr_(t.name); })
    };
    if (!write || !tools.length) {
      if (!tools.length) report.mode = 'nothing to clear — the inventory is already empty';
      return ok_(report, report.tools + ' tools ' + (write ? 'already gone' : 'would be removed'));
    }
    var backup = runDailyBackup();
    if (!backup.ok) return fail_(backup.code || 'SERVER_ERROR', 'Stopped: could not take a backup first. ' + (backup.message || ''));
    report.backup = backup.data;
    withLock_(function () {
      [SHEETS.TOOL_INVENTORY, SHEETS.TOOL_TRAINING, SHEETS.TOOL_RUNS].forEach(clearDataRows_);
    });
    PropertiesService.getScriptProperties().setProperty(PROP_TOOLS_SEEDED, 'cleared ' + nowUtcIso_());
    audit_(user, 'TOOL', 'ALL', 'TOOLS_CLEARED', { tools: report.tools, backup_id: backup.data.backup_id });
    return ok_(report, report.tools + ' tools removed. A backup was taken first: ' + backup.data.name);
  }, { capability: 'view_tools' });
}

/** Removes every row below the header of a sheet, leaving the header and formatting in place. */
function clearDataRows_(name) {
  var sh = getSheet_(name), lastRow = sh.getLastRow();
  if (lastRow >= 2) sh.getRange(2, 1, lastRow - 1, sh.getMaxColumns()).clearContent();
  invalidateTable_(name);
}
