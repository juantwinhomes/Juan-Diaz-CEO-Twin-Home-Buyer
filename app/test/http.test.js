'use strict';
// End-to-end checks through the HTTP API.
const test = require('node:test');
const assert = require('node:assert/strict');
const { freshDb } = require('./helpers');
const { createApp } = require('../server/app');

async function start() {
  const db = freshDb();
  const server = createApp(db).server();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { token, method = 'GET', body } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  };
  const login = async id => (await call('/api/login', { method: 'POST', body: { user_id: id } })).body.token;
  return { db, server, call, login };
}

test('API: sign-in required, roles enforced, security headers set', async t => {
  const { server, call, login } = await start();
  t.after(() => server.close());
  assert.equal((await call('/api/issues')).status, 401);
  const k = await login('U-KRISTINE');
  const r = await call('/api/issues', { token: k });
  assert.equal(r.status, 200);
  assert.ok(r.body.length >= 15);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await call('/api/audit', { token: k })).status, 403);
  assert.equal((await call('/api/admin/settings', { token: k })).status, 403);
  const pay = (await call('/api/payments', { token: k })).body[0];
  const denied = await call(`/api/payments/${pay.id}/decide`, { token: k, method: 'POST', body: { decision: 'approved' } });
  assert.equal(denied.status, 403);
});

test('API: learner must reason before answers are revealed', async t => {
  const { server, call, login } = await start();
  t.after(() => server.close());
  const k = await login('U-KRISTINE');
  const lesson = (await call('/api/lessons/m1', { token: k })).body;
  assert.ok(lesson.quiz.every(q => q.answer === undefined));
  const noReason = await call('/api/lessons/m1/quiz', { token: k, method: 'POST', body: { answers: [1, 2, 1, 2, 1], reasons: ['', '', '', '', ''] } });
  assert.equal(noReason.status, 400);
  const scored = await call('/api/lessons/m1/quiz', { token: k, method: 'POST', body: { answers: [1, 2, 1, 2, 0], reasons: ['asset up', 'liability', 'incurred', 'both books', 'guess'], confidence: 'Somewhat sure' } });
  assert.equal(scored.status, 200);
  assert.equal(scored.body.score, 4);
  assert.equal(scored.body.pass, true);
  const scen = await call('/api/lessons/m1/scenario', { token: k, method: 'POST', body: { reasoning: 'Assets minus loan and bills', answer: '179,000', confidence: 'Very sure' } });
  assert.equal(scen.body.correct, true);
  const sc = (await call('/api/scorecard/U-KRISTINE', { token: k })).body;
  const m1 = sc.modules.find(m => m.id === 'm1');
  assert.equal(m1.quiz_pass, true);
  assert.equal(m1.scenario_solved, true);
  assert.equal(sc.mistakes.length, 1, 'the one wrong answer went to the mistake log');
});

test('API: brief for Juan and a source-row drill-down', async t => {
  const { server, call, login } = await start();
  t.after(() => server.close());
  const j = await login('U-JUAN');
  const b = (await call('/api/brief', { token: j })).body;
  assert.equal(b.status, 'draft');
  assert.equal(b.top_issues.length, 3);
  const k = await login('U-KRISTINE');
  const issue = (await call('/api/issues?type=duplicate_invoice', { token: k })).body[0];
  const ref = issue.evidence[1].ref;
  const row = (await call(`/api/documents/${ref.document_id}/row/${ref.row}`, { token: k })).body;
  assert.equal(row.values['Invoice No'], 'INV1001');
  assert.equal(row.values.Amount, '6,400.00');
  const draft = (await call('/api/brief/draft', { token: k, method: 'POST' })).body;
  assert.equal(draft.provider, 'rules');
  assert.equal(draft.status, 'draft');
});
