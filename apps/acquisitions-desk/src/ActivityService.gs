/**
 * ActivityService.gs — append-only LEAD_ACTIVITY history. Never rewrites or deletes rows.
 */

function buildActivity_(user, leadId, actionType, fieldChanged, oldValue, newValue, note, when) {
  var ts = when || new Date();
  return {
    activity_id: generateEventId_('ACT'), lead_id: leadId,
    user_id: user ? user.user_id : 'SYSTEM', user_name: user ? user.name : 'System', user_email: user ? user.email : '',
    business_date: businessDateOf_(ts), timestamp_utc: ts.toISOString(),
    action_type: actionType, field_changed: toStr_(fieldChanged), old_value: toStr_(oldValue).slice(0, 1000),
    new_value: toStr_(newValue).slice(0, 1000), note: toStr_(note).slice(0, MAX_LEN.note)
  };
}
function recordActivity_(user, leadId, actionType, fieldChanged, oldValue, newValue, note) {
  var a = buildActivity_(user, leadId, actionType, fieldChanged, oldValue, newValue, note);
  appendRowObject_(SHEETS.LEAD_ACTIVITY, a);
  return a;
}
function recordActivities_(list) { if (list && list.length) appendRowObjects_(SHEETS.LEAD_ACTIVITY, list); }

/** Human sentence for an activity row — what the thread shows. */
function activityDisplay_(a) {
  var t = a.action_type, note = toStr_(a.note);
  switch (t) {
    case 'NOTE_ADDED': return note;
    case 'CALL_ATTEMPT': return 'Contact attempt ' + toStr_(a.new_value) + (note ? ' — ' + note : '');
    case 'STATUS_CHANGED': return 'Moved to ' + (STATUS_LABELS[a.new_value] || a.new_value) + (note ? ' — ' + note : '');
    case 'ASSIGNED': return (a.new_value ? 'Assigned to ' + userDisplayName_(a.new_value) : 'Unassigned') + (note ? ' — ' + note : '');
    case 'NEXT_ACTION_CHANGED': return 'Next action: ' + (a.new_value || '(cleared)');
    case 'NEXT_ACTION_DONE': return 'Done: ' + toStr_(a.old_value);
    case 'DUE_DATE_CHANGED': return a.new_value ? 'Next action due ' + a.new_value : 'Due date cleared';
    case 'APPOINTMENT_SET': return 'Appointment set for ' + toStr_(a.new_value) + (note ? ' — ' + note : '');
    case 'APPOINTMENT_UPDATED': return note || ('Appointment updated: ' + a.field_changed + ' → ' + a.new_value);
    case 'UNDERWRITING_CHANGED': return a.field_changed.replace(/_/g, ' ') + ' set to ' + (a.new_value === '' ? '(blank)' : '$' + Number(a.new_value).toLocaleString());
    case 'OFFER_CHANGED': return 'Offer set to ' + (a.new_value === '' ? '(blank)' : '$' + Number(a.new_value).toLocaleString());
    case 'FLAGGED_FOR_JUAN': return note || 'Flagged for Juan';
    case 'JUAN_FLAG_CLEARED': return note || 'Flag cleared';
    case 'COMPLIANCE_FLAGGED': return note || 'Seller mentioned a mailer or check. Conversation stopped, routed to Juan.';
    case 'COMPLIANCE_CLEARED': return note || 'Mailer note cleared';
    case 'ARCHIVED': return 'Archived: ' + (STATUS_LABELS[a.new_value] || a.new_value) + (note ? ' — ' + note : '');
    case 'RESTORED': return 'Restored to ' + (STATUS_LABELS[a.new_value] || a.new_value);
    case 'LEAD_CREATED': return 'Lead created' + (note ? ' — ' + note : '');
    case 'LEAD_IMPORTED': return 'Imported' + (note ? ' — ' + note : '');
    case 'FIELD_CHANGED': return a.field_changed.replace(/_/g, ' ') + ' changed to ' + (a.new_value || '(blank)');
    default: return note || t;
  }
}
function publicActivity_(a) {
  return { activity_id: a.activity_id, lead_id: a.lead_id, user_id: a.user_id, user_name: a.user_name, user_email: a.user_email,
    business_date: a.business_date, timestamp_utc: a.timestamp_utc, action_type: a.action_type,
    field_changed: a.field_changed, old_value: a.old_value, new_value: a.new_value, note: a.note, display: activityDisplay_(a) };
}

/** Map lead_id → last N activities (chronological) for the given lead ids. One sheet read. */
function getRecentActivityFor_(leadIds, limitPerLead) {
  var want = {}; leadIds.forEach(function (id) { want[id] = true; });
  var rows = readTable_(SHEETS.LEAD_ACTIVITY).rows, out = {};
  for (var i = 0; i < rows.length; i++) {
    var a = rows[i]; if (!want[a.lead_id]) continue;
    (out[a.lead_id] = out[a.lead_id] || []).push(a);
  }
  Object.keys(out).forEach(function (id) {
    out[id].sort(function (x, y) { return cmpStr_(x.timestamp_utc, y.timestamp_utc); });
    if (limitPerLead) out[id] = out[id].slice(-limitPerLead);
    out[id] = out[id].map(publicActivity_);
  });
  return out;
}
function getActivityForLead_(leadId) { return (getRecentActivityFor_([leadId], 0)[leadId] || []); }
function getActivityOnDate_(businessDate) {
  return readTable_(SHEETS.LEAD_ACTIVITY).rows.filter(function (a) { return toStr_(a.business_date) === businessDate; });
}
