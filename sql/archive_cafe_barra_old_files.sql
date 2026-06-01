-- CAFE BARRA BULK ARCHIVE — Phase 78D
-- Archives all input_files for Cafe Barra uploaded more than 10 days ago.
-- Does NOT touch storage.objects, storage blobs, or input rows.
-- Safe to re-run: uses WHERE archived_at IS NULL to avoid re-archiving.
--
-- Parameters:
--   archive_reason = 'older_than_10_days'
--   archive_source = 'phase_78d_cafe_barra_cleanup'
--   cutoff         = CURRENT_TIMESTAMP - INTERVAL '10 days'

BEGIN;

-- ─── Preview: what will be archived ──────────────────────────────────────────
DO $$
DECLARE
  n_total    INTEGER;
  n_to_archive INTEGER;
  n_remaining  INTEGER;
  cutoff       TIMESTAMPTZ := CURRENT_TIMESTAMP - INTERVAL '10 days';
BEGIN
  SELECT COUNT(*) INTO n_total
  FROM public.input_files f
  JOIN public.inputs i ON i.id = f.input_id
  WHERE i.company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';

  SELECT COUNT(*) INTO n_to_archive
  FROM public.input_files f
  JOIN public.inputs i ON i.id = f.input_id
  WHERE i.company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND f.uploaded_at < cutoff
    AND f.archived_at IS NULL;

  n_remaining := n_total - n_to_archive;

  RAISE NOTICE 'Cafe Barra bulk archive — cutoff: %', cutoff;
  RAISE NOTICE '  Total files (all): %', n_total;
  RAISE NOTICE '  Files to archive (> 10 days old, not yet archived): %', n_to_archive;
  RAISE NOTICE '  Files remaining active: %', n_remaining;
END $$;

-- ─── Execute: archive old files ───────────────────────────────────────────────
-- destructive-ok: sets archived_at only — no rows deleted, no blobs touched
UPDATE public.input_files f
SET
  archived_at    = CURRENT_TIMESTAMP,
  archive_reason = 'older_than_10_days',
  archive_source = 'phase_78d_cafe_barra_cleanup'
FROM public.inputs i
WHERE i.id = f.input_id
  AND i.company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
  AND f.uploaded_at < (CURRENT_TIMESTAMP - INTERVAL '10 days')
  AND f.archived_at IS NULL;

-- ─── Report results ───────────────────────────────────────────────────────────
DO $$
DECLARE
  n_archived   INTEGER;
  n_active     INTEGER;
  oldest_active TIMESTAMPTZ;
  newest_archived TIMESTAMPTZ;
  oldest_active_name TEXT;
  newest_archived_name TEXT;
BEGIN
  SELECT COUNT(*) INTO n_archived
  FROM public.input_files f
  JOIN public.inputs i ON i.id = f.input_id
  WHERE i.company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND f.archived_at IS NOT NULL;

  SELECT COUNT(*) INTO n_active
  FROM public.input_files f
  JOIN public.inputs i ON i.id = f.input_id
  WHERE i.company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND f.archived_at IS NULL;

  SELECT f.uploaded_at, f.file_name INTO oldest_active, oldest_active_name
  FROM public.input_files f
  JOIN public.inputs i ON i.id = f.input_id
  WHERE i.company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND f.archived_at IS NULL
  ORDER BY f.uploaded_at ASC
  LIMIT 1;

  SELECT f.uploaded_at, f.file_name INTO newest_archived, newest_archived_name
  FROM public.input_files f
  JOIN public.inputs i ON i.id = f.input_id
  WHERE i.company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND f.archived_at IS NOT NULL
    AND f.archive_source = 'phase_78d_cafe_barra_cleanup'
  ORDER BY f.uploaded_at DESC
  LIMIT 1;

  RAISE NOTICE '';
  RAISE NOTICE 'Results after archive:';
  RAISE NOTICE '  Total archived (Cafe Barra): %', n_archived;
  RAISE NOTICE '  Total active (Cafe Barra): %', n_active;
  RAISE NOTICE '  Oldest active file: % — %', oldest_active, oldest_active_name;
  RAISE NOTICE '  Newest archived file: % — %', newest_archived, newest_archived_name;
END $$;

COMMIT;
