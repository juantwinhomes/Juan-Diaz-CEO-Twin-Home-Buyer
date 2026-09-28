'use strict';
// Roles, permissions and separation-of-duties checks.
//
// MVP login is a demo user picker (no passwords). Before real company data is loaded,
// replace login() with SSO or password auth; the permission checks below stay the same.
const crypto = require('node:crypto');
const { nowISO, HttpError } = require('./lib/util');

const ROLES = ['learner', 'preparer', 'reviewer', 'executive', 'admin'];

// What each role can do. A user holds one or more roles.
const PERMISSIONS = {
  'learn.use': ['learner', 'preparer', 'reviewer', 'executive', 'admin'],
  'data.view': ['learner', 'preparer', 'reviewer', 'executive', 'admin'],
  'import.run': ['preparer', 'admin'],
  'issue.work': ['preparer', 'reviewer'],
  'recon.prepare': ['preparer'],
  'recon.review': ['reviewer'],
  'close.prepare': ['preparer'],
  'close.review': ['reviewer'],
  'close.signoff': ['reviewer'],
  'payment.request': ['preparer'],
  'payment.approve': ['executive', 'reviewer'],
  'journal.propose': ['preparer'],
  'journal.approve': ['reviewer'],
  'vendor.verify_bank': ['reviewer', 'executive'],
  'module.signoff': ['reviewer'],
  'report.review': ['reviewer'],
  'brief.view': ['executive', 'reviewer', 'preparer', 'admin'],
  'policy.decide': ['reviewer', 'admin'],
  'settings.manage': ['admin'],
  'audit.view': ['reviewer', 'executive', 'admin'],
};

// Permissions a learner can never exercise, even if she also holds another role.
// This is the brief's rule: no learner can approve her own payment, journal entry or close.
const LEARNER_BLOCKED = new Set([
  'payment.approve', 'journal.approve', 'close.review', 'close.signoff',
  'recon.review', 'vendor.verify_bank', 'module.signoff', 'report.review', 'policy.decide',
]);

const rolesOf = user => (user?.roles || '').split(',').map(r => r.trim()).filter(Boolean);

function can(user, permission) {
  if (!user) return false;
  const roles = rolesOf(user);
  if (roles.includes('learner') && LEARNER_BLOCKED.has(permission)) return false;
  return (PERMISSIONS[permission] || []).some(r => roles.includes(r));
}

function require_(user, permission) {
  if (!user) throw new HttpError(401, 'Sign in first.');
  if (!can(user, permission)) {
    throw new HttpError(403, `Your role (${rolesOf(user).join(', ')}) can't do this: ${permission}.`);
  }
}

/** Separation of duties: the approver can't be anyone who requested or prepared the item. */
function requireIndependent(user, involvedUserIds, what) {
  const involved = involvedUserIds.filter(Boolean);
  if (involved.includes(user.id)) {
    throw new HttpError(403, `You prepared or requested this ${what}. A different person must approve it.`);
  }
}

function login(db, userId) {
  const user = db.get('SELECT * FROM users WHERE id = ? AND active = 1', userId);
  if (!user) throw new HttpError(404, 'No such user.');
  const token = crypto.randomBytes(24).toString('hex');
  db.run('INSERT INTO sessions(token, user_id, created_at) VALUES (?,?,?)', token, user.id, nowISO());
  return { token, user };
}

function userFromToken(db, token) {
  if (!token) return null;
  return db.get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.active = 1', token) || null;
}

module.exports = { ROLES, PERMISSIONS, can, require: require_, requireIndependent, login, userFromToken, rolesOf };
