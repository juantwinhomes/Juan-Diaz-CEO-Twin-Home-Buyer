-- One-time correction for a directory import that was dated today.
--
-- The first version of the importer dated the opening snapshot and the
-- milestone completions as today, which made the dashboard read the whole
-- imported back catalogue as work finished this morning: every project showing
-- +100% and counting as "progressed today".
--
-- This moves that imported history back one day. Run it once, only if you
-- imported before the fix. It is safe while the only data in the database is
-- the import itself - if you have already logged real progress today, tell
-- Claude before running it.

-- Milestones: imported completions belong to yesterday, not today.
UPDATE project_milestones
   SET completed_date = (CURRENT_DATE - 1)::text
 WHERE completed_date = CURRENT_DATE::text;

-- Opening snapshots: same.
UPDATE project_snapshots
   SET snapshot_date = (CURRENT_DATE - 1)::text
 WHERE snapshot_date = CURRENT_DATE::text
   AND NOT EXISTS (
     SELECT 1 FROM project_snapshots q
      WHERE q.project_id = project_snapshots.project_id
        AND q.snapshot_date = (CURRENT_DATE - 1)::text
   );

-- Anything left on today's date is a duplicate of the row we just moved.
DELETE FROM project_snapshots WHERE snapshot_date = CURRENT_DATE::text;

-- Check: every row should read 0 for today.
SELECT COUNT(*) FILTER (WHERE snapshot_date = CURRENT_DATE::text)  AS snapshots_dated_today,
       COUNT(*) FILTER (WHERE snapshot_date = (CURRENT_DATE - 1)::text) AS snapshots_dated_yesterday
  FROM project_snapshots;
