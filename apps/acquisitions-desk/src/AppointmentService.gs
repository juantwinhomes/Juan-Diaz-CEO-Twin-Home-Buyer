/**
 * AppointmentService.gs — APPOINTMENTS keeps history; LEADS keeps a summary (appointment_date / appointment_outcome).
 */

function publicAppointment_(a) { var o = {}; HEADERS.APPOINTMENTS.forEach(function (h) { o[h] = a[h] === undefined ? '' : a[h]; }); o.assigned_name = userDisplayName_(o.assigned_to); return o; }
function listAppointmentsForLead_(leadId) {
  return readTable_(SHEETS.APPOINTMENTS).rows.filter(function (a) { return toStr_(a.lead_id) === toStr_(leadId); })
    .sort(function (x, y) { return cmpStr_(x.created_at, y.created_at); }).map(publicAppointment_);
}
function latestOpenAppointment_(leadId) {
  var list = listAppointmentsForLead_(leadId).filter(function (a) { return a.status === APPOINTMENT_STATUS.SCHEDULED || a.status === APPOINTMENT_STATUS.RESCHEDULED; });
  return list.length ? list[list.length - 1] : null;
}
function latestAppointment_(leadId) { var list = listAppointmentsForLead_(leadId); return list.length ? list[list.length - 1] : null; }

/** Card entry point: { appointment_date?, appointment_outcome? } — creates or updates the current appointment and syncs LEADS. */
function setLeadAppointmentInternal_(user, leadId, patch, expectedVersion, ctx) {
  ctx = ctx || leadContext_();
  var hasDate = 'appointment_date' in patch, hasOutcome = 'appointment_outcome' in patch;
  var date = hasDate ? normalizeDate_(patch.appointment_date, ctx.tz) : null;
  var outcome = hasOutcome ? normalizeLeadField_('appointment_outcome', patch.appointment_outcome, ctx) : null;
  return mutateLead_(user, leadId, expectedVersion, function (lead, acts) {
    var ts = nowUtcIso_(), changed = false;
    var current = latestOpenAppointment_(leadId) || latestAppointment_(leadId);
    if (hasDate && toStr_(lead.appointment_date) !== date) {
      changed = true;
      if (date && (!current || current.status === APPOINTMENT_STATUS.COMPLETED || current.status === APPOINTMENT_STATUS.CANCELLED)) {
        var rec = { appointment_id: generateId_('APPT'), lead_id: leadId, appointment_date: date, appointment_time: '', timezone: ctx.tz,
          assigned_to: lead.assigned_to || user.user_id, status: APPOINTMENT_STATUS.SCHEDULED, outcome: '', notes: '',
          created_by: user.user_id, created_at: ts, updated_by: user.user_id, updated_at: ts };
        appendRowObject_(SHEETS.APPOINTMENTS, rec); current = rec;
        acts.push(buildActivity_(user, leadId, ACTION.APPOINTMENT_SET, 'appointment_date', lead.appointment_date, date, ''));
      } else if (current) {
        var newStatus = date ? APPOINTMENT_STATUS.RESCHEDULED : APPOINTMENT_STATUS.CANCELLED;
        updateRowById_(SHEETS.APPOINTMENTS, current.appointment_id, function (a) { a.appointment_date = date; a.status = newStatus; a.updated_by = user.user_id; a.updated_at = ts; return a; });
        acts.push(buildActivity_(user, leadId, ACTION.APPOINTMENT_UPDATED, 'appointment_date', lead.appointment_date, date, date ? 'Appointment moved to ' + date : 'Appointment cancelled'));
      }
      lead.appointment_date = date;
    }
    if (hasOutcome && toStr_(lead.appointment_outcome) !== outcome) {
      changed = true;
      if (!current && outcome) {
        var rec2 = { appointment_id: generateId_('APPT'), lead_id: leadId, appointment_date: lead.appointment_date || ctx.today, appointment_time: '', timezone: ctx.tz,
          assigned_to: lead.assigned_to || user.user_id, status: APPOINTMENT_STATUS.SCHEDULED, outcome: '', notes: '',
          created_by: user.user_id, created_at: ts, updated_by: user.user_id, updated_at: ts };
        appendRowObject_(SHEETS.APPOINTMENTS, rec2); current = rec2;
      }
      if (current) {
        var done = outcome && outcome !== 'Not visited yet';
        updateRowById_(SHEETS.APPOINTMENTS, current.appointment_id, function (a) { a.outcome = outcome; if (done) a.status = APPOINTMENT_STATUS.COMPLETED; a.updated_by = user.user_id; a.updated_at = ts; return a; });
      }
      acts.push(buildActivity_(user, leadId, ACTION.APPOINTMENT_UPDATED, 'appointment_outcome', lead.appointment_outcome, outcome, outcome ? 'Visit outcome: ' + outcome : 'Visit outcome cleared'));
      lead.appointment_outcome = outcome;
    }
    return changed;
  });
}

function createAppointment(leadId, data) {
  return guarded_('createAppointment', function (user) {
    data = data || {}; var ctx = leadContext_();
    var date = normalizeDate_(data.appointment_date, ctx.tz); if (!date) throw validationError_('Appointment date is required.');
    var time = trimStr_(data.appointment_time); if (time && !/^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(time)) throw validationError_('Time must look like 14:30 or 2:30 pm.');
    assertLen_(data.notes, MAX_LEN.note, 'Notes');
    var out = mutateLead_(user, leadId, data.expectedVersion, function (lead, acts) {
      var ts = nowUtcIso_();
      var rec = { appointment_id: generateId_('APPT'), lead_id: leadId, appointment_date: date, appointment_time: time, timezone: ctx.tz,
        assigned_to: toStr_(data.assigned_to) || lead.assigned_to || user.user_id, status: APPOINTMENT_STATUS.SCHEDULED, outcome: '', notes: trimStr_(data.notes),
        created_by: user.user_id, created_at: ts, updated_by: user.user_id, updated_at: ts };
      appendRowObject_(SHEETS.APPOINTMENTS, rec);
      acts.push(buildActivity_(user, leadId, ACTION.APPOINTMENT_SET, 'appointment_date', lead.appointment_date, date + (time ? ' ' + time : ''), trimStr_(data.notes)));
      lead.appointment_date = date; lead.appointment_outcome = '';
      return true;
    });
    return ok_(out, 'Appointment set');
  }, { capability: 'work_leads', entityType: 'LEAD', entityId: leadId });
}

function updateAppointment(appointmentId, patch) {
  return guarded_('updateAppointment', function (user) {
    patch = patch || {}; var ctx = leadContext_();
    var a = findById_(SHEETS.APPOINTMENTS, appointmentId); if (!a) throw notFound_('Appointment not found.');
    var allowed = ['appointment_date', 'appointment_time', 'status', 'outcome', 'notes', 'assigned_to'];
    var fields = Object.keys(patch).filter(function (k) { return allowed.indexOf(k) > -1; });
    if (!fields.length) throw validationError_('Nothing to update.');
    if ('status' in patch && !APPOINTMENT_STATUS[toStr_(patch.status).toUpperCase()]) throw validationError_('Unknown appointment status.');
    if ('outcome' in patch && patch.outcome && APPOINTMENT_OUTCOMES.indexOf(trimStr_(patch.outcome)) < 0) throw validationError_('Unknown outcome.');
    var out = mutateLead_(user, toStr_(a.lead_id), null, function (lead, acts) {
      var ts = nowUtcIso_();
      updateRowById_(SHEETS.APPOINTMENTS, appointmentId, function (rec) {
        fields.forEach(function (f) {
          var nv = f === 'appointment_date' ? normalizeDate_(patch[f], ctx.tz) : f === 'status' ? toStr_(patch[f]).toUpperCase() : trimStr_(patch[f]);
          if (toStr_(rec[f]) === nv) return;
          acts.push(buildActivity_(user, lead.lead_id, ACTION.APPOINTMENT_UPDATED, f, rec[f], nv, 'Appointment ' + f.replace(/_/g, ' ') + ' → ' + (nv || '(blank)')));
          rec[f] = nv;
        });
        rec.updated_by = user.user_id; rec.updated_at = ts; return rec;
      });
      var latest = latestAppointment_(lead.lead_id);
      if (latest) { lead.appointment_date = latest.status === APPOINTMENT_STATUS.CANCELLED ? '' : latest.appointment_date; lead.appointment_outcome = latest.outcome; }
      return acts.length > 0;
    });
    return ok_(out, 'Appointment updated');
  }, { capability: 'work_leads', entityType: 'APPOINTMENT', entityId: appointmentId });
}

function listAppointments(params) {
  return guarded_('listAppointments', function (user) {
    params = params || {}; var ctx = leadContext_();
    var from = params.from ? normalizeDate_(params.from, ctx.tz) : ctx.today, to = params.to ? normalizeDate_(params.to, ctx.tz) : shiftDateString_(ctx.today, 14);
    var leads = readTable_(SHEETS.LEADS).byId;
    var list = readTable_(SHEETS.APPOINTMENTS).rows.filter(function (a) {
      var d = toStr_(a.appointment_date); if (params.lead_id) return toStr_(a.lead_id) === toStr_(params.lead_id);
      return d >= from && d <= to && a.status !== APPOINTMENT_STATUS.CANCELLED;
    }).sort(function (x, y) { return cmpStr_(toStr_(x.appointment_date) + toStr_(x.appointment_time), toStr_(y.appointment_date) + toStr_(y.appointment_time)); })
      .map(function (a) { var o = publicAppointment_(a); var l = leads[toStr_(a.lead_id)]; o.address = l ? l.address : ''; o.lead_status = l ? l.status : ''; return o; });
    return ok_({ items: list, from: from, to: to });
  }, { capability: 'view_leads' });
}
