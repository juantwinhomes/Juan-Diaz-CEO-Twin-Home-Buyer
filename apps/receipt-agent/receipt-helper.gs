/**
 * Twin Home Buyer Receipt Agent: helper script (the "hands").
 *
 * Runs free in Google Apps Script under accounting@twinhomebuyer.com (Kristine's account).
 * It does the mechanical jobs the Claude agent can't do, or can't do cheaply:
 *
 *   1. saveReceipts()             Every hour. Saves each email in the Gmail label "Receipts" to the
 *                                 Drive folder "Receipts Inbox". PDFs and photos are saved as they are.
 *                                 Email-only receipts (Amazon, Uber, Home Depot) are saved as a PDF of
 *                                 the email. Each file is listed on the control sheet's "Receipt Files" tab.
 *   2. exportJuanCalendar()       Every morning, 4-5 AM Pacific. Copies the last 7 days of Juan's calendar
 *                                 to the "Calendar" tab. The Claude calendar connector only reads the
 *                                 signed-in person's own calendar, so the agent reads this tab instead.
 *   3. sendMatchedToQuickBooks()  Every hour. For each "Attach Log" row the agent marked Send to QBO = YES,
 *                                 renames the Drive file to date_vendor_amount_card and emails it to the
 *                                 QuickBooks receipt address, then stamps "QBO Sent At".
 *
 * Install: apps/receipt-agent/README.md, section "Install the helper script".
 * Nothing here logs into QuickBooks. QuickBooks only receives files by email from accounting@.
 */

const CONFIG = {
  CONTROL_SHEET_ID: 'PASTE_CONTROL_SHEET_ID',
  RECEIPTS_FOLDER_ID: 'PASTE_RECEIPTS_INBOX_FOLDER_ID',
  RECEIPTS_LABEL: 'Receipts',
  OWN_ADDRESS: 'accounting@twinhomebuyer.com',
  JUAN_CALENDAR_ID: 'juan@twinhomebuyer.com',
  CALENDAR_DAYS_BACK: 7,
  TZ: 'America/Los_Angeles',
  MAX_RUN_MS: 4.5 * 60 * 1000, // Apps Script stops a run at 6 minutes; leave a margin.
  MIN_IMAGE_BYTES: 20 * 1024, // smaller images are logos and signature icons
  QBO_MIN_BYTES: 46 * 1024, // QuickBooks rejects emailed files under 46 KB
};

const TABS = {
  SETTINGS: 'Settings',
  FILES: 'Receipt Files',
  CALENDAR: 'Calendar',
  ATTACH_LOG: 'Attach Log',
};

const FILES_HEADERS = ['Saved At', 'Gmail Message ID', 'Email Date', 'From', 'Subject', 'File Name', 'File ID', 'File URL'];
const CALENDAR_HEADERS = ['Date', 'Start', 'End', 'Title', 'Location', 'Notes'];

/** Run once by hand after pasting the two IDs above. Authorizes the script, creates the triggers, does a first pass. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('saveReceipts').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('sendMatchedToQuickBooks').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('exportJuanCalendar').timeBased().atHour(4).everyDays(1).inTimezone(CONFIG.TZ).create();
  exportJuanCalendar();
  saveReceipts();
}

// ---------------------------------------------------------------------------------------------
// 1. Save receipts from Gmail to Drive
// ---------------------------------------------------------------------------------------------

function saveReceipts() {
  const started = Date.now();
  const folder = DriveApp.getFolderById(CONFIG.RECEIPTS_FOLDER_ID);
  const sheet = getTab_(TABS.FILES, FILES_HEADERS);
  const seen = columnSet_(sheet, 'Gmail Message ID');
  const query = 'label:' + CONFIG.RECEIPTS_LABEL.toLowerCase().replace(/[\s\/]+/g, '-') + ' newer_than:45d';
  const rows = [];

  try {
    for (let start = 0; start < 500; start += 50) {
      const threads = GmailApp.search(query, start, 50);
      if (threads.length === 0) return;
      for (const thread of threads) {
        for (const msg of thread.getMessages()) {
          if (seen.has(msg.getId())) continue;
          seen.add(msg.getId());
          saveMessage_(msg, folder).forEach(function (file) {
            rows.push([
              stamp_(new Date()), msg.getId(), day_(msg.getDate()), msg.getFrom(), msg.getSubject(),
              file.getName(), file.getId(), file.getUrl(),
            ]);
          });
          if (Date.now() - started > CONFIG.MAX_RUN_MS) return; // out of time; the next hourly run continues
        }
      }
    }
  } finally {
    appendRows_(sheet, rows); // always log what was saved, even if a message failed
  }
}

function saveMessage_(msg, folder) {
  const from = msg.getFrom();
  const atts = msg.getAttachments({ includeInlineImages: false }).filter(isReceiptFile_);
  // Kristine's own replies inside a receipt thread are not receipts.
  if (atts.length === 0 && from.toLowerCase().indexOf(CONFIG.OWN_ADDRESS) !== -1) return [];

  const base = day_(msg.getDate()) + '_' + senderName_(from) + '_' + msg.getId().slice(-6);
  if (atts.length > 0) {
    return atts.map(function (att, i) {
      const suffix = atts.length > 1 ? '_' + (i + 1) : '';
      return folder.createFile(att.copyBlob()).setName(base + suffix + extension_(att));
    });
  }

  const html =
    '<div style="font-family:Arial,sans-serif;font-size:12px">' +
    '<p><b>' + escapeHtml_(msg.getSubject()) + '</b><br>From: ' + escapeHtml_(from) +
    '<br>Date: ' + escapeHtml_(String(msg.getDate())) + '</p><hr>' + msg.getBody() + '</div>';
  const pdf = Utilities.newBlob(html, MimeType.HTML, base + '.html').getAs(MimeType.PDF).setName(base + '.pdf');
  return [folder.createFile(pdf)];
}

function isReceiptFile_(att) {
  const type = (att.getContentType() || '').toLowerCase();
  const name = (att.getName() || '').toLowerCase();
  if (type === 'application/pdf' || /\.pdf$/.test(name)) return true;
  const isImage = type.indexOf('image/') === 0 || /\.(jpe?g|png|gif|heic)$/.test(name);
  return isImage && att.getSize() >= CONFIG.MIN_IMAGE_BYTES;
}

function extension_(att) {
  const m = (att.getName() || '').match(/\.[a-z0-9]{2,5}$/i);
  if (m) return m[0].toLowerCase();
  const type = (att.getContentType() || '').toLowerCase();
  if (type === 'application/pdf') return '.pdf';
  if (type === 'image/png') return '.png';
  if (type === 'image/gif') return '.gif';
  return '.jpg';
}

function senderName_(from) {
  const email = ((from.match(/<([^>]+)>/) || [null, from])[1] || '').toLowerCase();
  const parts = (email.split('@')[1] || 'unknown').split('.');
  const core = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return core.replace(/[^a-z0-9]/g, '') || 'unknown';
}

// ---------------------------------------------------------------------------------------------
// 2. Export Juan's calendar to the control sheet
// ---------------------------------------------------------------------------------------------

function exportJuanCalendar() {
  const cal = CalendarApp.getCalendarById(CONFIG.JUAN_CALENDAR_ID);
  if (!cal) {
    throw new Error('Cannot open ' + CONFIG.JUAN_CALENDAR_ID +
      '. Juan needs to share his calendar with ' + CONFIG.OWN_ADDRESS + ' ("See all event details").');
  }
  const end = new Date();
  const start = new Date(end.getTime() - CONFIG.CALENDAR_DAYS_BACK * 24 * 60 * 60 * 1000);
  const rows = cal.getEvents(start, end).map(function (ev) {
    const allDay = ev.isAllDayEvent();
    return [
      day_(ev.getStartTime()),
      allDay ? 'all day' : Utilities.formatDate(ev.getStartTime(), CONFIG.TZ, 'HH:mm'),
      allDay ? '' : Utilities.formatDate(ev.getEndTime(), CONFIG.TZ, 'HH:mm'),
      ev.getTitle(),
      ev.getLocation(),
      (ev.getDescription() || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300),
    ];
  });
  const sheet = getTab_(TABS.CALENDAR, CALENDAR_HEADERS);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, CALENDAR_HEADERS.length).clearContent();
  }
  appendRows_(sheet, rows);
}

// ---------------------------------------------------------------------------------------------
// 3. Send matched receipts to QuickBooks
// ---------------------------------------------------------------------------------------------

function sendMatchedToQuickBooks() {
  const qbo = String(readSettings_().QBO_RECEIPT_ADDRESS || '').trim();
  if (!qbo || qbo.indexOf('@') === -1) return; // address not set yet

  const log = getTab_(TABS.ATTACH_LOG, null);
  const data = log.getDataRange().getValues();
  if (data.length < 2) return;
  const h = headerIndex_(data[0], [
    'Charge Date', 'Card Last 4', 'Amount', 'Vendor', 'Memo', 'Receipt Gmail ID',
    'Drive File ID', 'Drive File Name', 'Send to QBO', 'QBO Sent At',
  ]);
  const filesByGmailId = fileIndex_();

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (String(row[h['Send to QBO']]).trim().toUpperCase() !== 'YES') continue;
    if (String(row[h['QBO Sent At']]).trim() !== '') continue;

    let fileId = String(row[h['Drive File ID']]).trim();
    if (!fileId) fileId = filesByGmailId[String(row[h['Receipt Gmail ID']]).trim()] || '';
    if (!fileId) continue; // not saved to Drive yet; the next hourly run tries again

    const file = DriveApp.getFileById(fileId);
    const ext = (file.getName().match(/\.[a-z0-9]{2,5}$/i) || ['.pdf'])[0].toLowerCase();
    const name = [
      cellDay_(row[h['Charge Date']]), clean_(row[h['Vendor']]),
      money_(row[h['Amount']]), clean_(row[h['Card Last 4']]),
    ].join('_') + ext;
    file.setName(name);

    let status;
    if (file.getSize() < CONFIG.QBO_MIN_BYTES) {
      status = 'NOT SENT: file under 46 KB, attach in QuickBooks by hand';
    } else {
      GmailApp.sendEmail(qbo, 'Receipt ' + name, String(row[h['Memo']] || ''), {
        attachments: [file.getBlob()],
        name: 'Twin Home Buyer Accounting',
      });
      status = stamp_(new Date());
    }
    log.getRange(r + 1, h['Drive File ID'] + 1).setValue(fileId);
    log.getRange(r + 1, h['Drive File Name'] + 1).setValue(name);
    log.getRange(r + 1, h['QBO Sent At'] + 1).setValue(status);
  }
}

// ---------------------------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------------------------

function getTab_(name, headers) {
  const book = SpreadsheetApp.openById(CONFIG.CONTROL_SHEET_ID);
  let sheet = book.getSheetByName(name);
  if (!sheet) {
    if (!headers) throw new Error('Control sheet is missing the "' + name + '" tab.');
    sheet = book.insertSheet(name);
  }
  if (headers && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function columnSet_(sheet, header) {
  const set = new Set();
  if (sheet.getLastRow() < 2) return set;
  const col = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].indexOf(header);
  if (col === -1) return set;
  sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
    if (r[0] !== '') set.add(String(r[0]));
  });
  return set;
}

function fileIndex_() {
  const sheet = getTab_(TABS.FILES, FILES_HEADERS);
  const index = {};
  if (sheet.getLastRow() < 2) return index;
  const data = sheet.getDataRange().getValues();
  const h = headerIndex_(data[0], ['Gmail Message ID', 'File ID']);
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][h['Gmail Message ID']]);
    if (id && !index[id]) index[id] = String(data[r][h['File ID']]);
  }
  return index;
}

function readSettings_() {
  const sheet = getTab_(TABS.SETTINGS, null);
  const out = {};
  sheet.getDataRange().getValues().forEach(function (r) {
    if (r[0]) out[String(r[0]).trim()] = r[1];
  });
  return out;
}

function headerIndex_(headerRow, required) {
  const h = {};
  headerRow.forEach(function (name, i) { h[String(name).trim()] = i; });
  required.forEach(function (name) {
    if (!(name in h)) throw new Error('Missing column "' + name + '" in the control sheet.');
  });
  return h;
}

function appendRows_(sheet, rows) {
  if (rows.length === 0) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

// ---------------------------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------------------------

function day_(d) { return Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd'); }
function stamp_(d) { return Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd HH:mm'); }
function cellDay_(v) { return v instanceof Date ? day_(v) : String(v).trim(); }
function money_(v) { const n = Number(String(v).replace(/[$,]/g, '')); return isNaN(n) ? clean_(v) : n.toFixed(2); }
function clean_(v) { return String(v).replace(/[^A-Za-z0-9.-]/g, '') || 'x'; }
function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
