/**
 * Whiteboard.gs — a one-time transcription of the office whiteboard photographed on 2026-09-12.
 *
 * Run `previewWhiteboardUpdate()` first: it reports exactly what would change and writes nothing.
 * Then run `applyWhiteboardUpdate()` to write. Every change goes through the normal lead API, so it is
 * version-checked, logged in LEAD_ACTIVITY and attributed to whoever runs it. Running it twice is safe:
 * the second run finds nothing left to change.
 *
 * A property is matched by a distinctive piece of its address. If that matches no property, or more than
 * one, the row is reported and skipped rather than guessed at.
 */
var WHITEBOARD_2026_09_12 = [
  /* --- Acquisition: under contract --- */
  { match: '22496', label: '22496 Ave 18 3/4, Madera', patch: {
      source: 'PPC', purchase_price: 200000, closing_date: '2026-09-23', exit_strategy: 'Wholesale' } },
  { match: '8000 earl', label: '8000 Earl St, Oakland', patch: {
      source: 'DM Postcard', purchase_price: 450000, closing_date: '2026-09-08', exit_strategy: 'Wholetail / Flip' },
    note: 'Board reads "Sept 7 or 8, 2026" — recorded as the 8th, confirm the day.' },
  { match: 'garden creek', label: 'Garden Creek Cir, Pleasanton', patch: {
      source: 'SEO', purchase_price: 1100000, closing_date: '2026-09-13', exit_strategy: 'Wholetail / Flip' },
    note: 'Board reads 2829 Garden Creek Cir; the desk has 2824. Address left as it is — check which is right.' },

  /* --- Disposition: acquired, being worked or listed --- */
  { match: '492 umland', label: '492 Umland Dr, Santa Rosa', patch: {
      source: 'Property Leads', purchase_price: 475000, disposition: 'Under construction' } },
  { match: '1464 sunrise', label: '1464 Sunrise Pkwy, Petaluma', patch: {
      source: 'DM Postcard', purchase_price: 350000, disposition: 'Listed - pending',
      closing_date: '2026-09-26', sale_price: 700000 } },
  { match: '460 5th', label: '460 5th Ave, Redwood City', patch: {
      source: 'MLS/Redfin', purchase_price: 930000, disposition: 'Under construction' } },
  { match: 'paramount', label: '52 Paramount Ter, San Francisco', patch: {
      source: 'MLS/Redfin', purchase_price: 1550000, disposition: 'Under construction', status: 'CLOSED' },
    note: 'Board has this acquired; the desk had it under contract.' },
  { match: 'prague', label: '27 Prague St, San Mateo', patch: {
      source: 'Property Leads', disposition: 'Listed - pending', closing_date: '2026-09-28' },
    note: 'No purchase price written on the board.' },

  /* --- Sold this month --- */
  { match: '1927 85th', label: '1927 85th Ave, Oakland', patch: {
      exit_strategy: 'Wholesale', purchase_price: 230000, closing_date: '2026-09-08',
      sale_price: 250000, disposition: 'Wholesaled' } },
  { match: '3375 17th', label: '3375 17th St Unit 311, San Francisco', create: {
      address: '3375 17th St Unit 311 San Francisco CA 94110', source: 'PPC' },
    patch: { exit_strategy: 'Fix & Flip', purchase_price: 755000, closing_date: '2026-09-02',
      sale_price: 1020000, disposition: 'Sold' },
    note: 'Not on the desk before; added as a closed deal.' }
];

function previewWhiteboardUpdate() { return runWhiteboardUpdate_(false); }
function applyWhiteboardUpdate() { return runWhiteboardUpdate_(true); }

function runWhiteboardUpdate_(write) {
  return guarded_('runWhiteboardUpdate', function (user) {
    requireCapability_(user, 'work_leads');
    var ctx = leadContext_(), report = { mode: write ? 'applied' : 'preview (nothing written)', rows: [] };
    WHITEBOARD_2026_09_12.forEach(function (w) {
      var line = { property: w.label, note: w.note || '' };
      var hits = findLeadsByAddressPart_(w.match);
      if (hits.length > 1) { line.result = 'skipped — matches ' + hits.length + ' properties'; report.rows.push(line); return; }
      if (!hits.length && !w.create) { line.result = 'skipped — no property matches'; report.rows.push(line); return; }

      if (!hits.length) {
        line.result = write ? 'created as closed' : 'would be created as closed';
        if (write) {
          var made = addBulkLeads(w.create.address + ', , , ' + w.create.source, { status: 'CLOSED' });
          if (!made.ok || !made.data.added) { line.result = 'could not create: ' + (made.message || ''); report.rows.push(line); return; }
          hits = findLeadsByAddressPart_(w.match);
          if (!hits.length) { line.result = 'created but could not be read back'; report.rows.push(line); return; }
        } else { line.changes = w.patch; report.rows.push(line); return; }
      }

      var lead = enrichLead_(hits[0], ctx), changes = {};
      Object.keys(w.patch).forEach(function (k) {
        var now = lead[k], want = w.patch[k];
        var same = LEAD_NUMERIC.indexOf(k) > -1 ? (toNum_(now) || '') === want : toStr_(now) === toStr_(want);
        if (!same) changes[k] = { from: (now === '' || now == null) ? '(blank)' : now, to: want };
      });
      line.changes = changes;
      if (!Object.keys(changes).length) { line.result = 'already matches the board'; report.rows.push(line); return; }
      if (!write) { line.result = 'would change ' + Object.keys(changes).length + ' field(s)'; report.rows.push(line); return; }

      var patch = {}; Object.keys(changes).forEach(function (k) { patch[k] = w.patch[k]; });
      var r = updateLead(lead.lead_id, patch, lead.version);
      line.result = r.ok ? 'updated' : 'failed: ' + (r.message || r.code);
      if (r.ok && w.note) addLeadNote(lead.lead_id, 'From the whiteboard, 2026-09-12: ' + w.note);
      report.rows.push(line);
    });
    if (write) audit_(user, 'LEAD', 'WHITEBOARD', 'WHITEBOARD_APPLIED', { rows: report.rows.length });
    Logger.log(JSON.stringify(report, null, 2));
    return ok_(report, report.rows.length + ' rows ' + (write ? 'applied' : 'previewed'));
  }, { capability: 'view_leads' });
}

/** Properties whose address contains this text, archived ones included. */
function findLeadsByAddressPart_(part) {
  var needle = toStr_(part).toLowerCase();
  return readTable_(SHEETS.LEADS).rows.filter(function (l) {
    return toStr_(l.address).toLowerCase().indexOf(needle) > -1;
  });
}
