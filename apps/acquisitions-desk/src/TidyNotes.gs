/**
 * TidyNotes.gs — takes the REI BlackBook tag text out of the Background note on imported properties.
 *
 * Run `previewTidyNotes()` first: it writes nothing and prints, per property, the note before and after.
 * Then run `applyTidyNotes()`. Running it again does nothing.
 *
 * Three things happen to a note, which is a list of fragments separated by "·":
 *   - an email address moves into the Seller email field rather than being thrown away
 *   - a fragment that is a known REI BlackBook tag is dropped: it repeats the status, the source, or nothing
 *   - anything else is kept, because it is something a person wrote about the house
 */
var NOTE_TAGS = [
  /* status, already a field */
  'acquired', 'under contract', 'contract sent', 'contract signed', 'deal closed', 'offer sent',
  'property visited', 'property evaluated', 'follow up', 'interested', 'cancelled',
  /* source, already a field */
  'tv commercial', 'postcard', 'post card', 'dm post card', 'web inquiry', 'thb web inquiry', 'thb inquiry call',
  'twin home buyer web inquiries', 'agent / mls lead', 'agent/realtor', 'mls lead', 'mls/redfin', 'ppc lead',
  'seo lead', 'ppl', 'motivated leads', 'property leads', 'juan outbound', 'juan outbound flow',
  'branded (415-twin)', 'branded / seo inquiry (415-twin)', '(415) 415-twin', 'branded lead / high priority',
  /* plumbing from the old CRM, meaningless here */
  'transferred to airtable', 'do not automate', 'signing contact', 'co-trustee'
];

function previewTidyNotes() { return logResult_('previewTidyNotes', runTidyNotes_(false)); }
function applyTidyNotes() { return logResult_('applyTidyNotes', runTidyNotes_(true)); }

function runTidyNotes_(write) {
  return guarded_('runTidyNotes', function (user) {
    requireCapability_(user, 'work_leads');
    var ctx = leadContext_(), report = { mode: write ? 'applied' : 'preview (nothing written)', changed: 0, rows: [] };
    readTable_(SHEETS.LEADS).rows.forEach(function (raw) {
      var lead = enrichLead_(raw, ctx), tidy = tidyNote_(lead.equity_note);
      var wantEmail = tidy.email && !toStr_(lead.seller_email) ? tidy.email : toStr_(lead.seller_email);
      if (tidy.note === toStr_(lead.equity_note) && wantEmail === toStr_(lead.seller_email)) return;
      report.changed++;
      var line = { property: lead.address, was: toStr_(lead.equity_note) || '(blank)', now: tidy.note || '(blank)' };
      if (wantEmail !== toStr_(lead.seller_email)) line.email_moved_to_its_own_field = wantEmail;
      if (write) {
        var patch = { equity_note: tidy.note };
        if (wantEmail !== toStr_(lead.seller_email)) patch.seller_email = wantEmail;
        var r = updateLead(lead.lead_id, patch, lead.version);
        line.result = r.ok ? 'updated' : 'failed: ' + (r.message || r.code);
      }
      report.rows.push(line);
    });
    if (write) audit_(user, 'LEAD', 'NOTES', 'NOTES_TIDIED', { changed: report.changed });
    return ok_(report, report.changed + ' propert' + (report.changed === 1 ? 'y' : 'ies') + ' ' + (write ? 'tidied' : 'would be tidied'));
  }, { capability: 'view_leads' });
}

/** Splits a note into fragments and keeps only the ones a person would have written. */
function tidyNote_(note) {
  var parts = toStr_(note).split(/\s*[·|;]\s*|\s+·\s+/), keep = [], email = '';
  parts.forEach(function (p) {
    var t = trimStr_(p); if (!t) return;
    if (isValidEmail_(t)) { if (!email) email = t.toLowerCase(); return; }
    var k = t.toLowerCase().replace(/\s+/g, ' ').replace(/[.,]+$/, '');
    if (NOTE_TAGS.indexOf(k) > -1) return;
    keep.push(t);
  });
  return { note: keep.join(' · '), email: email };
}
