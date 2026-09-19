-- =====================================================================
-- AI & Systems Daily KPI Dashboard — relational schema
-- Historical rows are never overwritten; each day is stored separately.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------------ --
-- Users
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS users (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  role               TEXT    NOT NULL DEFAULT 'AI / Systems',
  email              TEXT,
  avatar_url         TEXT,
  initials           TEXT,
  color              TEXT    NOT NULL DEFAULT '#2563eb',
  is_manager         INTEGER NOT NULL DEFAULT 0,
  active             INTEGER NOT NULL DEFAULT 1,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------------ --
-- Projects
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS projects (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  owner_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  secondary_owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requester          TEXT,
  department         TEXT,
  start_date         TEXT,
  target_date        TEXT,
  priority           TEXT    NOT NULL DEFAULT 'P3',
  status             TEXT    NOT NULL DEFAULT 'Backlog',
  completion_pct     REAL    NOT NULL DEFAULT 0,
  current_phase      TEXT,
  next_step          TEXT,
  business_objective TEXT,
  expected_impact    TEXT,
  production_url     TEXT,
  notes              TEXT,
  archived           INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_owner  ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- Daily completion snapshot per project. One row per project per day.
-- This is what makes "Progress Today = today% - yesterday%" automatic.
CREATE TABLE IF NOT EXISTS project_snapshots (
  project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_date      TEXT    NOT NULL,
  completion_pct     REAL    NOT NULL,
  status             TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_psnap_date ON project_snapshots(snapshot_date);

-- Milestone framework (seeded per project, editable)
CREATE TABLE IF NOT EXISTS project_milestones (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name               TEXT    NOT NULL,
  target_pct         REAL    NOT NULL,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  completed          INTEGER NOT NULL DEFAULT 0,
  completed_date     TEXT
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id);

-- ------------------------------------------------------------------ --
-- Daily progress log (one entry per project per person per update)
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS progress_logs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  log_date           TEXT    NOT NULL,
  previous_pct       REAL    NOT NULL DEFAULT 0,
  new_pct            REAL    NOT NULL DEFAULT 0,
  completed_text     TEXT    NOT NULL,
  next_text          TEXT,
  blocker_text       TEXT,
  notes              TEXT,
  milestone_id       INTEGER REFERENCES project_milestones(id) ON DELETE SET NULL,
  counts_as_progress INTEGER NOT NULL DEFAULT 1,
  quality_score      INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_progress_date    ON progress_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_progress_project ON progress_logs(project_id);

-- ------------------------------------------------------------------ --
-- Daily commitments (1-5 concrete deliverables per person per day)
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS commitments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id         INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  commit_date        TEXT    NOT NULL,
  task               TEXT    NOT NULL,
  priority           TEXT    NOT NULL DEFAULT 'P3',
  expected_today     INTEGER NOT NULL DEFAULT 1,
  status             TEXT    NOT NULL DEFAULT 'Not Started',
  carryover_reason   TEXT,
  notes              TEXT,
  quality_score      INTEGER NOT NULL DEFAULT 0,
  completed_at       TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_commit_date ON commitments(commit_date);
CREATE INDEX IF NOT EXISTS idx_commit_user ON commitments(user_id, commit_date);

-- ------------------------------------------------------------------ --
-- Blockers
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS blockers (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  title              TEXT    NOT NULL,
  project_id         INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  owner_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  commitment_id      INTEGER REFERENCES commitments(id) ON DELETE SET NULL,
  date_reported      TEXT    NOT NULL,
  person_needed      TEXT,
  reason             TEXT    NOT NULL DEFAULT 'Other',
  priority           TEXT    NOT NULL DEFAULT 'P3',
  status             TEXT    NOT NULL DEFAULT 'Open',
  resolution         TEXT,
  resolved_date      TEXT,
  notes              TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blockers_status ON blockers(status);

-- ------------------------------------------------------------------ --
-- Deployments / launches
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS deployments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deploy_date        TEXT    NOT NULL,
  kind               TEXT    NOT NULL DEFAULT 'Feature',
  title              TEXT    NOT NULL,
  description        TEXT,
  url                TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deploy_date ON deployments(deploy_date);

-- ------------------------------------------------------------------ --
-- Production systems + incidents
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS production_systems (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  owner_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  project_id         INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  system_type        TEXT    NOT NULL DEFAULT 'Automation',
  status             TEXT    NOT NULL DEFAULT 'Healthy',
  last_checked       TEXT,
  successful_runs    INTEGER NOT NULL DEFAULT 0,
  failed_runs        INTEGER NOT NULL DEFAULT 0,
  last_incident_date TEXT,
  url                TEXT,
  notes              TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incidents (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  title              TEXT    NOT NULL,
  system_id          INTEGER REFERENCES production_systems(id) ON DELETE CASCADE,
  project_id         INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  reported_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category           TEXT    NOT NULL DEFAULT 'Bug',
  severity           TEXT    NOT NULL DEFAULT 'Low',
  status             TEXT    NOT NULL DEFAULT 'Open',
  reported_date      TEXT    NOT NULL,
  resolved_date      TEXT,
  description        TEXT,
  resolution         TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_incidents_date ON incidents(reported_date);

-- ------------------------------------------------------------------ --
-- Business impact (weekly / monthly reporting only)
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS business_impact (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  manual_process     TEXT,
  minutes_per_run    REAL    NOT NULL DEFAULT 0,
  runs_per_week      REAL    NOT NULL DEFAULT 0,
  hourly_cost        REAL    NOT NULL DEFAULT 0,
  revenue_supported  REAL    NOT NULL DEFAULT 0,
  leads_processed    INTEGER NOT NULL DEFAULT 0,
  errors_prevented   INTEGER NOT NULL DEFAULT 0,
  notes              TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------------ --
-- Daily KPI snapshots (historical, never overwritten by later days)
-- user_id NULL == whole-team row for that date
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS daily_kpi_snapshots (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date         TEXT    NOT NULL,
  user_id               INTEGER REFERENCES users(id) ON DELETE CASCADE,
  commitments_total     INTEGER NOT NULL DEFAULT 0,
  commitments_completed INTEGER NOT NULL DEFAULT 0,
  completion_rate       REAL    NOT NULL DEFAULT 0,
  projects_active       INTEGER NOT NULL DEFAULT 0,
  projects_progressed   INTEGER NOT NULL DEFAULT 0,
  avg_progress_pct      REAL    NOT NULL DEFAULT 0,
  deployments           INTEGER NOT NULL DEFAULT 0,
  blockers_open         INTEGER NOT NULL DEFAULT 0,
  blockers_created      INTEGER NOT NULL DEFAULT 0,
  blockers_resolved     INTEGER NOT NULL DEFAULT 0,
  critical_issues       INTEGER NOT NULL DEFAULT 0,
  open_issues           INTEGER NOT NULL DEFAULT 0,
  daily_score           REAL    NOT NULL DEFAULT 0,
  breakdown_json        TEXT,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_snap_unique
  ON daily_kpi_snapshots(snapshot_date, IFNULL(user_id, -1));

-- ------------------------------------------------------------------ --
-- Settings (targets & preferences)
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
