-- Kristine AI Controller Academy schema.
-- Money is integer cents. Dates are 'YYYY-MM-DD'. Timestamps are ISO-8601 UTC.
-- Entity IDs (ENT-...) and project IDs (PRJ-...) are separate namespaces.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  roles TEXT NOT NULL,            -- comma list: learner,preparer,reviewer,executive,admin
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  ledger TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  synthetic INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  number TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  subtype TEXT,
  UNIQUE (entity_id, number)
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bank','card','loan')),
  last4 TEXT,
  gl_account_id TEXT REFERENCES accounts(id),
  opening_date TEXT,               -- ledger balance is tracked from the day after this date
  opening_balance_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  name TEXT NOT NULL,
  address TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('flip','plumbing_job','rental','other')),
  acquisition_date TEXT,
  sale_date TEXT,
  lender TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  expected_sale_cents INTEGER,
  contract_value_cents INTEGER,
  synthetic INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  UNIQUE (project_id, category)
);

-- Signed contracts / POs not yet billed.
CREATE TABLE IF NOT EXISTS commitments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  vendor_id TEXT REFERENCES vendors(id),
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  billed_cents INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  document_id TEXT REFERENCES source_documents(id)
);

-- Forecast-to-complete estimates (always labelled estimates).
CREATE TABLE IF NOT EXISTS forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  assumption TEXT NOT NULL,
  estimated_by TEXT,
  estimated_at TEXT
);

-- Explicit cash-forecast assumptions (recurring or one-time). Always estimates.
CREATE TABLE IF NOT EXISTS cash_assumptions (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,   -- positive = cash in, negative = cash out
  frequency TEXT NOT NULL CHECK (frequency IN ('once','weekly','biweekly','monthly')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  assumption TEXT NOT NULL,
  owner TEXT
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  bank_last4 TEXT,
  bank_changed_at TEXT,
  bank_change_verified_by TEXT,
  created_by TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  mime TEXT,
  size INTEGER,
  stored_path TEXT NOT NULL,
  kind TEXT,
  pages INTEGER,
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL,
  synthetic INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES source_documents(id),
  kind TEXT NOT NULL CHECK (kind IN ('ledger','ap_bills','bank_statement')),
  entity_id TEXT REFERENCES entities(id),
  bank_account_id TEXT REFERENCES bank_accounts(id),
  mapping_json TEXT,
  control_total_cents INTEGER,
  expected_rows INTEGER,
  row_count INTEGER,
  total_cents INTEGER,
  date_min TEXT,
  date_max TEXT,
  validation_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('previewed','committed','rejected')),
  ready INTEGER NOT NULL DEFAULT 0,
  retrieved_at TEXT,             -- when the export was pulled from the source system
  created_by TEXT,
  created_at TEXT NOT NULL,
  committed_at TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  account_id TEXT REFERENCES accounts(id),
  bank_account_id TEXT REFERENCES bank_accounts(id),
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bill','bill_payment','expense','deposit','check','journal','transfer','invoice','invoice_payment','draw')),
  amount_cents INTEGER NOT NULL,   -- positive = money in to bank / increase of the bill; see type
  vendor_id TEXT REFERENCES vendors(id),
  customer TEXT,
  project_id TEXT REFERENCES projects(id),
  category TEXT,                   -- project cost category
  invoice_no TEXT,
  ref TEXT,                        -- check number / reference
  due_date TEXT,
  paid INTEGER NOT NULL DEFAULT 0,
  memo TEXT,
  counterparty_entity_id TEXT REFERENCES entities(id),
  receipt_document_id TEXT REFERENCES source_documents(id),
  approved_by TEXT,
  document_id TEXT REFERENCES source_documents(id),
  source_row INTEGER,
  batch_id TEXT REFERENCES import_batches(id),
  confidence REAL,
  flags TEXT
);

CREATE TABLE IF NOT EXISTS bank_statements (
  id TEXT PRIMARY KEY,
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  opening_cents INTEGER NOT NULL,
  closing_cents INTEGER NOT NULL,
  document_id TEXT REFERENCES source_documents(id),
  batch_id TEXT REFERENCES import_batches(id)
);

CREATE TABLE IF NOT EXISTS bank_lines (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES bank_statements(id),
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,   -- positive = deposit, negative = withdrawal
  description TEXT,
  ref TEXT,
  document_id TEXT REFERENCES source_documents(id),
  source_row INTEGER,
  batch_id TEXT REFERENCES import_batches(id)
);

-- Human explanations for unmatched reconciliation items.
CREATE TABLE IF NOT EXISTS recon_explanations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  statement_id TEXT NOT NULL REFERENCES bank_statements(id),
  item_key TEXT NOT NULL,          -- 'bank:<id>' or 'ledger:<id>'
  explanation TEXT NOT NULL,
  treatment TEXT NOT NULL CHECK (treatment IN ('outstanding','needs_entry','error_to_fix')),
  explained_by TEXT NOT NULL,
  explained_at TEXT NOT NULL,
  UNIQUE (statement_id, item_key)
);

CREATE TABLE IF NOT EXISTS reconciliations (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL UNIQUE REFERENCES bank_statements(id),
  status TEXT NOT NULL CHECK (status IN ('draft','prepared','reviewed')),
  result_json TEXT,
  prepared_by TEXT,
  prepared_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  project_id TEXT REFERENCES projects(id),
  lender TEXT NOT NULL,
  commitment_cents INTEGER NOT NULL,
  opening_balance_cents INTEGER NOT NULL,
  lender_statement_balance_cents INTEGER,
  lender_statement_date TEXT,
  rate_bps INTEGER,
  maturity TEXT
);

CREATE TABLE IF NOT EXISTS draws (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL REFERENCES loans(id),
  project_id TEXT REFERENCES projects(id),
  number INTEGER NOT NULL,
  submitted_date TEXT,
  submitted_cents INTEGER NOT NULL,
  approved_cents INTEGER,
  holdback_cents INTEGER NOT NULL DEFAULT 0,
  funded_cents INTEGER,
  funded_date TEXT,
  expected_date TEXT,
  document_id TEXT REFERENCES source_documents(id)
);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  rule_key TEXT UNIQUE,            -- deterministic key so re-running rules doesn't duplicate
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high','medium','low')),
  title TEXT NOT NULL,
  entity_id TEXT REFERENCES entities(id),
  project_id TEXT REFERENCES projects(id),
  amount_cents INTEGER,
  evidence_json TEXT NOT NULL,     -- [{label, ref:{kind,id,row}}]
  suggested_step TEXT,
  lesson_id TEXT,
  assignee_id TEXT REFERENCES users(id),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting_on_owner','escalated','resolved')),
  ai_hypothesis TEXT,
  human_conclusion TEXT,
  disposition_by TEXT,
  disposition_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS close_periods (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  period TEXT NOT NULL,            -- 'YYYY-MM'
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  signed_off_by TEXT,
  signed_off_at TEXT,
  UNIQUE (entity_id, period)
);

CREATE TABLE IF NOT EXISTS close_tasks (
  id TEXT PRIMARY KEY,
  close_id TEXT NOT NULL REFERENCES close_periods(id),
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  sort INTEGER NOT NULL,
  evidence TEXT,
  prepared_by TEXT,
  prepared_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  vendor_id TEXT REFERENCES vendors(id),
  bill_id TEXT REFERENCES transactions(id),
  amount_cents INTEGER NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected'))
);

-- Proposed journal entries. The app never posts to the ledger.
CREATE TABLE IF NOT EXISTS journal_proposals (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  date TEXT NOT NULL,
  memo TEXT NOT NULL,
  lines_json TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  source_ref TEXT,
  prepared_by TEXT NOT NULL,
  prepared_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected'))
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL CHECK (object_type IN ('payment','journal_entry','close','vendor_bank_change','module_signoff','report')),
  object_id TEXT NOT NULL,
  requested_by TEXT,
  approver_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  note TEXT,
  decided_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  decision TEXT,
  decided_by TEXT,
  decided_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','decided'))
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  module_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('quiz','scenario')),
  reasoning TEXT,
  confidence TEXT,
  answer_json TEXT,
  score INTEGER,
  max_score INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  module_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence TEXT,
  submitted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id TEXT NOT NULL,
  learner_id TEXT NOT NULL REFERENCES users(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  rubric_json TEXT,
  passed INTEGER NOT NULL,
  note TEXT,
  signed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mistakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  module_id TEXT,
  description TEXT NOT NULL,
  corrected_procedure TEXT,
  source TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_versions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  scope TEXT,
  content_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  object_type TEXT,
  object_id TEXT,
  detail_json TEXT
);

CREATE INDEX IF NOT EXISTS ix_txn_entity ON transactions(entity_id, date);
CREATE INDEX IF NOT EXISTS ix_txn_project ON transactions(project_id);
CREATE INDEX IF NOT EXISTS ix_issue_status ON issues(status, severity);
CREATE INDEX IF NOT EXISTS ix_audit_at ON audit_events(at);
