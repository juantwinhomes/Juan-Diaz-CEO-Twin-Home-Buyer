'use strict';
// CSV import pipeline: store original -> map columns -> normalize -> validate -> preview -> commit.
// Originals are never modified. Every staged record keeps its source document and CSV line number.
// Text in the file (memos, descriptions) is stored as data only; nothing in it is ever executed or obeyed.
const fs = require('node:fs');
const path = require('node:path');
const { parseCSV } = require('../lib/csv');
const { toCents, toISODate, sha256, newId, nowISO, normInvoice, fmt, HttpError } = require('../lib/util');
const { audit } = require('../audit');
const { DATA_DIR } = require('../db');

const TXN_TYPES = ['bill', 'bill_payment', 'expense', 'deposit', 'check', 'journal', 'transfer', 'invoice', 'invoice_payment', 'draw'];

// Target fields per import kind, with header synonyms used to suggest a mapping.
const FIELDS = {
  ledger: {
    date: { required: true, synonyms: ['date', 'txn date', 'transaction date'] },
    type: { required: true, synonyms: ['type', 'transaction type', 'txn type'] },
    entity: { synonyms: ['entity', 'company', 'entity id'] },
    account: { required: true, synonyms: ['account', 'account number', 'gl account', 'split'] },
    bank_account: { synonyms: ['bank account', 'bank', 'payment account'] },
    amount: { required: true, synonyms: ['amount', 'total'] },
    vendor: { synonyms: ['vendor', 'payee', 'name', 'vendor/customer'] },
    customer: { synonyms: ['customer', 'client'] },
    project: { synonyms: ['project', 'project id', 'customer:project', 'job'] },
    category: { synonyms: ['category', 'cost category', 'class'] },
    ref: { synonyms: ['ref', 'num', 'no.', 'check no', 'reference'] },
    invoice_no: { synonyms: ['invoice no', 'invoice number', 'invoice #', 'bill no'] },
    due_date: { synonyms: ['due date', 'due'] },
    memo: { synonyms: ['memo', 'description', 'memo/description'] },
    receipt: { synonyms: ['receipt', 'attachment', 'receipt file'] },
    approved_by: { synonyms: ['approved by', 'approver'] },
    counterparty_entity: { synonyms: ['counterparty entity', 'counterparty', 'intercompany entity'] },
    paid: { synonyms: ['status', 'paid', 'open balance status'] },
  },
  ap_bills: {
    date: { required: true, synonyms: ['date', 'bill date'] },
    vendor: { required: true, synonyms: ['vendor', 'payee', 'supplier'] },
    invoice_no: { required: true, synonyms: ['invoice no', 'invoice number', 'invoice #', 'bill no', 'ref', 'num'] },
    due_date: { required: true, synonyms: ['due date', 'due'] },
    amount: { required: true, synonyms: ['amount', 'total', 'open balance'] },
    entity: { synonyms: ['entity', 'company'] },
    project: { synonyms: ['project', 'project id', 'customer:project', 'job'] },
    account: { required: true, synonyms: ['account', 'account number', 'category account'] },
    category: { synonyms: ['category', 'cost category'] },
    memo: { synonyms: ['memo', 'description'] },
    receipt: { synonyms: ['receipt', 'attachment', 'document'] },
    approved_by: { synonyms: ['approved by', 'approver'] },
    paid: { synonyms: ['status', 'paid'] },
  },
  bank_statement: {
    date: { required: true, synonyms: ['date', 'posting date', 'posted date'] },
    description: { required: true, synonyms: ['description', 'details', 'memo', 'payee'] },
    amount: { synonyms: ['amount', 'net amount'] },
    debit: { synonyms: ['debit', 'withdrawal', 'withdrawals'] },
    credit: { synonyms: ['credit', 'deposit', 'deposits'] },
    ref: { synonyms: ['ref', 'reference', 'check number', 'check no'] },
    balance: { synonyms: ['balance', 'running balance'] },
  },
};

function suggestMapping(kind, headers) {
  const mapping = {};
  const lower = headers.map(h => h.toLowerCase());
  for (const [field, def] of Object.entries(FIELDS[kind])) {
    const idx = lower.findIndex(h => def.synonyms.includes(h) || h === field.replace('_', ' '));
    if (idx >= 0 && !Object.values(mapping).includes(headers[idx])) mapping[field] = headers[idx];
  }
  return mapping;
}

function docsDir() {
  const dir = path.join(DATA_DIR, 'documents');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Save an original file (immutable). Returns the source_documents row. Same bytes -> same document. */
function storeDocument(db, { filename, buffer, mime, kind, userId, synthetic = 0 }) {
  const hash = sha256(buffer);
  const existing = db.get('SELECT * FROM source_documents WHERE sha256 = ?', hash);
  if (existing) return { doc: existing, existed: true };
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
  const id = newId('DOC');
  const stored = path.join(docsDir(), `${id}-${safeName}`);
  fs.writeFileSync(stored, buffer, { flag: 'wx', mode: 0o440 });
  let pages = null;
  if (/pdf/i.test(mime || '') || /\.pdf$/i.test(filename)) {
    pages = (buffer.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length || null;
  }
  db.run(`INSERT INTO source_documents(id, filename, sha256, mime, size, stored_path, kind, pages, uploaded_by, uploaded_at, synthetic)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`, id, filename, hash, mime || null, buffer.length, stored, kind || null, pages, userId, nowISO(), synthetic);
  audit(db, userId, 'document.stored', 'source_document', id, { filename, sha256: hash, size: buffer.length, pages });
  return { doc: db.get('SELECT * FROM source_documents WHERE id = ?', id), existed: false };
}

// ---------- lookups ----------
function makeResolvers(db) {
  const entities = db.all('SELECT * FROM entities');
  const accounts = db.all('SELECT * FROM accounts');
  const banks = db.all('SELECT * FROM bank_accounts');
  const projects = db.all('SELECT * FROM projects');
  const eq = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  return {
    entity: v => entities.find(e => eq(e.id, v) || eq(e.name, v) || (e.legal_name && eq(e.legal_name, v))),
    account: (entityId, v) => accounts.find(a => a.entity_id === entityId && (eq(a.id, v) || eq(a.number, v) || eq(a.name, v) || eq(`${a.number} ${a.name}`, v))),
    bank: v => banks.find(b => eq(b.id, v) || eq(b.name, v)),
    project: v => projects.find(p => eq(p.id, v)),
    vendor: v => db.get('SELECT * FROM vendors WHERE lower(name) = lower(?)', v.trim()),
  };
}

// ---------- normalize ----------
function normalizeRows(db, kind, parsed, mapping, ctx) {
  const R = makeResolvers(db);
  const fields = FIELDS[kind];
  const get = (row, f) => (mapping[f] ? row.values[mapping[f]] ?? '' : '');
  const batchEntity = ctx.entityId ? R.entity(ctx.entityId) : null;

  return parsed.rows.map(row => {
    const errors = [], warnings = [];
    const rec = { line: row.line };
    if (row.cellCount < parsed.headers.length) errors.push(`Row has ${row.cellCount} of ${parsed.headers.length} columns. The export may be cut off.`);
    for (const [f, def] of Object.entries(fields)) {
      if (def.required && !get(row, f)) errors.push(`Missing ${f.replace('_', ' ')}.`);
    }
    rec.date = toISODate(get(row, 'date'));
    if (get(row, 'date') && !rec.date) errors.push(`Date "${get(row, 'date')}" isn't a valid date.`);

    if (kind === 'bank_statement') {
      let amt = mapping.amount ? toCents(get(row, 'amount')) : null;
      if (amt === null && (mapping.debit || mapping.credit)) {
        const d = toCents(get(row, 'debit')) || 0, c = toCents(get(row, 'credit')) || 0;
        amt = c - Math.abs(d);
      }
      if (amt === null) errors.push('Amount is missing or not a number.');
      rec.amount_cents = amt;
      rec.description = get(row, 'description');
      rec.ref = get(row, 'ref') || null;
      rec.balance_cents = mapping.balance ? toCents(get(row, 'balance')) : null;
      return { ...rec, errors, warnings };
    }

    rec.amount_cents = toCents(get(row, 'amount'));
    if (get(row, 'amount') && rec.amount_cents === null) errors.push(`Amount "${get(row, 'amount')}" isn't a number.`);
    rec.type = kind === 'ap_bills' ? 'bill' : get(row, 'type').toLowerCase().replace(/\s+/g, '_');
    if (kind === 'ledger' && rec.type && !TXN_TYPES.includes(rec.type)) errors.push(`Type "${get(row, 'type')}" isn't one of: ${TXN_TYPES.join(', ')}.`);

    const ent = get(row, 'entity') ? R.entity(get(row, 'entity')) : batchEntity;
    if (!ent) errors.push(get(row, 'entity') ? `Entity "${get(row, 'entity')}" isn't in the entity list.` : 'No entity on the row and none chosen for the file.');
    rec.entity_id = ent?.id || null;

    if (ent && get(row, 'account')) {
      const acct = R.account(ent.id, get(row, 'account'));
      if (!acct) errors.push(`Account "${get(row, 'account')}" isn't in ${ent.name}'s chart of accounts.`);
      rec.account_id = acct?.id || null;
      rec.account_subtype = acct?.subtype || null;
    }
    if (get(row, 'bank_account')) {
      const b = R.bank(get(row, 'bank_account'));
      if (!b) errors.push(`Bank account "${get(row, 'bank_account')}" isn't set up.`);
      else if (ent && b.entity_id !== ent.id) errors.push(`Bank account ${b.name} belongs to ${b.entity_id}, not ${ent.id}.`);
      rec.bank_account_id = b?.id || null;
    }
    if (get(row, 'project')) {
      const p = R.project(get(row, 'project'));
      if (!p) errors.push(`Project "${get(row, 'project')}" isn't in the project dictionary. A vendor is not a project.`);
      else if (ent && p.entity_id !== ent.id) warnings.push({ code: 'wrong_entity', text: `Project ${p.id} belongs to ${p.entity_id}, but this row is booked to ${ent.id}.` });
      rec.project_id = p?.id || null;
    }
    const vendorName = get(row, 'vendor');
    if (vendorName) {
      const v = R.vendor(vendorName);
      rec.vendor_name = vendorName;
      rec.vendor_id = v?.id || null;
      if (!v) warnings.push({ code: 'new_vendor', text: `Vendor "${vendorName}" isn't in the vendor list yet. It will be added for tracking.` });
    }
    if (get(row, 'counterparty_entity')) {
      const c = R.entity(get(row, 'counterparty_entity'));
      if (!c) errors.push(`Counterparty entity "${get(row, 'counterparty_entity')}" isn't in the entity list.`);
      rec.counterparty_entity_id = c?.id || null;
    }
    rec.customer = get(row, 'customer') || null;
    rec.category = get(row, 'category').toLowerCase() || null;
    rec.ref = get(row, 'ref') || null;
    rec.invoice_no = get(row, 'invoice_no') || null;
    rec.due_date = toISODate(get(row, 'due_date'));
    if (get(row, 'due_date') && !rec.due_date) errors.push(`Due date "${get(row, 'due_date')}" isn't a valid date.`);
    rec.memo = get(row, 'memo') || null;
    const receipt = get(row, 'receipt');
    rec.has_receipt = !!receipt && !/^(n|no|none|missing|-)$/i.test(receipt);
    rec.receipt_ref = rec.has_receipt ? receipt : null;
    rec.approved_by = get(row, 'approved_by') || null;
    rec.paid = /^(paid|closed|yes|y|1)$/i.test(get(row, 'paid')) ? 1 : 0;
    return { ...rec, errors, warnings };
  });
}

function flagDuplicates(db, kind, rows) {
  if (kind === 'bank_statement') return;
  const seen = new Map();
  for (const r of rows) {
    if (!r.invoice_no || !r.vendor_name || !['bill', 'invoice'].includes(r.type)) continue;
    const key = `${r.vendor_name.toLowerCase()}|${normInvoice(r.invoice_no)}`;
    if (seen.has(key)) {
      const first = seen.get(key);
      const text = `Possible duplicate of line ${first.line} (${r.vendor_name} ${first.invoice_no}, ${fmt(first.amount_cents)}).`;
      r.warnings.push({ code: 'duplicate_invoice', text, other_line: first.line });
    } else seen.set(key, r);
    // Also compare with invoices already in the books.
    const prior = db.all(`SELECT t.id, t.invoice_no, t.amount_cents, t.source_row, t.document_id FROM transactions t
       JOIN vendors v ON v.id = t.vendor_id WHERE lower(v.name) = lower(?) AND t.type IN ('bill','invoice')`, r.vendor_name)
      .filter(t => normInvoice(t.invoice_no) === normInvoice(r.invoice_no));
    for (const t of prior) {
      r.warnings.push({ code: 'duplicate_invoice', text: `Possible duplicate of ${t.id} already in the books (${t.invoice_no}, ${fmt(t.amount_cents)}).`, other_txn: t.id });
    }
  }
}

function summarize(kind, rows, ctx) {
  const blocking = [];
  const total = rows.reduce((s, r) => s + (r.amount_cents || 0), 0);
  const dates = rows.map(r => r.date).filter(Boolean).sort();
  if (!rows.length) blocking.push('The file has no data rows.');
  if (ctx.expectedRows != null && ctx.expectedRows !== rows.length) {
    blocking.push(`Expected ${ctx.expectedRows} rows from the source report but found ${rows.length}. The export may be incomplete.`);
  }
  if (ctx.controlTotalCents != null && ctx.controlTotalCents !== total) {
    blocking.push(`File total ${fmt(total)} doesn't match the control total ${fmt(ctx.controlTotalCents)} (difference ${fmt(total - ctx.controlTotalCents)}).`);
  }
  if (kind === 'bank_statement') {
    const st = ctx.statement || {};
    if (st.opening_cents == null || st.closing_cents == null) blocking.push('Enter the statement opening and closing balances.');
    else if (st.opening_cents + total !== st.closing_cents) {
      blocking.push(`Opening ${fmt(st.opening_cents)} + activity ${fmt(total)} = ${fmt(st.opening_cents + total)}, but the statement closing balance is ${fmt(st.closing_cents)}. Pages or rows may be missing.`);
    }
    if (!ctx.bankAccountId) blocking.push('Choose the bank account this statement belongs to.');
    let running = st.opening_cents;
    for (const r of rows) {
      if (running == null || r.amount_cents == null) break;
      running += r.amount_cents;
      if (r.balance_cents != null && r.balance_cents !== running) {
        r.errors.push(`Running balance ${fmt(r.balance_cents)} doesn't match the calculated ${fmt(running)}.`);
      }
    }
  }
  const errorRows = rows.filter(r => r.errors.length).length;
  if (errorRows) blocking.push(`${errorRows} row(s) have errors. Fix the mapping or the export and try again.`);
  const warningCount = rows.reduce((s, r) => s + r.warnings.length, 0);
  return {
    row_count: rows.length, total_cents: total, date_min: dates[0] || null, date_max: dates[dates.length - 1] || null,
    error_rows: errorRows, warning_count: warningCount,
    duplicate_count: rows.filter(r => r.warnings.some(w => w.code === 'duplicate_invoice')).length,
    wrong_entity_count: rows.filter(r => r.warnings.some(w => w.code === 'wrong_entity')).length,
    blocking, can_commit: blocking.length === 0 && !rows.some(r => r.errors.length),
  };
}

/**
 * Create or refresh a preview. Nothing is written to staging tables until commit().
 * opts: { kind, filename, buffer, mapping?, entityId?, bankAccountId?, controlTotalCents?, expectedRows?,
 *         statement?: {opening_cents, closing_cents, period_start, period_end}, retrievedAt?, synthetic? }
 */
function preview(db, user, opts) {
  if (!FIELDS[opts.kind]) throw new HttpError(400, `Unknown import type "${opts.kind}".`);
  const hash = sha256(opts.buffer);
  const committed = db.get(`SELECT b.id, b.committed_at FROM import_batches b JOIN source_documents d ON d.id = b.document_id
                            WHERE d.sha256 = ? AND b.status = 'committed'`, hash);
  if (committed) {
    throw new HttpError(409, `This exact file was already imported as ${committed.id} on ${committed.committed_at.slice(0, 10)}. Duplicate imports are rejected.`);
  }
  let parsed;
  try { parsed = parseCSV(opts.buffer.toString('utf8')); } catch (e) { throw new HttpError(400, e.message); }
  if (!parsed.headers.length) throw new HttpError(400, 'The file is empty.');

  const { doc } = storeDocument(db, { filename: opts.filename, buffer: opts.buffer, mime: 'text/csv', kind: opts.kind, userId: user.id, synthetic: opts.synthetic ? 1 : 0 });
  const mapping = opts.mapping && Object.keys(opts.mapping).length ? opts.mapping : suggestMapping(opts.kind, parsed.headers);
  const rows = normalizeRows(db, opts.kind, parsed, mapping, opts);
  flagDuplicates(db, opts.kind, rows);
  const summary = summarize(opts.kind, rows, opts);

  const prior = db.get(`SELECT * FROM import_batches WHERE document_id = ? AND status = 'previewed'`, doc.id);
  const id = prior?.id || newId('IMP');
  const validation = { headers: parsed.headers, rows, summary, statement: opts.statement || null };
  const values = [opts.kind, opts.entityId || null, opts.bankAccountId || null, JSON.stringify(mapping), opts.controlTotalCents ?? null,
    opts.expectedRows ?? null, summary.row_count, summary.total_cents, summary.date_min, summary.date_max, JSON.stringify(validation),
    opts.retrievedAt || nowISO()];
  if (prior) {
    db.run(`UPDATE import_batches SET kind=?, entity_id=?, bank_account_id=?, mapping_json=?, control_total_cents=?, expected_rows=?,
            row_count=?, total_cents=?, date_min=?, date_max=?, validation_json=?, retrieved_at=? WHERE id = ?`, ...values, id);
    if (prior.mapping_json !== JSON.stringify(mapping)) {
      audit(db, user.id, 'import.mapping_changed', 'import_batch', id, { from: JSON.parse(prior.mapping_json || '{}'), to: mapping });
    }
  } else {
    db.run(`INSERT INTO import_batches(kind, entity_id, bank_account_id, mapping_json, control_total_cents, expected_rows, row_count, total_cents,
            date_min, date_max, validation_json, retrieved_at, id, document_id, status, created_by, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'previewed', ?, ?)`, ...values, id, doc.id, user.id, nowISO());
  }
  audit(db, user.id, 'import.preview', 'import_batch', id, { filename: opts.filename, sha256: hash, rows: summary.row_count, total_cents: summary.total_cents, blocking: summary.blocking });
  return { batch_id: id, document_id: doc.id, sha256: hash, mapping, fields: describeFields(opts.kind), ...validation };
}

function describeFields(kind) {
  return Object.entries(FIELDS[kind]).map(([name, d]) => ({ name, required: !!d.required }));
}

/** Commit a previewed batch into staging. Blocked while any validation error remains. */
function commit(db, user, batchId) {
  const b = db.get('SELECT * FROM import_batches WHERE id = ?', batchId);
  if (!b) throw new HttpError(404, 'Import not found.');
  if (b.status !== 'previewed') throw new HttpError(409, `This import is already ${b.status}.`);
  const v = JSON.parse(b.validation_json);
  if (!v.summary.can_commit) throw new HttpError(409, 'This import has blocking problems.', v.summary.blocking);

  db.tx(() => {
    if (b.kind === 'bank_statement') {
      const st = v.statement;
      const stmtId = newId('STM');
      db.run(`INSERT INTO bank_statements(id, bank_account_id, period_start, period_end, opening_cents, closing_cents, document_id, batch_id)
              VALUES (?,?,?,?,?,?,?,?)`, stmtId, b.bank_account_id, st.period_start || v.summary.date_min, st.period_end || v.summary.date_max,
        st.opening_cents, st.closing_cents, b.document_id, b.id);
      for (const r of v.rows) {
        db.run(`INSERT INTO bank_lines(id, statement_id, bank_account_id, date, amount_cents, description, ref, document_id, source_row, batch_id)
                VALUES (?,?,?,?,?,?,?,?,?,?)`, newId('BL'), stmtId, b.bank_account_id, r.date, r.amount_cents, r.description, r.ref, b.document_id, r.line, b.id);
      }
    } else {
      for (const r of v.rows) {
        let vendorId = r.vendor_id;
        if (r.vendor_name && !vendorId) {
          vendorId = db.get('SELECT id FROM vendors WHERE lower(name) = lower(?)', r.vendor_name)?.id;
          if (!vendorId) {
            vendorId = newId('VEN');
            db.run('INSERT INTO vendors(id, name, created_by, created_at) VALUES (?,?,?,?)', vendorId, r.vendor_name, user.id, nowISO());
            audit(db, user.id, 'vendor.added_from_import', 'vendor', vendorId, { name: r.vendor_name, batch: b.id, line: r.line });
          }
        }
        const flags = r.warnings.map(w => w.code);
        if (r.has_receipt) flags.push('receipt_on_file');
        db.run(`INSERT INTO transactions(id, entity_id, account_id, bank_account_id, date, type, amount_cents, vendor_id, customer, project_id,
                category, invoice_no, ref, due_date, paid, memo, counterparty_entity_id, approved_by, document_id, source_row, batch_id, confidence, flags)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          newId('TXN'), r.entity_id, r.account_id || null, r.bank_account_id || null, r.date, r.type, r.amount_cents, vendorId || null, r.customer,
          r.project_id || null, r.category, r.invoice_no, r.ref, r.due_date, r.paid, r.memo, r.counterparty_entity_id || null, r.approved_by,
          b.document_id, r.line, b.id, 1.0, JSON.stringify(flags));
      }
    }
    // "Ready" means imported with no open questions. Duplicates / wrong entity keep it not-ready until resolved.
    const ready = v.rows.every(r => r.warnings.every(w => w.code === 'new_vendor')) ? 1 : 0;
    db.run(`UPDATE import_batches SET status = 'committed', committed_at = ?, ready = ? WHERE id = ?`, nowISO(), ready, b.id);
  });
  audit(db, user.id, 'import.commit', 'import_batch', b.id, { rows: v.summary.row_count, total_cents: v.summary.total_cents });
  return db.get('SELECT * FROM import_batches WHERE id = ?', b.id);
}

function reject(db, user, batchId, reason) {
  const b = db.get('SELECT * FROM import_batches WHERE id = ?', batchId);
  if (!b) throw new HttpError(404, 'Import not found.');
  if (b.status !== 'previewed') throw new HttpError(409, `This import is already ${b.status}.`);
  db.run(`UPDATE import_batches SET status = 'rejected' WHERE id = ?`, batchId);
  audit(db, user.id, 'import.reject', 'import_batch', batchId, { reason: reason || '' });
}

module.exports = { preview, commit, reject, storeDocument, suggestMapping, FIELDS, TXN_TYPES };
