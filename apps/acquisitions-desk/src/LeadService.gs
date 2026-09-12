/**
 * LeadService.gs — every lead mutation: lock → load row → validate version → validate permissions →
 * apply → write that one row → append activity → return latest copy.
 */

/* ---------- enrichment for the client ---------- */
function enrichLead_(l, ctx) {
  ctx = ctx || leadContext_();
  var o = {};
  HEADERS.LEADS.forEach(function (h) { o[h] = l[h] === undefined ? '' : l[h]; });
  o.flag_juan = toBool_(l.flag_juan); o.compliance_mailer_check = toBool_(l.compliance_mailer_check);
  o.contact_attempts = toNum_(l.contact_attempts) || 0; o.version = toNum_(l.version) || 0;
  o.status_label = STATUS_LABELS[o.status] || o.status;
  o.is_live = LIVE_STATUSES.indexOf(o.status) > -1;
  o.assigned_name = o.assigned_to ? (ctx.userNames[o.assigned_to] || o.assigned_to) : '';
  o.days_untouched = o.is_live ? daysSinceTimestamp_(o.last_touched_at, ctx.today, ctx.tz) : 0;
  var arv = toNum_(o.arv), rep = toNum_(o.repairs) || 0, ask = toNum_(o.asking_price);
  o.mao = arv ? Math.round(arv * ctx.maoPct / 100 - rep) : null;
  o.offer_room = (o.mao != null && ask != null) ? o.mao - ask : null;
  o.due_state = !o.is_live ? '' : !o.next_action ? 'NO_NEXT_ACTION' : !o.due_date ? 'NO_DUE_DATE' :
    (o.due_date < ctx.today ? 'OVERDUE' : o.due_date === ctx.today ? 'DUE_TODAY' : 'UPCOMING');
  return o;
}
function leadContext_() {
  var s = getSettingsMap_(), tz = s.business_timezone || DEFAULT_SETTINGS.business_timezone;
  var names = {}; getUsersTable_().rows.forEach(function (u) { names[toStr_(u.user_id)] = toStr_(u.name); });
  return { today: businessDateOf_(new Date(), tz), tz: tz, maoPct: toNum_(s.mao_percentage) || 70,
    staleDays: toNum_(s.stale_lead_days) || 7, userNames: names, settings: s };
}
function leadExists_(id) { return findRowNumberById_(SHEETS.LEADS, id) > 0; }

/* ---------- read ---------- */
/** getLead(leadId, fullHistory) — recent activity by default; the whole history only when the history view asks. */
function getLead(leadId, fullHistory) {
  return guarded_('getLead', function (user) {
    var l = findById_(SHEETS.LEADS, leadId); if (!l) throw notFound_('Lead not found.');
    var out = enrichLead_(l);
    out.activity = getActivityForLead_(leadId, fullHistory);
    out.activity_complete = !!fullHistory;
    out.appointments = listAppointmentsForLead_(leadId);
    return ok_(out);
  }, { capability: 'view_leads', entityType: 'LEAD', entityId: leadId });
}

/**
 * listLeads({filter, sort, search, page, page_size})
 * filter: live | due | flag | stale | appt | archived | all      sort: due | touched | room
 * Returns { items, page, page_size, has_more, total, tally }. Recent activity attached to the returned page only.
 */
function listLeads(filters) {
  return guarded_('listLeads', function (user) {
    filters = filters || {};
    var ctx = leadContext_(), t = readTable_(SHEETS.LEADS);
    var all = t.rows.map(function (l) { return enrichLead_(l, ctx); });
    var tally = { live: 0, due: 0, closed: 0, archived: 0, flag: 0, stale: 0, no_next_action: 0, target: toNum_(ctx.settings.live_list_target) || 200 };
    all.forEach(function (l) {
      if (l.is_live) { tally.live++; if (l.due_date && l.due_date <= ctx.today) tally.due++;
        if (l.flag_juan || l.compliance_mailer_check) tally.flag++;
        if (l.days_untouched >= ctx.staleDays) tally.stale++; if (!l.next_action) tally.no_next_action++; }
      else if (l.status === LEAD_STATUS.CLOSED) tally.closed++;
      else tally.archived++;
    });
    var f = toStr_(filters.filter || 'live'), q = trimStr_(filters.search).toLowerCase(), s = toStr_(filters.sort || 'due');
    var list = all.filter(function (l) {
      if (q) { var hay = [l.address, l.seller_name, l.phone, normalizePhone_(l.phone), l.assigned_name, l.lead_id].join(' ').toLowerCase(); if (hay.indexOf(q) < 0) return false; }
      switch (f) {
        case 'live': return l.is_live;
        case 'closed': return l.status === LEAD_STATUS.CLOSED;
        case 'archived': return !l.is_live && l.status !== LEAD_STATUS.CLOSED;
        case 'flag': return l.is_live && (l.flag_juan || l.compliance_mailer_check);
        case 'stale': return l.is_live && l.days_untouched >= ctx.staleDays;
        case 'due': return l.is_live && l.due_date && l.due_date <= ctx.today;
        case 'appt': return l.status === 'APPOINTMENT_SET';
        default: return true;
      }
    });
    list.sort(function (a, b) {
      if (s === 'touched') return toStr_(a.last_touched_at) < toStr_(b.last_touched_at) ? -1 : toStr_(a.last_touched_at) > toStr_(b.last_touched_at) ? 1 : 0;
      if (s === 'room') { var ra = a.offer_room == null ? (a.mao == null ? -1e12 : a.mao) : a.offer_room, rb = b.offer_room == null ? (b.mao == null ? -1e12 : b.mao) : b.offer_room; return rb - ra; }
      var da = a.due_date || '9999', db = b.due_date || '9999'; if (da !== db) return da < db ? -1 : 1;
      return toStr_(a.created_at) < toStr_(b.created_at) ? 1 : -1;
    });
    var pageSize = Math.min(PAGE_SIZE_MAX, Math.max(10, toNum_(filters.page_size) || toNum_(ctx.settings.page_size) || PAGE_SIZE_DEFAULT));
    var page = Math.max(1, toNum_(filters.page) || 1);
    var start = (page - 1) * pageSize, items = list.slice(start, start + pageSize);
    var recent = getRecentActivityFor_(items.map(function (l) { return l.lead_id; }), 4);
    items.forEach(function (l) { l.recent_activity = recent[l.lead_id] || []; });
    return ok_({ items: items, page: page, page_size: pageSize, has_more: start + pageSize < list.length, total: list.length, tally: tally, today: ctx.today });
  }, { capability: 'view_leads' });
}

/* ---------- create ---------- */
function parseLeadInput_(data) {
  var d = {
    address: trimStr_(data.address), seller_name: trimStr_(data.seller_name), phone: trimStr_(data.phone),
    source: normalizeSource_(data.source), equity_note: trimStr_(data.equity_note), team: trimStr_(data.team)
  };
  if (!d.address) throw validationError_('Address is required.');
  assertLen_(d.address, MAX_LEN.address, 'Address'); assertLen_(d.seller_name, MAX_LEN.short, 'Seller name');
  assertLen_(d.phone, 40, 'Phone'); assertLen_(d.source, 60, 'Source'); assertLen_(d.equity_note, 1000, 'Equity note');
  if (d.phone && normalizePhone_(d.phone).length < 7) throw validationError_('Phone looks invalid: ' + d.phone);
  return d;
}
function newLeadRecord_(user, d, existsFn) {
  var ts = nowUtcIso_();
  return {
    lead_id: generateId_('LEAD', existsFn), address: d.address, seller_name: d.seller_name, phone: d.phone, source: d.source,
    equity_note: d.equity_note, status: LEAD_STATUS.NEW, assigned_to: d.assigned_to || '', team: d.team || '',
    flag_juan: false, compliance_mailer_check: false, contact_attempts: 0, next_action: d.next_action || '', due_date: d.due_date || '',
    arv: '', repairs: '', asking_price: '', offer: '', appointment_date: '', appointment_outcome: '', archive_reason: '',
    exit_strategy: '', disposition: '', purchase_price: '',
    created_by: user.user_id, created_at: ts, updated_by: user.user_id, updated_at: ts, last_touched_at: ts, version: 1
  };
}
/** Duplicate index over existing leads: normalized address and phone digits → lead_id. */
function buildDuplicateIndex_() {
  var idx = { addr: {}, phone: {} };
  readTable_(SHEETS.LEADS).rows.forEach(function (l) {
    var a = normalizeAddress_(l.address); if (a) idx.addr[a] = idx.addr[a] || toStr_(l.lead_id);
    var p = normalizePhone_(l.phone); if (p.length >= 7) idx.phone[p] = idx.phone[p] || toStr_(l.lead_id);
  });
  return idx;
}
function findDuplicate_(idx, d) {
  var a = normalizeAddress_(d.address), p = normalizePhone_(d.phone);
  if (a && idx.addr[a]) return { lead_id: idx.addr[a], reason: 'same address' };
  if (p.length >= 7 && idx.phone[p]) return { lead_id: idx.phone[p], reason: 'same phone (review — could be a different property of the same seller)' };
  return null;
}
function indexLead_(idx, l) {
  var a = normalizeAddress_(l.address); if (a) idx.addr[a] = l.lead_id;
  var p = normalizePhone_(l.phone); if (p.length >= 7) idx.phone[p] = l.lead_id;
}

function createLead(data) {
  return guarded_('createLead', function (user) {
    var d = parseLeadInput_(data || {});
    return withLock_(function () {
      var idx = buildDuplicateIndex_(), dup = findDuplicate_(idx, d);
      if (dup && !toBool_(data.allow_duplicate)) return fail_('DUPLICATE', 'A lead with the ' + dup.reason + ' already exists (' + dup.lead_id + ').', dup);
      var rec = newLeadRecord_(user, d, leadExists_);
      appendRowObject_(SHEETS.LEADS, rec);
      recordActivity_(user, rec.lead_id, ACTION.LEAD_CREATED, '', '', '', '');
      audit_(user, 'LEAD', rec.lead_id, 'LEAD_CREATED', { address: rec.address });
      return ok_(enrichLead_(rec), 'Lead added');
    });
  }, { capability: 'create_leads' });
}

/**
 * addBulkLeads(text, options) — one lead per line: address, seller, phone, source, equity note.
 * options.status (optional): import every line at this status (any live status or CLOSED; default NEW).
 * Used to load historical deals (under contract / acquired) without faking a status-change trail.
 * Returns { added, duplicates_skipped, failed, failures:[{line, text, reason}], duplicates:[{line, text, lead_id, reason}] }.
 */
function addBulkLeads(text, options) {
  return guarded_('addBulkLeads', function (user) {
    options = options || {};
    var lines = toStr_(text).split(/\r?\n/);
    if (lines.length > 500) return fail_('VALIDATION_ERROR', 'Paste at most 500 lines at a time.');
    var importStatus = toStr_(options.status || LEAD_STATUS.NEW).toUpperCase();
    if (LIVE_STATUSES.indexOf(importStatus) < 0 && importStatus !== LEAD_STATUS.CLOSED) return fail_('VALIDATION_ERROR', 'Leads can only be imported at a live status or Closed, not ' + importStatus + '.');
    var importNote = importStatus === LEAD_STATUS.NEW ? '' : ' · imported as ' + STATUS_LABELS[importStatus];
    return withLock_(function () {
      var idx = buildDuplicateIndex_(), toAdd = [], acts = [], summary = { added: 0, duplicates_skipped: 0, failed: 0, failures: [], duplicates: [], status: importStatus };
      lines.forEach(function (raw, i) {
        var line = raw.trim(); if (!line) return;
        var p = line.split(',').map(function (s) { return s.trim(); });
        var input = { address: p[0] || line, seller_name: p[1] || '', phone: p[2] || '', source: p[3] || '', equity_note: p.slice(4).join(', ') };
        var d;
        try { d = parseLeadInput_(input); } catch (e) { summary.failed++; summary.failures.push({ line: i + 1, text: line, reason: e.message }); return; }
        var dup = findDuplicate_(idx, d);
        if (dup) { summary.duplicates_skipped++; summary.duplicates.push({ line: i + 1, text: line, lead_id: dup.lead_id, reason: dup.reason }); return; }
        var rec = newLeadRecord_(user, d, function (id) { return leadExists_(id) || toAdd.some(function (r) { return r.lead_id === id; }); });
        rec.status = importStatus;
        toAdd.push(rec); indexLead_(idx, rec);
        acts.push(buildActivity_(user, rec.lead_id, ACTION.LEAD_IMPORTED, '', '', '', 'Bulk paste line ' + (i + 1) + importNote));
      });
      if (toAdd.length) { appendRowObjects_(SHEETS.LEADS, toAdd); recordActivities_(acts); }
      summary.added = toAdd.length;
      audit_(user, 'LEAD', 'BULK', 'BULK_IMPORT', { added: summary.added, duplicates: summary.duplicates_skipped, failed: summary.failed, status: importStatus });
      return ok_(summary, 'Added: ' + summary.added + '. Duplicates skipped: ' + summary.duplicates_skipped + '. Failed: ' + summary.failed + '.');
    });
  }, { capability: 'create_leads' });
}

/* ---------- the core mutation pipeline ---------- */
/**
 * mutateLead_(user, leadId, expectedVersion, fn) — fn(lead, acts) mutates the loaded record and pushes activity
 * objects into acts. Version is checked when expectedVersion is a number; bumped on every write.
 */
function mutateLead_(user, leadId, expectedVersion, fn, touch) {
  return withLock_(function () {
    var rn = findRowNumberById_(SHEETS.LEADS, leadId);
    if (rn < 0) throw notFound_('Lead ' + leadId + ' not found.');
    var lead = getRowObjectByNumber_(SHEETS.LEADS, rn);
    var currentVersion = toNum_(lead.version) || 0;
    if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== '' && toNum_(expectedVersion) !== currentVersion) {
      throw conflictError_(enrichLead_(lead));
    }
    var acts = [];
    var result = fn(lead, acts);
    if (result === false) return enrichLead_(lead); // no change
    var ts = nowUtcIso_();
    lead.version = currentVersion + 1; lead.updated_by = user.user_id; lead.updated_at = ts;
    if (touch !== false) lead.last_touched_at = ts;
    writeRowObject_(SHEETS.LEADS, rn, lead);
    recordActivities_(acts);
    var out = enrichLead_(lead);
    out.new_activity = acts.map(publicActivity_); // what this call just wrote — no re-read of the sheet
    return out;
  });
}

/** Validates/normalizes one patch field value. Returns normalized value. */
function normalizeLeadField_(field, value, ctx) {
  if (LEAD_NUMERIC.indexOf(field) > -1) { var n = toNum_(value); if (value !== '' && value != null && n == null) throw validationError_(field.replace(/_/g, ' ') + ' must be a number.'); if (n != null && n < 0) throw validationError_(field.replace(/_/g, ' ') + ' cannot be negative.'); return n == null ? '' : n; }
  if (LEAD_DATE.indexOf(field) > -1) return normalizeDate_(value, ctx.tz);
  if (field === 'status') { var st = toStr_(value).toUpperCase(); if (!LEAD_STATUS[st]) throw validationError_('Unknown status: ' + value); return st; }
  if (field === 'appointment_outcome') { var v = trimStr_(value); if (v && APPOINTMENT_OUTCOMES.indexOf(v) < 0) throw validationError_('Unknown visit outcome: ' + v); return v; }
  if (field === 'exit_strategy') { var ex = trimStr_(value); if (ex && EXIT_STRATEGIES.indexOf(ex) < 0) throw validationError_('Unknown exit strategy: ' + ex); return ex; }
  if (field === 'disposition') { var dp = trimStr_(value); if (dp && DISPOSITIONS.indexOf(dp) < 0) throw validationError_('Unknown disposition status: ' + dp); return dp; }
  if (field === 'source') { var src = normalizeSource_(value); assertLen_(src, 60, 'Source'); return src; }
  var s = trimStr_(value);
  assertLen_(s, field === 'address' ? MAX_LEN.address : field === 'next_action' ? 500 : field === 'equity_note' ? 1000 : MAX_LEN.short, field.replace(/_/g, ' '));
  if (field === 'address' && !s) throw validationError_('Address cannot be blank.');
  return s;
}

/**
 * updateLead(leadId, patch, expectedVersion) — generic field patch for the lead card.
 * Status changes into/out of archived statuses are routed to archive/restore rules. Flags and assignment are NOT
 * patchable here (dedicated functions carry their own rules).
 */
function updateLead(leadId, patch, expectedVersion) {
  return guarded_('updateLead', function (user) {
    patch = patch || {};
    var ctx = leadContext_();
    var fields = Object.keys(patch).filter(function (k) { return LEAD_PATCHABLE.indexOf(k) > -1; });
    var rejected = Object.keys(patch).filter(function (k) { return LEAD_PATCHABLE.indexOf(k) < 0; });
    if (rejected.length) throw validationError_('These fields cannot be changed here: ' + rejected.join(', '));
    if (!fields.length) throw validationError_('Nothing to update.');
    var uw = ['arv', 'repairs', 'asking_price', 'offer', 'purchase_price'];
    if (fields.some(function (f) { return uw.indexOf(f) > -1; })) requireCapability_(user, 'underwrite');
    if (fields.indexOf('appointment_date') > -1 || fields.indexOf('appointment_outcome') > -1) {
      // Appointment fields go through the appointment service so history is kept.
      var apptPatch = {}; fields.forEach(function (f) { if (f === 'appointment_date' || f === 'appointment_outcome') apptPatch[f] = patch[f]; });
      var rest = {}; fields.forEach(function (f) { if (!(f in apptPatch)) rest[f] = patch[f]; });
      var r1 = setLeadAppointmentInternal_(user, leadId, apptPatch, expectedVersion, ctx);
      if (!Object.keys(rest).length) return ok_(r1, 'Saved');
      expectedVersion = r1.version; patch = rest; fields = Object.keys(rest);
    }
    var out = mutateLead_(user, leadId, expectedVersion, function (lead, acts) {
      var changed = 0;
      fields.forEach(function (f) {
        var nv = normalizeLeadField_(f, patch[f], ctx), ov = lead[f];
        var same = (f === 'status') ? toStr_(ov) === nv : (LEAD_NUMERIC.indexOf(f) > -1 ? (toNum_(ov) == null ? '' : toNum_(ov)) === nv : toStr_(ov) === toStr_(nv));
        if (same) return;
        changed++;
        if (f === 'status') {
          var wasLive = LIVE_STATUSES.indexOf(toStr_(ov)) > -1, willLive = LIVE_STATUSES.indexOf(nv) > -1 || nv === 'CLOSED';
          if (!willLive) { requireCapability_(user, 'archive_leads'); lead.archive_reason = STATUS_LABELS[nv]; acts.push(buildActivity_(user, leadId, ACTION.ARCHIVED, 'status', ov, nv, toStr_(patch.archive_note))); audit_(user, 'LEAD', leadId, 'ARCHIVED', { status: nv }); }
          else if (!wasLive && toStr_(ov) !== 'CLOSED') { requireCapability_(user, 'restore_leads'); lead.archive_reason = ''; acts.push(buildActivity_(user, leadId, ACTION.RESTORED, 'status', ov, nv, '')); audit_(user, 'LEAD', leadId, 'RESTORED', { status: nv }); }
          else acts.push(buildActivity_(user, leadId, ACTION.STATUS_CHANGED, 'status', ov, nv, ''));
          lead.status = nv; return;
        }
        lead[f] = nv;
        var type = (f === 'offer') ? ACTION.OFFER_CHANGED : (uw.indexOf(f) > -1) ? ACTION.UNDERWRITING_CHANGED :
          f === 'next_action' ? ACTION.NEXT_ACTION_CHANGED : f === 'due_date' ? ACTION.DUE_DATE_CHANGED : ACTION.FIELD_CHANGED;
        acts.push(buildActivity_(user, leadId, type, f, ov, nv, ''));
      });
      return changed > 0;
    });
    return ok_(out, 'Saved');
  }, { capability: 'work_leads', entityType: 'LEAD', entityId: leadId });
}

function assignLead(leadId, userId, expectedVersion, note) {
  return guarded_('assignLead', function (user) {
    var target = toStr_(userId);
    if (target && !findUserById_(target)) throw validationError_('Unknown team member.');
    if (!hasCapability_(user, 'assign_leads')) {
      // A rep may claim a lead for themselves or release their own; anything else needs a manager.
      var l = findById_(SHEETS.LEADS, leadId); if (!l) throw notFound_('Lead not found.');
      var mine = toStr_(l.assigned_to) === user.user_id;
      if (!((target === user.user_id && !toStr_(l.assigned_to)) || (target === '' && mine))) throw accessDenied_('Only a manager can reassign work. You can claim an unassigned lead or release your own.');
    }
    var out = mutateLead_(user, leadId, expectedVersion, function (lead, acts) {
      if (toStr_(lead.assigned_to) === target) return false;
      acts.push(buildActivity_(user, leadId, ACTION.ASSIGNED, 'assigned_to', lead.assigned_to, target, trimStr_(note)));
      lead.assigned_to = target; return true;
    }, false);
    return ok_(out, target ? 'Assigned to ' + userDisplayName_(target) : 'Unassigned');
  }, { capability: 'work_leads', entityType: 'LEAD', entityId: leadId });
}

function logAttempt(leadId, note) {
  return guarded_('logAttempt', function (user) {
    assertLen_(note, MAX_LEN.note, 'Note');
    var out = mutateLead_(user, leadId, null, function (lead, acts) {
      var n = (toNum_(lead.contact_attempts) || 0) + 1; lead.contact_attempts = n;
      acts.push(buildActivity_(user, leadId, ACTION.CALL_ATTEMPT, 'contact_attempts', n - 1, n, trimStr_(note)));
      return true;
    });
    return ok_(out, 'Attempt ' + out.contact_attempts + ' logged');
  }, { capability: 'work_leads', entityType: 'LEAD', entityId: leadId });
}

function addLeadNote(leadId, text) {
  return guarded_('addLeadNote', function (user) {
    var t = toStr_(text).trim(); if (!t) throw validationError_('Write something first.'); assertLen_(t, MAX_LEN.note, 'Note');
    var out = mutateLead_(user, leadId, null, function (lead, acts) { acts.push(buildActivity_(user, leadId, ACTION.NOTE_ADDED, '', '', '', t)); return true; });
    return ok_(out, 'Posted');
  }, { capability: 'work_leads', entityType: 'LEAD', entityId: leadId });
}

function setNextAction(leadId, nextAction, dueDate, expectedVersion) {
  return guarded_('setNextAction', function (user) {
    var ctx = leadContext_(), na = trimStr_(nextAction), dd = normalizeDate_(dueDate, ctx.tz);
    assertLen_(na, 500, 'Next action');
    var out = mutateLead_(user, leadId, expectedVersion, function (lead, acts) {
      var ch = false;
      if (toStr_(lead.next_action) !== na) { acts.push(buildActivity_(user, leadId, ACTION.NEXT_ACTION_CHANGED, 'next_action', lead.next_action, na, '')); lead.next_action = na; ch = true; }
      if (toStr_(lead.due_date) !== dd) { acts.push(buildActivity_(user, leadId, ACTION.DUE_DATE_CHANGED, 'due_date', lead.due_date, dd, '')); lead.due_date = dd; ch = true; }
      return ch;
    });
    return ok_(out, 'Saved');
  }, { capability: 'work_leads', entityType: 'LEAD', entityId: leadId });
}

/** Mark the current next action done, then set the following one (may be blank — the queue will flag NO NEXT ACTION). */
function completeNextAction(leadId, newNextAction, newDueDate, expectedVersion, note) {
  return guarded_('completeNextAction', function (user) {
    var ctx = leadContext_(), na = trimStr_(newNextAction), dd = normalizeDate_(newDueDate, ctx.tz);
    var out = mutateLead_(user, leadId, expectedVersion, function (lead, acts) {
      acts.push(buildActivity_(user, leadId, ACTION.NEXT_ACTION_DONE, 'next_action', lead.next_action || '(none)', toStr_(lead.due_date), trimStr_(note)));
      if (na || toStr_(lead.next_action) !== na) acts.push(buildActivity_(user, leadId, ACTION.NEXT_ACTION_CHANGED, 'next_action', lead.next_action, na, ''));
      if (dd || toStr_(lead.due_date) !== dd) acts.push(buildActivity_(user, leadId, ACTION.DUE_DATE_CHANGED, 'due_date', lead.due_date, dd, ''));
      lead.next_action = na; lead.due_date = dd; return true;
    });
    var warn = out.is_live && !na ? ' No next action is set — this lead now shows under NO NEXT ACTION.' : '';
    return ok_(out, 'Done.' + warn);
  }, { capability: 'work_leads', entityType: 'LEAD', entityId: leadId });
}

function setJuanFlag(leadId, flagged, note) {
  return guarded_('setJuanFlag', function (user) {
    var f = toBool_(flagged);
    var out = mutateLead_(user, leadId, null, function (lead, acts) {
      if (toBool_(lead.flag_juan) === f) return false;
      lead.flag_juan = f;
      acts.push(buildActivity_(user, leadId, f ? ACTION.FLAGGED_FOR_JUAN : ACTION.JUAN_FLAG_CLEARED, 'flag_juan', !f, f, trimStr_(note) || (f ? 'Flagged for Juan' : 'Flag cleared')));
      return true;
    });
    return ok_(out, f ? 'Flagged for Juan' : 'Flag cleared');
  }, { capability: 'work_leads', entityType: 'LEAD', entityId: leadId });
}

/** Mailer / check compliance rule: sets compliance AND Juan flag, records activity, never archives or deletes. */
function setComplianceFlag(leadId, flagged, note) {
  return guarded_('setComplianceFlag', function (user) {
    var f = toBool_(flagged);
    var out = mutateLead_(user, leadId, null, function (lead, acts) {
      if (toBool_(lead.compliance_mailer_check) === f) return false;
      lead.compliance_mailer_check = f;
      acts.push(buildActivity_(user, leadId, f ? ACTION.COMPLIANCE_FLAGGED : ACTION.COMPLIANCE_CLEARED, 'compliance_mailer_check', !f, f,
        trimStr_(note) || (f ? 'Seller mentioned a mailer or check. Conversation stopped, routed to Juan.' : 'Mailer note cleared')));
      if (f && !toBool_(lead.flag_juan)) { lead.flag_juan = true; acts.push(buildActivity_(user, leadId, ACTION.FLAGGED_FOR_JUAN, 'flag_juan', false, true, 'Auto-flagged by compliance rule')); }
      return true;
    });
    if (f) audit_(user, 'LEAD', leadId, 'COMPLIANCE_FLAGGED', {});
    return ok_(out, f ? 'Routed to Juan. Stop the conversation.' : 'Mailer note cleared');
  }, { capability: 'work_leads', entityType: 'LEAD', entityId: leadId });
}

function archiveLead(leadId, archiveStatus, reason, expectedVersion) {
  return guarded_('archiveLead', function (user) {
    var st = toStr_(archiveStatus).toUpperCase();
    if (ARCHIVED_STATUSES.indexOf(st) < 0) throw validationError_('Pick an archive reason: sold, no equity, not interested or bad data.');
    var out = mutateLead_(user, leadId, expectedVersion, function (lead, acts) {
      acts.push(buildActivity_(user, leadId, ACTION.ARCHIVED, 'status', lead.status, st, trimStr_(reason)));
      lead.status = st; lead.archive_reason = trimStr_(reason) || STATUS_LABELS[st]; return true;
    });
    audit_(user, 'LEAD', leadId, 'ARCHIVED', { status: st });
    return ok_(out, 'Archived. It stays in the database and can be restored.');
  }, { capability: 'archive_leads', entityType: 'LEAD', entityId: leadId });
}

function restoreLead(leadId, toStatus, expectedVersion) {
  return guarded_('restoreLead', function (user) {
    var st = toStr_(toStatus || 'INVESTIGATING').toUpperCase();
    if (LIVE_STATUSES.indexOf(st) < 0) throw validationError_('Restore to a live status.');
    var out = mutateLead_(user, leadId, expectedVersion, function (lead, acts) {
      if (LIVE_STATUSES.indexOf(toStr_(lead.status)) > -1) return false;
      acts.push(buildActivity_(user, leadId, ACTION.RESTORED, 'status', lead.status, st, ''));
      lead.status = st; lead.archive_reason = ''; return true;
    });
    audit_(user, 'LEAD', leadId, 'RESTORED', { status: st });
    return ok_(out, 'Restored');
  }, { capability: 'restore_leads', entityType: 'LEAD', entityId: leadId });
}

/** Records that an offer was presented to the seller (uses the offer amount on the lead, or the one passed). */
function markOfferSent(leadId, amount, note) {
  return guarded_('markOfferSent', function (user) {
    assertLen_(note, MAX_LEN.note, 'Note');
    var out = mutateLead_(user, leadId, null, function (lead, acts) {
      var amt = toNum_(amount); if (amt != null && amt < 0) throw validationError_('Offer must be a positive number.');
      if (amt != null) { if (toNum_(lead.offer) !== amt) { acts.push(buildActivity_(user, leadId, ACTION.OFFER_CHANGED, 'offer', lead.offer, amt, '')); lead.offer = amt; } }
      acts.push(buildActivity_(user, leadId, ACTION.OFFER_SENT, 'offer', '', toNum_(lead.offer) == null ? '' : toNum_(lead.offer), trimStr_(note)));
      return true;
    });
    return ok_(out, 'Offer sent recorded');
  }, { capability: 'work_leads', entityType: 'LEAD', entityId: leadId });
}
