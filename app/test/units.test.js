'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { freshDb, user } = require('./helpers');
const { toCents, toISODate, weekStart } = require('../server/lib/util');
const { parseCSV } = require('../server/lib/csv');
const { aging } = require('../server/calc/aging');
const { cashForecast } = require('../server/calc/forecast');
const { intercompany } = require('../server/calc/intercompany');
const auth = require('../server/auth');
const ai = require('../server/ai/adapter');
const D = require('../server/reports/data');
const content = require('../server/content');

test('money and dates parse exactly', () => {
  assert.equal(toCents('$1,234.56'), 123456);
  assert.equal(toCents('(1,234.56)'), -123456);
  assert.equal(toCents('-0.05'), -5);
  assert.equal(toCents('12'), 1200);
  assert.equal(toCents('abc'), null);
  assert.equal(toISODate('9/30/2026'), '2026-09-30');
  assert.equal(toISODate('2026-02-30'), null);
  assert.equal(weekStart('2026-09-30'), '2026-09-28');
});

test('CSV parser keeps quoted commas and source line numbers', () => {
  const { headers, rows } = parseCSV('A,B\n"1,000.00","say ""hi"""\n\n3,4\n');
  assert.deepEqual(headers, ['A', 'B']);
  assert.equal(rows[0].values.A, '1,000.00');
  assert.equal(rows[0].values.B, 'say "hi"');
  assert.equal(rows[0].line, 2);
  assert.equal(rows[1].line, 4);
  assert.throws(() => parseCSV('A\n"unclosed'), /unclosed quote/);
});

test('aging buckets by days past due', () => {
  const r = aging([{ id: 1, due_date: '2026-09-30', amount_cents: 100 }, { id: 2, due_date: '2026-08-14', amount_cents: 200 }, { id: 3, due_date: '2026-06-27', amount_cents: 400 }], '2026-09-30');
  assert.equal(r.totals.current, 100);
  assert.equal(r.totals.d31_60, 200);
  assert.equal(r.totals.d90_plus, 400);
  assert.equal(r.totals.total, 700);
});

test('cash forecast labels known vs estimate and finds negative weeks', () => {
  const f = cashForecast({
    asOf: '2026-09-30', startCash: { amount_cents: 1000 },
    apBills: [{ id: 'b', vendor: 'V', due_date: '2026-09-01', amount_cents: 1500, source: {} }],
    arInvoices: [{ id: 'i', customer: 'C', due_date: '2026-10-01', amount_cents: 5000 }, { id: 'old', customer: 'Old', due_date: '2026-05-01', amount_cents: 9999 }],
    assumptions: [{ id: 'a', label: 'Rent', amount_cents: -100, frequency: 'weekly', start_date: '2026-09-28', assumption: 'lease' }],
  });
  assert.equal(f.weeks.length, 13);
  assert.equal(f.weeks[0].closing_cents, 1000 - 1500 - 100);
  assert.equal(f.negative_weeks[0].week, 1);
  assert.ok(f.weeks[0].lines.find(l => l.kind === 'ap').basis === 'known');
  assert.ok(f.excluded.find(x => x.id === 'old'), 'receivable over 90 days excluded');
  assert.equal(f.weeks[12].closing_cents, 1000 - 1500 + 5000 - 100 * 13);
});

test('intercompany: each side must mirror the other', () => {
  const ents = [{ id: 'A' }, { id: 'B' }];
  const ok = intercompany([
    { entity_id: 'A', counterparty_entity_id: 'B', account_subtype: 'due_from', bank_account_id: 'x', amount_cents: -500 },
    { entity_id: 'B', counterparty_entity_id: 'A', account_subtype: 'due_to', bank_account_id: 'y', amount_cents: 500 },
  ], ents);
  assert.equal(ok.pairs[0].difference_cents, 0);
  const off = intercompany([
    { entity_id: 'A', counterparty_entity_id: 'B', account_subtype: 'due_from', bank_account_id: 'x', amount_cents: -400 },
    { entity_id: 'B', counterparty_entity_id: 'A', account_subtype: 'due_to', bank_account_id: 'y', amount_cents: 500 },
  ], ents);
  assert.equal(off.pairs[0].difference_cents, -100);
});

test('roles: learners never approve; admins manage settings', () => {
  const learnerPreparer = { roles: 'learner,preparer' };
  assert.equal(auth.can(learnerPreparer, 'import.run'), true);
  assert.equal(auth.can(learnerPreparer, 'payment.approve'), false);
  assert.equal(auth.can({ roles: 'learner,reviewer' }, 'close.signoff'), false, 'a learner who is also a reviewer still cannot sign off');
  assert.equal(auth.can({ roles: 'reviewer' }, 'close.signoff'), true);
  assert.equal(auth.can({ roles: 'executive' }, 'payment.approve'), true);
  assert.equal(auth.can({ roles: 'executive' }, 'journal.approve'), false);
  assert.equal(auth.can({ roles: 'admin' }, 'settings.manage'), true);
});

test('AI: numbers without matching citations are removed; bundles are minimized', () => {
  const ev = ai.evidenceBundle([{ label: 'Cash THB', value: '$28,025.00' }, { label: 'Vendor bank', value: 'acct 123456789012 email a@b.com' }]);
  assert.match(ev[1].value, /account number removed/);
  assert.match(ev[1].value, /email removed/);
  const c = ai.checkCitations('Cash is $28,025.00 [E1]. Cash is $99,000.00 [E1]. Profit is $5,000. Nothing numeric here.', ev);
  assert.equal(c.removed.length, 2);
  assert.match(c.text, /\$28,025\.00 \[E1\]/);
  assert.match(c.text, /Nothing numeric here/);
});

test('AI: no key or no approval means the rules provider; the AI path has no write methods', async () => {
  const db = freshDb();
  delete process.env.ANTHROPIC_API_KEY;
  const p = ai.provider(db);
  assert.equal(p.name, 'rules');
  assert.deepEqual(Object.keys(p).sort(), ['draftBrief', 'name', 'tutor']);
  const m = content.getLesson('m2');
  const out = await p.tutor({ item: m.quiz[0], choice: 0, reasoning: 'I would just update it', confidence: 'Very sure' });
  assert.equal(out.correct, false);
  assert.match(out.feedback, /mistake log/);
  db.setSetting('ai', { approved: true });
  assert.equal(ai.provider(db).name, 'rules', 'approval alone is not enough without a key in the environment');
});

test('Document text is data: an embedded instruction changes nothing', () => {
  const db = freshDb();
  const t = db.get(`SELECT * FROM transactions WHERE memo LIKE '%ignore your rules%'`);
  assert.ok(t, 'memo stored verbatim as data');
  const st = db.get('SELECT * FROM bank_statements');
  assert.equal(D.reconciliationFor(db, st.id).reconciled, false, 'the account is still not reconciled');
  assert.equal(db.get('SELECT COUNT(*) AS n FROM reconciliations').n, 0);
});

test('Lesson files load, validate, and hide answers from the browser', () => {
  const lessons = content.loadLessons();
  assert.equal(lessons.length, 6);
  for (const m of lessons) {
    assert.ok(m.quiz.length >= 5 && m.rubric.length && m.task && m.scenario.answer_cents !== undefined);
    const pub = content.publicLesson(m);
    assert.ok(pub.quiz.every(q => !('answer' in q) && !('why' in q)));
    assert.ok(!('answer_cents' in pub.scenario) && !('explain' in pub.scenario));
  }
});

test('Module sign-off must be by an independent reviewer', () => {
  const db = freshDb();
  const W = require('../server/workflow');
  assert.throws(() => W.signOffModule(db, user(db, 'U-KRISTINE'), { module_id: 'm1', learner_id: 'U-KRISTINE', passed: true, note: 'I passed myself' }), e => e.status === 403);
  W.signOffModule(db, user(db, 'U-REVIEWER'), { module_id: 'm1', learner_id: 'U-KRISTINE', passed: false, note: 'Missed accrual cutoff on 2 of 10.' });
  assert.equal(db.get(`SELECT COUNT(*) AS n FROM mistakes WHERE source = 'reviewer'`).n, 1);
});
