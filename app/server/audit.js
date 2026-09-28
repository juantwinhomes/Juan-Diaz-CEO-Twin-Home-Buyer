'use strict';
const { nowISO } = require('./lib/util');

/** Append an audit event. The audit table is append-only: nothing in the app updates or deletes it. */
function audit(db, userId, action, objectType, objectId, detail = {}) {
  db.run('INSERT INTO audit_events(at, user_id, action, object_type, object_id, detail_json) VALUES (?,?,?,?,?,?)',
    nowISO(), userId || null, action, objectType || null, objectId || null, JSON.stringify(detail));
}

module.exports = { audit };
