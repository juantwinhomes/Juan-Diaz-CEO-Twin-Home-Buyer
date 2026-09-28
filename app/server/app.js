'use strict';
// HTTP API + static front end. No framework: node:http and a small router.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const auth = require('./auth');
const importer = require('./import/importer');
const D = require('./reports/data');
const W = require('./workflow');
const ai = require('./ai/adapter');
const content = require('./content');
const { buildBrief } = require('./reports/brief');
const { runRules } = require('./rules/exceptions');
const { CONNECTORS } = require('./connectors');
const { parseCSV } = require('./lib/csv');
const { audit } = require('./audit');
const { asOfDate } = require('./db');
const { HttpError, nowISO, toCents, addDays, daysBetween } = require('./lib/util');

const PUBLIC = path.join(__dirname, '..', 'public');
const MAX_BODY = 25 * 1024 * 1024;

function createApp(db) {
  const routes = [];
  const route = (method, pattern, handler, { open = false } = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler, open });
  };

  // ---------- session ----------
  route('GET', '/api/users', () => db.all('SELECT id, name, roles FROM users WHERE active = 1 ORDER BY id'), { open: true });
  route('POST', '/api/login', ({ body }) => {
    const { token, user } = auth.login(db, body.user_id);
    audit(db, user.id, 'session.login', 'user', user.id, {});
    return { token, user };
  }, { open: true });
  route('POST', '/api/logout', ({ token }) => { db.run('DELETE FROM sessions WHERE token = ?', token); return { ok: true }; });
  route('GET', '/api/me', ({ user }) => ({ user, roles: auth.rolesOf(user), permissions: Object.keys(auth.PERMISSIONS).filter(p => auth.can(user, p)) }));

  route('GET', '/api/bootstrap', ({ user }) => {
    auth.require(user, 'data.view');
    const setup = db.setting('setup', {});
    return {
      as_of: asOfDate(db), demo_mode: db.setting('demo_mode', false), setup,
      setup_missing: Object.entries(setup).filter(([, v]) => v === null || v === '').map(([k]) => k),
      entities: db.all('SELECT * FROM entities ORDER BY id'),
      projects: db.all('SELECT * FROM projects ORDER BY id'),
      bank_accounts: db.all('SELECT * FROM bank_accounts ORDER BY id'),
      accounts: db.all('SELECT * FROM accounts ORDER BY entity_id, number'),
      vendors: db.all('SELECT * FROM vendors ORDER BY name'),
      users: db.all('SELECT id, name, roles FROM users ORDER BY id'),
      statements: db.all('SELECT * FROM bank_statements ORDER BY period_end DESC'),
      ai: ai.status(db),
      lessons: content.loadLessons().map(m => ({ id: m.id, title: m.title, weeks: m.weeks, skills: m.skills || [] })),
      open_issue_count: db.get(`SELECT COUNT(*) AS n FROM issues WHERE status != 'resolved'`).n,
    };
  });

  // ---------- setup ----------
  route('GET', '/api/setup', ({ user }) => { auth.require(user, 'data.view'); return db.setting('setup', {}); });
  route('PUT', '/api/setup', ({ user, body }) => {
    auth.require(user, 'settings.manage');
    const before = db.setting('setup', {});
    const next = { ...before };
    for (const k of Object.keys(before)) if (k in body) next[k] = body[k] === '' ? null : body[k];
    db.setSetting('setup', next);
    audit(db, user.id, 'setup.updated', 'settings', 'setup', { changed: Object.keys(body) });
    return next;
  });
  route('PUT', '/api/entities/:id', ({ user, params, body }) => {
    auth.require(user, 'settings.manage');
    const e = db.get('SELECT * FROM entities WHERE id = ?', params.id);
    if (!e) throw new HttpError(404, 'Entity not found.');
    db.run('UPDATE entities SET name = ?, legal_name = ?, verified = ?, notes = ? WHERE id = ?',
      body.name ?? e.name, body.legal_name ?? e.legal_name, body.verified ? 1 : 0, body.notes ?? e.notes, e.id);
    audit(db, user.id, 'entity.updated', 'entity', e.id, body);
    return db.get('SELECT * FROM entities WHERE id = ?', e.id);
  });

  // ---------- imports & documents ----------
  const importOpts = body => ({
    kind: body.kind, entityId: body.entity_id || null, bankAccountId: body.bank_account_id || null,
    mapping: body.mapping || null, retrievedAt: body.retrieved_at || null,
    controlTotalCents: body.control_total !== undefined && body.control_total !== '' && body.control_total !== null ? toCents(body.control_total) : null,
    expectedRows: body.expected_rows ? Number(body.expected_rows) : null,
    statement: body.statement ? {
      opening_cents: toCents(body.statement.opening), closing_cents: toCents(body.statement.closing),
      period_start: body.statement.period_start || null, period_end: body.statement.period_end || null,
    } : null,
  });
  route('GET', '/api/imports', ({ user }) => {
    auth.require(user, 'data.view');
    return db.all(`SELECT b.id, b.kind, b.entity_id, b.bank_account_id, b.row_count, b.total_cents, b.date_min, b.date_max, b.status, b.ready,
      b.retrieved_at, b.created_by, b.created_at, b.committed_at, b.control_total_cents, b.expected_rows, d.filename, d.sha256, d.id AS document_id
      FROM import_batches b JOIN source_documents d ON d.id = b.document_id ORDER BY b.created_at DESC`);
  });
  route('GET', '/api/imports/:id', ({ user, params }) => {
    auth.require(user, 'data.view');
    const b = db.get('SELECT b.*, d.filename, d.sha256 FROM import_batches b JOIN source_documents d ON d.id = b.document_id WHERE b.id = ?', params.id);
    if (!b) throw new HttpError(404, 'Import not found.');
    return { ...b, mapping: JSON.parse(b.mapping_json || '{}'), validation: JSON.parse(b.validation_json || '{}'), fields: importer.FIELDS[b.kind] ? Object.entries(importer.FIELDS[b.kind]).map(([name, d]) => ({ name, required: !!d.required })) : [] };
  });
  route('POST', '/api/imports/preview', ({ user, body }) => {
    auth.require(user, 'import.run');
    if (!body.filename || !body.content_base64) throw new HttpError(400, 'Choose a file.');
    return importer.preview(db, user, { ...importOpts(body), filename: body.filename, buffer: Buffer.from(body.content_base64, 'base64') });
  });
  route('POST', '/api/imports/:id/remap', ({ user, params, body }) => {
    auth.require(user, 'import.run');
    const b = db.get('SELECT b.*, d.filename, d.stored_path FROM import_batches b JOIN source_documents d ON d.id = b.document_id WHERE b.id = ?', params.id);
    if (!b) throw new HttpError(404, 'Import not found.');
    return importer.preview(db, user, { ...importOpts({ kind: b.kind, entity_id: b.entity_id, bank_account_id: b.bank_account_id, ...body }), filename: b.filename, buffer: fs.readFileSync(b.stored_path) });
  });
  route('POST', '/api/imports/:id/commit', ({ user, params }) => {
    auth.require(user, 'import.run');
    const batch = importer.commit(db, user, params.id);
    const rules = runRules(db, user.id);
    return { batch, rules };
  });
  route('POST', '/api/imports/:id/reject', ({ user, params, body }) => { auth.require(user, 'import.run'); importer.reject(db, user, params.id, body.reason); return { ok: true }; });

  route('POST', '/api/documents', ({ user, body }) => {
    auth.require(user, 'import.run');
    if (!body.filename || !body.content_base64) throw new HttpError(400, 'Choose a file.');
    const { doc, existed } = importer.storeDocument(db, { filename: body.filename, buffer: Buffer.from(body.content_base64, 'base64'), mime: body.mime, kind: body.kind || 'supporting', userId: user.id });
    return { ...doc, existed, note: doc.pages != null ? `Stored. ${doc.pages} page(s) detected. Text extraction from PDFs is a later phase; enter key fields by hand for now.` : 'Stored as an original. It will not be modified.' };
  });
  route('GET', '/api/documents', ({ user }) => { auth.require(user, 'data.view'); return db.all('SELECT id, filename, sha256, mime, size, kind, pages, uploaded_by, uploaded_at, synthetic FROM source_documents ORDER BY uploaded_at DESC'); });
  route('GET', '/api/documents/:id/row/:line', ({ user, params }) => {
    auth.require(user, 'data.view');
    const d = db.get('SELECT * FROM source_documents WHERE id = ?', params.id);
    if (!d) throw new HttpError(404, 'Document not found.');
    if (!/csv/.test(d.mime || '') && !/\.csv$/i.test(d.filename)) throw new HttpError(400, 'Row view is available for CSV files.');
    const parsed = parseCSV(fs.readFileSync(d.stored_path, 'utf8'));
    const row = parsed.rows.find(r => r.line === Number(params.line));
    if (!row) throw new HttpError(404, `Line ${params.line} not found in ${d.filename}.`);
    return { document: { id: d.id, filename: d.filename, sha256: d.sha256, uploaded_at: d.uploaded_at }, line: row.line, headers: parsed.headers, values: row.values };
  });
  route('GET', '/api/documents/:id/file', ({ user, params, res }) => {
    auth.require(user, 'data.view');
    const d = db.get('SELECT * FROM source_documents WHERE id = ?', params.id);
    if (!d) throw new HttpError(404, 'Document not found.');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${d.filename.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(d.stored_path).pipe(res);
    return STREAMED;
  });

  route('GET', '/api/transactions', ({ user, query }) => {
    auth.require(user, 'data.view');
    const cond = [], p = [];
    if (query.batch) { cond.push('t.batch_id = ?'); p.push(query.batch); }
    if (query.entity) { cond.push('t.entity_id = ?'); p.push(query.entity); }
    if (query.project) { cond.push('t.project_id = ?'); p.push(query.project); }
    return D.txns(db, cond.length ? cond.join(' AND ') : '1=1', ...p);
  });

  // ---------- issues ----------
  const decorateIssue = i => {
    const active = new Set(db.setting('active_rule_keys', []));
    return { ...i, evidence: JSON.parse(i.evidence_json), evidence_json: undefined, still_detected: active.has(i.rule_key) };
  };
  route('GET', '/api/issues', ({ user, query }) => {
    auth.require(user, 'data.view');
    const cond = [], p = [];
    for (const k of ['status', 'severity', 'type', 'entity_id', 'assignee_id']) if (query[k]) { cond.push(`${k} = ?`); p.push(query[k]); }
    if (query.open) cond.push(`status != 'resolved'`);
    return db.all(`SELECT * FROM issues ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
      ORDER BY CASE status WHEN 'resolved' THEN 1 ELSE 0 END, CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, amount_cents DESC`, ...p).map(decorateIssue);
  });
  route('GET', '/api/issues/:id', ({ user, params }) => {
    auth.require(user, 'data.view');
    const i = db.get('SELECT * FROM issues WHERE id = ?', params.id);
    if (!i) throw new HttpError(404, 'Issue not found.');
    const history = db.all(`SELECT * FROM audit_events WHERE object_type = 'issue' AND object_id = ? ORDER BY id`, i.id);
    return { ...decorateIssue(i), history };
  });
  route('PATCH', '/api/issues/:id', ({ user, params, body }) => decorateIssue(W.updateIssue(db, user, params.id, body)));
  route('POST', '/api/rules/run', ({ user }) => { auth.require(user, 'issue.work'); return runRules(db, user.id); });

  // ---------- reconciliation ----------
  route('GET', '/api/reports/recon', ({ user }) => {
    auth.require(user, 'data.view');
    return db.all('SELECT s.*, b.name AS bank_name, b.entity_id FROM bank_statements s JOIN bank_accounts b ON b.id = s.bank_account_id ORDER BY s.period_end DESC')
      .map(s => { const r = D.reconciliationFor(db, s.id); return { ...s, reconciled: r.reconciled, unexplained_difference_cents: r.unexplained_difference_cents, workpaper_status: r.workpaper?.status || 'draft' }; });
  });
  route('GET', '/api/reports/recon/:id', ({ user, params }) => {
    auth.require(user, 'data.view');
    const r = D.reconciliationFor(db, params.id);
    if (!r) throw new HttpError(404, 'Statement not found.');
    return r;
  });
  route('POST', '/api/reports/recon/:id/explain', ({ user, params, body }) => W.explainReconItem(db, user, params.id, body.item_key, body.explanation, body.treatment));
  route('POST', '/api/reports/recon/:id/prepare', ({ user, params }) => W.prepareRecon(db, user, params.id));
  route('POST', '/api/reports/recon/:id/review', ({ user, params }) => W.reviewRecon(db, user, params.id));

  // ---------- other reports ----------
  route('GET', '/api/reports/project/:id', ({ user, params }) => {
    auth.require(user, 'data.view');
    const r = D.projectReportFor(db, params.id);
    if (!r) throw new HttpError(404, 'Project not found.');
    return r;
  });
  route('GET', '/api/reports/aging/:kind', ({ user, params, query }) => {
    auth.require(user, 'data.view');
    if (params.kind === 'ap') return D.apAging(db, query.entity || null);
    if (params.kind === 'ar') return D.arAging(db, query.entity || null);
    throw new HttpError(404, 'Use ap or ar.');
  });
  route('GET', '/api/reports/forecast/:entity', ({ user, params }) => { auth.require(user, 'data.view'); return D.forecastFor(db, params.entity); });
  route('GET', '/api/reports/draws', ({ user }) => { auth.require(user, 'data.view'); return D.drawsFor(db); });
  route('GET', '/api/reports/intercompany', ({ user }) => { auth.require(user, 'data.view'); return D.intercompanyFor(db); });
  route('GET', '/api/reports/freshness', ({ user }) => { auth.require(user, 'data.view'); return D.freshness(db); });
  route('GET', '/api/reports/versions', ({ user, query }) => {
    auth.require(user, 'data.view');
    return db.all(`SELECT id, kind, scope, status, created_by, created_at, reviewed_by, reviewed_at FROM report_versions ${query.kind ? 'WHERE kind = ?' : ''} ORDER BY created_at DESC`, ...(query.kind ? [query.kind] : []));
  });
  route('POST', '/api/reports/versions', ({ user, body }) => {
    auth.require(user, 'data.view');
    const builders = {
      brief: () => buildBrief(db), project: () => D.projectReportFor(db, body.scope), forecast: () => D.forecastFor(db, body.scope),
      ap_aging: () => D.apAging(db, body.scope || null), ar_aging: () => D.arAging(db, body.scope || null), draws: () => D.drawsFor(db),
      intercompany: () => D.intercompanyFor(db), recon: () => D.reconciliationFor(db, body.scope),
    };
    if (!builders[body.kind]) throw new HttpError(400, 'Unknown report kind.');
    return W.saveReportVersion(db, user, body.kind, body.scope, builders[body.kind]());
  });
  route('GET', '/api/reports/versions/:id', ({ user, params }) => {
    auth.require(user, 'data.view');
    const v = db.get('SELECT * FROM report_versions WHERE id = ?', params.id);
    if (!v) throw new HttpError(404, 'Version not found.');
    return { ...v, content: JSON.parse(v.content_json), content_json: undefined };
  });
  route('POST', '/api/reports/versions/:id/review', ({ user, params }) => W.reviewReportVersion(db, user, params.id));

  // ---------- brief ----------
  route('GET', '/api/brief', ({ user }) => {
    auth.require(user, 'brief.view');
    const live = buildBrief(db);
    // Juan sees the latest reviewed brief when one exists; everyone else sees live numbers labelled draft.
    if (auth.rolesOf(user).includes('executive') && live.status !== 'reviewed' && live.last_reviewed) {
      const v = db.get('SELECT * FROM report_versions WHERE id = ?', live.last_reviewed.id);
      return { ...JSON.parse(v.content_json), status: 'reviewed', showing_version: v.id, newer_draft_available: true, last_reviewed: live.last_reviewed };
    }
    return live;
  });
  route('POST', '/api/brief/draft', async ({ user }) => {
    auth.require(user, 'brief.view');
    const brief = buildBrief(db);
    const evidence = ai.briefEvidence(brief);
    const p = ai.provider(db);
    const out = await p.draftBrief({ evidence });
    audit(db, user.id, 'ai.brief_draft', 'brief', null, { provider: out.provider, evidence_items: evidence.length, removed: (out.removed || []).length });
    return { ...out, evidence, status: 'draft', label: 'AI-assisted draft. Not reviewed. Numbers are only those in the cited evidence.' };
  });

  // ---------- close ----------
  route('GET', '/api/close/:entity/:period', ({ user, params }) => { auth.require(user, 'data.view'); return W.closeStatus(db, params.entity, params.period); });
  route('POST', '/api/close/tasks/:id/prepare', ({ user, params, body }) => { W.prepareTask(db, user, params.id, body.evidence); return { ok: true }; });
  route('POST', '/api/close/tasks/:id/review', ({ user, params, body }) => { W.reviewTask(db, user, params.id, body.note); return { ok: true }; });
  route('POST', '/api/close/:entity/:period/signoff', ({ user, params, body }) => W.signOffClose(db, user, params.entity, params.period, body.note));

  // ---------- payments, vendors, journals ----------
  route('GET', '/api/payments', ({ user }) => {
    auth.require(user, 'data.view');
    return db.all(`SELECT p.*, v.name AS vendor_name, v.bank_changed_at, v.bank_change_verified_by, t.invoice_no, t.due_date FROM payments p
      LEFT JOIN vendors v ON v.id = p.vendor_id LEFT JOIN transactions t ON t.id = p.bill_id ORDER BY p.requested_at DESC`);
  });
  route('POST', '/api/payments', ({ user, body }) => W.requestPayment(db, user, body.bill_id));
  route('POST', '/api/payments/:id/decide', ({ user, params, body }) => W.decidePayment(db, user, params.id, body.decision, body.note));
  route('POST', '/api/vendors/:id/verify-bank', ({ user, params, body }) => { W.verifyVendorBank(db, user, params.id, body.note); runRules(db, user.id); return { ok: true }; });
  route('GET', '/api/journals', ({ user }) => { auth.require(user, 'data.view'); return db.all('SELECT * FROM journal_proposals ORDER BY prepared_at DESC').map(j => ({ ...j, lines: JSON.parse(j.lines_json) })); });
  route('POST', '/api/journals', ({ user, body }) => W.proposeJournal(db, user, body));
  route('POST', '/api/journals/:id/decide', ({ user, params, body }) => W.decideJournal(db, user, params.id, body.decision, body.note));
  route('GET', '/api/approvals', ({ user }) => { auth.require(user, 'data.view'); return db.all('SELECT * FROM approvals ORDER BY decided_at DESC'); });

  // ---------- learning ----------
  route('GET', '/api/lessons', ({ user }) => { auth.require(user, 'learn.use'); return content.loadLessons().map(m => ({ id: m.id, title: m.title, weeks: m.weeks, goal: m.goal, skills: m.skills || [] })); });
  route('GET', '/api/lessons/:id', ({ user, params }) => {
    auth.require(user, 'learn.use');
    const m = content.getLesson(params.id);
    return { ...content.publicLesson(m), progress: moduleProgress(db, user.id, m.id) };
  });
  route('POST', '/api/lessons/:id/scenario', ({ user, params, body }) => {
    auth.require(user, 'learn.use');
    const m = content.getLesson(params.id);
    if (!body.reasoning || body.reasoning.trim().length < 15) throw new HttpError(400, 'Write how you are working it out first (a sentence or two).');
    const answer = toCents(body.answer);
    if (answer === null) throw new HttpError(400, 'Enter a number, like 12,500.');
    const correct = answer === m.scenario.answer_cents;
    db.run('INSERT INTO attempts(user_id, module_id, kind, reasoning, confidence, answer_json, score, max_score, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      user.id, m.id, 'scenario', body.reasoning, body.confidence || null, JSON.stringify({ answer_cents: answer }), correct ? 1 : 0, 1, nowISO());
    if (!correct) logMistake(db, user.id, m.id, `Practice problem: answered ${body.answer}.`, m.scenario.explain, 'scenario');
    return { correct, explain: correct ? m.scenario.explain : null, hint: correct ? null : 'Not quite. Check each step of your working and try again.', followup: correct ? m.scenario.followup : null };
  });
  route('POST', '/api/lessons/:id/quiz', ({ user, params, body }) => {
    auth.require(user, 'learn.use');
    const m = content.getLesson(params.id);
    const answers = body.answers || [];
    const reasons = body.reasons || [];
    if (answers.length !== m.quiz.length || answers.some(a => a === null || a === undefined)) throw new HttpError(400, `Answer all ${m.quiz.length} questions.`);
    if (reasons.length !== m.quiz.length || reasons.some(r => !r || r.trim().length < 3)) throw new HttpError(400, 'Write a short reason for each answer before scoring.');
    const results = m.quiz.map((q, i) => ({ correct: Number(answers[i]) === q.answer, answer: q.answer, why: q.why, policy: q.policy, followup: q.followup || null }));
    const score = results.filter(r => r.correct).length;
    db.run('INSERT INTO attempts(user_id, module_id, kind, reasoning, confidence, answer_json, score, max_score, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      user.id, m.id, 'quiz', JSON.stringify(reasons), body.confidence || null, JSON.stringify(answers), score, m.quiz.length, nowISO());
    results.forEach((r, i) => { if (!r.correct) logMistake(db, user.id, m.id, `Quiz: "${m.quiz[i].q}" answered "${m.quiz[i].options[answers[i]]}". Reason given: ${reasons[i]}`, m.quiz[i].why, 'quiz'); });
    const pass = score >= Math.ceil(m.quiz.length * 0.8);
    return { score, max: m.quiz.length, pass, results };
  });
  route('POST', '/api/lessons/:id/tutor', async ({ user, params, body }) => {
    auth.require(user, 'learn.use');
    const m = content.getLesson(params.id);
    const item = m.quiz[Number(body.index)];
    if (!item) throw new HttpError(404, 'Question not found.');
    if (!body.reasoning || body.reasoning.trim().length < 3) throw new HttpError(400, 'Tell the coach why you chose that answer first.');
    const policy = item.policy ? db.get('SELECT * FROM policies WHERE id = ?', item.policy) : null;
    const out = await ai.provider(db).tutor({ item: { ...item, policy: policy ? `${policy.id} ${policy.title}: ${policy.decision || policy.question}${policy.status === 'pending' ? ' (pending CPA decision)' : ''}` : null }, choice: Number(body.choice), reasoning: body.reasoning, confidence: body.confidence, lesson: m });
    audit(db, user.id, 'ai.tutor', 'module', m.id, { provider: out.provider, index: body.index });
    return out;
  });
  route('POST', '/api/lessons/:id/task', ({ user, params, body }) => {
    auth.require(user, 'learn.use');
    content.getLesson(params.id);
    if (!body.summary || body.summary.trim().length < 20) throw new HttpError(400, 'Describe what you did and where the evidence is (a few sentences).');
    db.run('INSERT INTO task_submissions(user_id, module_id, summary, evidence, submitted_at) VALUES (?,?,?,?,?)', user.id, params.id, body.summary.trim(), body.evidence || null, nowISO());
    audit(db, user.id, 'module.task_submitted', 'module', params.id, {});
    return moduleProgress(db, user.id, params.id);
  });
  route('POST', '/api/lessons/:id/signoff', ({ user, params, body }) => {
    content.getLesson(params.id);
    W.signOffModule(db, user, { module_id: params.id, learner_id: body.learner_id, rubric: body.rubric, passed: body.passed, note: body.note });
    return moduleProgress(db, body.learner_id, params.id);
  });
  route('POST', '/api/mistakes', ({ user, body }) => {
    auth.require(user, 'learn.use');
    logMistake(db, body.user_id && auth.can(user, 'module.signoff') ? body.user_id : user.id, body.module_id || null, body.description, body.corrected_procedure, body.source || 'manual');
    return { ok: true };
  });
  route('GET', '/api/scorecard/:userId', ({ user, params }) => { auth.require(user, 'data.view'); return scorecard(db, params.userId); });
  route('GET', '/api/weekly-report', ({ user }) => { auth.require(user, 'data.view'); return weeklyReport(db); });

  // ---------- policies, audit, admin ----------
  route('GET', '/api/policies', ({ user }) => { auth.require(user, 'data.view'); return db.all('SELECT * FROM policies ORDER BY id'); });
  route('PUT', '/api/policies/:id', ({ user, params, body }) => {
    auth.require(user, 'policy.decide');
    const p = db.get('SELECT * FROM policies WHERE id = ?', params.id);
    if (!p) throw new HttpError(404, 'Policy not found.');
    if (!body.decision || body.decision.trim().length < 5) throw new HttpError(400, 'Write the decision.');
    db.run(`UPDATE policies SET decision = ?, decided_by = ?, decided_at = ?, status = 'decided' WHERE id = ?`, body.decision.trim(), user.id, nowISO(), p.id);
    audit(db, user.id, 'policy.decided', 'policy', p.id, { from: p.decision, to: body.decision });
    return db.get('SELECT * FROM policies WHERE id = ?', p.id);
  });
  route('GET', '/api/audit', ({ user, query }) => {
    auth.require(user, 'audit.view');
    return db.all('SELECT * FROM audit_events ORDER BY id DESC LIMIT ?', Math.min(Number(query.limit) || 200, 2000)).map(a => ({ ...a, detail: JSON.parse(a.detail_json || '{}'), detail_json: undefined }));
  });
  route('GET', '/api/admin/settings', ({ user }) => {
    auth.require(user, 'settings.manage');
    const keys = ['as_of_date', 'demo_mode', 'default_assignee', 'collection_lag_days', 'stale_after_days', 'receipt_required_over_cents', 'approval_required_over_cents', 'ai'];
    return { ...Object.fromEntries(keys.map(k => [k, db.setting(k)])), ai_status: ai.status(db) };
  });
  route('PUT', '/api/admin/settings', ({ user, body }) => {
    auth.require(user, 'settings.manage');
    const allowed = ['as_of_date', 'default_assignee', 'collection_lag_days', 'stale_after_days', 'receipt_required_over_cents', 'approval_required_over_cents'];
    for (const k of allowed) if (k in body) db.setSetting(k, body[k]);
    if ('ai_approved' in body) db.setSetting('ai', { approved: !!body.ai_approved, approved_by: user.id, approved_at: nowISO(), note: body.ai_note || null });
    audit(db, user.id, 'settings.updated', 'settings', null, body);
    return { ok: true, ai_status: ai.status(db) };
  });
  route('GET', '/api/admin/users', ({ user }) => { auth.require(user, 'settings.manage'); return db.all('SELECT * FROM users ORDER BY id'); });
  route('PUT', '/api/admin/users/:id', ({ user, params, body }) => {
    auth.require(user, 'settings.manage');
    const roles = String(body.roles || '').split(',').map(r => r.trim()).filter(r => auth.ROLES.includes(r));
    if (!roles.length) throw new HttpError(400, `Give at least one role: ${auth.ROLES.join(', ')}.`);
    const existing = db.get('SELECT * FROM users WHERE id = ?', params.id);
    if (existing) db.run('UPDATE users SET name = ?, roles = ?, active = ? WHERE id = ?', body.name || existing.name, roles.join(','), body.active === false ? 0 : 1, params.id);
    else db.run('INSERT INTO users(id, name, roles) VALUES (?,?,?)', params.id, body.name || params.id, roles.join(','));
    audit(db, user.id, 'user.updated', 'user', params.id, { roles, active: body.active !== false });
    return db.get('SELECT * FROM users WHERE id = ?', params.id);
  });
  route('GET', '/api/connectors', ({ user }) => { auth.require(user, 'data.view'); return CONNECTORS.map(({ impl, ...c }) => ({ ...c, connected: false })); });
  route('GET', '/api/admin/backup', ({ user, res }) => {
    auth.require(user, 'settings.manage');
    const tmp = path.join(require('node:os').tmpdir(), `kca-backup-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    audit(db, user.id, 'admin.backup', 'database', null, {});
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="academy-backup-${asOfDate(db)}.db"` });
    fs.createReadStream(tmp).on('close', () => fs.rm(tmp, () => {})).pipe(res);
    return STREAMED;
  });

  // ---------- server ----------
  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const headers = {
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    };
    try {
      if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res, headers);
      const r = routes.find(r => r.method === req.method && r.re.test(url.pathname));
      if (!r) throw new HttpError(404, 'Not found.');
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(url.pathname.match(r.re)[i + 1])]));
      const token = req.headers['x-session'] || null;
      const user = auth.userFromToken(db, token);
      if (!r.open && !user) throw new HttpError(401, 'Sign in first.');
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req) : {};
      const out = await r.handler({ user, params, body, query: Object.fromEntries(url.searchParams), token, res, req });
      if (out === STREAMED) return;
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(out ?? null));
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: status === 500 ? 'Something went wrong on the server. Check the server log.' : e.message, detail: e.detail || null }));
    }
  };
  return { handler, server: () => http.createServer(handler) };
}

const STREAMED = Symbol('streamed');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function serveStatic(pathname, res, headers) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, headers); return res.end('Not found');
  }
  res.writeHead(200, { ...headers, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new HttpError(413, 'File too large (limit 25 MB).')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Request body is not valid JSON.')); }
    });
    req.on('error', reject);
  });
}

// ---------- learning helpers ----------
function logMistake(db, userId, moduleId, description, corrected, source) {
  if (!description) throw new HttpError(400, 'Describe the mistake.');
  db.run('INSERT INTO mistakes(user_id, module_id, description, corrected_procedure, source, created_at) VALUES (?,?,?,?,?,?)', userId, moduleId, description, corrected || null, source, nowISO());
}

function moduleProgress(db, userId, moduleId) {
  const quiz = db.get(`SELECT MAX(score) AS best, MAX(max_score) AS max, COUNT(*) AS n FROM attempts WHERE user_id = ? AND module_id = ? AND kind = 'quiz'`, userId, moduleId);
  const scen = db.get(`SELECT MAX(score) AS best, COUNT(*) AS n FROM attempts WHERE user_id = ? AND module_id = ? AND kind = 'scenario'`, userId, moduleId);
  const task = db.get('SELECT * FROM task_submissions WHERE user_id = ? AND module_id = ? ORDER BY id DESC LIMIT 1', userId, moduleId);
  const sign = db.get('SELECT s.*, u.name AS reviewer_name FROM signoffs s JOIN users u ON u.id = s.reviewer_id WHERE s.learner_id = ? AND s.module_id = ? ORDER BY s.id DESC LIMIT 1', userId, moduleId);
  const quizPass = quiz.max ? quiz.best >= Math.ceil(quiz.max * 0.8) : false;
  const status = sign?.passed ? 'passed' : task && quizPass && scen.best ? 'ready_for_signoff' : quiz.n || scen.n || task ? 'in_progress' : 'not_started';
  return { module_id: moduleId, quiz_best: quiz.best, quiz_max: quiz.max, quiz_attempts: quiz.n, quiz_pass: quizPass, scenario_solved: !!scen.best, scenario_attempts: scen.n, task, signoff: sign || null, status };
}

function scorecard(db, userId) {
  const u = db.get('SELECT id, name, roles FROM users WHERE id = ?', userId);
  if (!u) throw new HttpError(404, 'User not found.');
  const lessons = content.loadLessons();
  const modules = lessons.map(m => ({ id: m.id, title: m.title, weeks: m.weeks, skills: m.skills || [], ...moduleProgress(db, userId, m.id) }));
  const attempts = db.all('SELECT * FROM attempts WHERE user_id = ? ORDER BY id DESC LIMIT 100', userId);
  const calib = {};
  for (const a of attempts.filter(a => a.confidence)) {
    const k = a.confidence; calib[k] = calib[k] || { attempts: 0, score: 0, max: 0 };
    calib[k].attempts++; calib[k].score += a.score; calib[k].max += a.max_score;
  }
  const mistakes = db.all('SELECT * FROM mistakes WHERE user_id = ? ORDER BY id DESC LIMIT 200', userId);
  const work = {
    issues_resolved: db.get(`SELECT COUNT(*) AS n FROM issues WHERE disposition_by = ? AND status = 'resolved'`, userId).n,
    issues_open_assigned: db.get(`SELECT COUNT(*) AS n FROM issues WHERE assignee_id = ? AND status != 'resolved'`, userId).n,
    recons_prepared: db.get('SELECT COUNT(*) AS n FROM reconciliations WHERE prepared_by = ?', userId).n,
    recons_reviewed_ok: db.get(`SELECT COUNT(*) AS n FROM reconciliations WHERE prepared_by = ? AND status = 'reviewed'`, userId).n,
    closes_prepared_signed: db.get(`SELECT COUNT(DISTINCT c.id) AS n FROM close_periods c JOIN close_tasks t ON t.close_id = c.id WHERE c.status = 'closed' AND t.prepared_by = ?`, userId).n,
    reviewer_notes: db.all('SELECT module_id, note, passed, signed_at FROM signoffs WHERE learner_id = ? ORDER BY id DESC LIMIT 10', userId),
  };
  const passed = id => modules.find(m => m.id === id)?.status === 'passed';
  const gates = [
    { n: 1, title: 'Classify 20 transactions at 90%+ and explain exceptions', met: passed('m1'), evidence: 'Module 1 sign-off' },
    { n: 2, title: 'Reconcile two accounts with $0.00 unexplained', met: passed('m2') && work.recons_reviewed_ok >= 2, evidence: `${work.recons_reviewed_ok} reviewed reconciliation(s)` },
    { n: 3, title: 'Complete property cost bridge with support', met: passed('m3'), evidence: 'Module 3 sign-off' },
    { n: 4, title: 'Run a supervised monthly close', met: passed('m4') && work.closes_prepared_signed >= 1, evidence: `${work.closes_prepared_signed} signed close(s)` },
    { n: 5, title: 'Three consecutive reviewer-approved closes', met: passed('m6') && work.closes_prepared_signed >= 3, evidence: `${work.closes_prepared_signed} signed close(s)` },
  ];
  const recurring = {};
  for (const m of mistakes) recurring[m.module_id || 'other'] = (recurring[m.module_id || 'other'] || 0) + 1;
  return { user: u, modules, calibration: calib, mistakes, recurring_by_module: recurring, work, gates };
}

function weeklyReport(db) {
  const asOf = asOfDate(db);
  const since = addDays(asOf, -7);
  const kristine = db.get(`SELECT id FROM users WHERE roles LIKE '%learner%' ORDER BY id LIMIT 1`);
  const sc = kristine ? scorecard(db, kristine.id) : null;
  const open = db.all(`SELECT * FROM issues WHERE status != 'resolved'`);
  const setup = db.setting('setup', {});
  return {
    as_of: asOf, learner: sc?.user || null,
    skills_passed: sc ? sc.modules.filter(m => m.status === 'passed').map(m => m.title) : [],
    in_progress: sc ? sc.modules.filter(m => ['in_progress', 'ready_for_signoff'].includes(m.status)).map(m => ({ title: m.title, status: m.status })) : [],
    recurring_errors: sc ? Object.entries(sc.recurring_by_module).sort((a, b) => b[1] - a[1]).slice(0, 3) : [],
    gates: sc?.gates || [],
    work: {
      opened_this_week: db.get('SELECT COUNT(*) AS n FROM issues WHERE substr(created_at, 1, 10) > ?', since).n,
      resolved_this_week: db.get(`SELECT COUNT(*) AS n FROM issues WHERE status = 'resolved' AND substr(disposition_at, 1, 10) > ?`, since).n,
      open: open.length,
      overdue: open.filter(i => i.due_date && daysBetween(i.due_date, asOf) > 0).map(i => ({ id: i.id, title: i.title, due_date: i.due_date, assignee_id: i.assignee_id })),
    },
    unresolved_setup: Object.entries(setup).filter(([, v]) => v === null || v === '').map(([k]) => k),
    freshness: D.freshness(db, asOf),
  };
}

module.exports = { createApp };
