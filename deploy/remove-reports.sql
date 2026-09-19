-- Remove the one-off reports and the guides/handbooks from the dashboard.
--
-- These are finished artefacts rather than work that moves day to day, so they
-- only pad the project list. They remain in the directory spreadsheet.
--
-- Matching is on the directory section the import recorded as the department,
-- so it is unaffected by how dashes were written in the project names.
--
-- Deleting a project also removes its milestones, snapshots, progress entries,
-- blockers and deployments. Nothing else is touched. If you ever want them
-- back, re-running an import that includes those sections restores them.

-- What is about to go (run this on its own first if you want to check):
SELECT name, department, status
  FROM projects
 WHERE department IN ('Report Tracker ONLY', 'Guides and Handbooks')
 ORDER BY department, name;

DELETE FROM projects
 WHERE department IN ('Report Tracker ONLY', 'Guides and Handbooks');

-- Confirm what remains.
SELECT department, COUNT(*) AS projects
  FROM projects
 GROUP BY department
 ORDER BY department;
