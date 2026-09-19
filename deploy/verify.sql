-- Health check for the KPI dashboard database.
-- Paste into Supabase SQL Editor and Run. Every row should say OK.

SELECT 'tables' AS check,
       COUNT(*)::text || ' of 13' AS found,
       CASE WHEN COUNT(*) = 13 THEN 'OK' ELSE 'MISSING TABLES' END AS status
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('users','projects','project_snapshots','project_milestones',
                      'progress_logs','commitments','blockers','deployments',
                      'production_systems','incidents','business_impact',
                      'daily_kpi_snapshots','settings')

UNION ALL
SELECT 'indexes',
       COUNT(*)::text || ' of 12',
       CASE WHEN COUNT(*) >= 12 THEN 'OK' ELSE 'SOME INDEXES MISSING' END
  FROM pg_indexes
 WHERE schemaname = 'public' AND indexname LIKE 'idx_%'

UNION ALL
SELECT 'end-of-day snapshot index',
       COALESCE(MAX(indexname), 'not found'),
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'MISSING - closing a day will fail' END
  FROM pg_indexes
 WHERE schemaname = 'public' AND indexname = 'idx_kpi_snap_unique'

UNION ALL
SELECT 'settings seeded',
       COUNT(*)::text || ' rows',
       CASE WHEN COUNT(*) >= 10 THEN 'OK' ELSE 'app has not started yet' END
  FROM settings

UNION ALL SELECT 'people',   COUNT(*)::text || ' rows', CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'empty - run import.sql' END FROM users
UNION ALL SELECT 'projects', COUNT(*)::text || ' rows', CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'empty - run import.sql' END FROM projects
UNION ALL SELECT 'milestones', COUNT(*)::text || ' rows', CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'empty - run import.sql' END FROM project_milestones

UNION ALL
SELECT 'columns added after the first release',
       COUNT(*)::text || ' of 3',
       CASE WHEN COUNT(*) = 3 THEN 'OK' ELSE 'deploy the latest code - the app adds these when it starts' END
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'projects'      AND column_name = 'project_type')
     OR (table_name = 'projects'      AND column_name = 'pct_from_commitments')
     OR (table_name = 'progress_logs' AND column_name = 'commitment_id'))

UNION ALL
SELECT 'row level security',
       COUNT(*) FILTER (WHERE rowsecurity)::text || ' of ' || COUNT(*)::text || ' tables protected',
       CASE WHEN COUNT(*) FILTER (WHERE NOT rowsecurity) = 0 THEN 'OK'
            ELSE 'tables readable via the public API key' END
  FROM pg_tables WHERE schemaname = 'public';
