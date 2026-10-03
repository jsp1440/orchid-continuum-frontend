-- =============================================================================
-- OWNER-APPLIED ROLLBACK. NOT APPLIED BY ANY AGENT OR CI JOB.
-- =============================================================================
--
-- Reverses 20260930_atlas_occurrences_locality_protection.sql by restoring the
-- grant and policy the live table had before it (as recorded in
-- docs/atlas-next/proposed/20260818_atlas_occurrences_locality_protection.sql):
--
--     CREATE POLICY "atlas_occurrences_public_read"
--       ON public.atlas_occurrences FOR SELECT TO anon, authenticated USING (true);
--     + table-level SELECT for anon and authenticated
--
-- WARNING: this RE-OPENS raw lat / lng / locality to every holder of the public
-- anon key. Use it only to restore service, and set the frontend flag
-- VITE_ATLAS_OCCURRENCE_SOURCE back to `auto` (or unset it) BEFORE running it,
-- otherwise a `view`-pinned Atlas shows no records once the view is gone.
--
-- Not reversed, on purpose: the four curation columns added in step 1
-- (public_display_allowed, sensitive_location, sensitivity_source,
-- locality_release_approved). They are additive, inert without the view, and
-- may already hold human curation decisions; dropping them would destroy that
-- work. A destructive drop is left commented at the end for the owner alone.
--
-- IDEMPOTENT: safe to re-run.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  IF to_regclass('public.atlas_occurrences') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.atlas_occurrences does not exist';
  END IF;
END
$pre$;

GRANT SELECT ON public.atlas_occurrences TO anon, authenticated;

DROP POLICY IF EXISTS "atlas_occurrences_public_read" ON public.atlas_occurrences;
CREATE POLICY "atlas_occurrences_public_read"
  ON public.atlas_occurrences FOR SELECT TO anon, authenticated USING (true);

DROP VIEW IF EXISTS public.atlas_occurrences_public;

DO $post$
BEGIN
  IF NOT has_table_privilege('anon', 'public.atlas_occurrences', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.atlas_occurrences', 'SELECT') THEN
    RAISE EXCEPTION 'postcondition: previous SELECT grant was not restored';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'atlas_occurrences'
      AND policyname = 'atlas_occurrences_public_read'
  ) THEN
    RAISE EXCEPTION 'postcondition: atlas_occurrences_public_read policy was not restored';
  END IF;
  IF to_regclass('public.atlas_occurrences_public') IS NOT NULL THEN
    RAISE EXCEPTION 'postcondition: atlas_occurrences_public still exists';
  END IF;
END
$post$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- -----------------------------------------------------------------------------
-- OPTIONAL, DESTRUCTIVE, OWNER ONLY — drops curation data. Not part of rollback.
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.atlas_occurrences
--   DROP COLUMN IF EXISTS locality_release_approved,
--   DROP COLUMN IF EXISTS sensitivity_source,
--   DROP COLUMN IF EXISTS sensitive_location,
--   DROP COLUMN IF EXISTS public_display_allowed;
