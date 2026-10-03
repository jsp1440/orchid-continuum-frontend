-- =============================================================================
-- OWNER-RUN VERIFICATION for 20260930_atlas_occurrences_locality_protection.sql
-- =============================================================================
--
-- Read-only. Prints privileges, booleans and COUNTS only — never a coordinate,
-- a locality string or a record identifier. Every check RAISEs on failure, so
-- run it with `psql -v ON_ERROR_STOP=1 -f ...`; a clean exit means every check
-- passed. The whole file runs inside a transaction that is rolled back.
--
-- Run as the role that applied the migration (the table / view owner).
-- =============================================================================

BEGIN READ ONLY;

\echo '== privilege matrix (expected: raw_* false for anon/authenticated; view_select true; view_write false) =='
SELECT
  r AS role,
  has_table_privilege(r, 'public.atlas_occurrences', 'SELECT') AS raw_table_select,
  has_column_privilege(r, 'public.atlas_occurrences', 'lat', 'SELECT') AS raw_lat_select,
  has_column_privilege(r, 'public.atlas_occurrences', 'lng', 'SELECT') AS raw_lng_select,
  has_column_privilege(r, 'public.atlas_occurrences', 'locality', 'SELECT') AS raw_locality_select,
  has_table_privilege(r, 'public.atlas_occurrences_public', 'SELECT') AS view_select,
  has_table_privilege(r, 'public.atlas_occurrences_public', 'INSERT, UPDATE, DELETE, TRUNCATE') AS view_write
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r
ORDER BY r;

\echo '== view options (expected: security_barrier=true, security_invoker=false) =='
SELECT
  coalesce('security_barrier=true' = ANY (c.reloptions), false) AS security_barrier,
  coalesce('security_invoker=true' = ANY (c.reloptions), false) AS security_invoker
FROM pg_class c
WHERE c.oid = 'public.atlas_occurrences_public'::regclass;

\echo '== published precision by reason (counts only) =='
SELECT published_precision_reason, count(*) AS rows, bool_and(locality IS NULL) AS locality_all_withheld
FROM public.atlas_occurrences_public
GROUP BY published_precision_reason
ORDER BY published_precision_reason;

\echo '== row accounting (counts only) =='
SELECT
  (SELECT count(*) FROM public.atlas_occurrences) AS base_rows,
  (SELECT count(*) FROM public.atlas_occurrences WHERE public_display_allowed IS NOT FALSE) AS displayable_rows,
  (SELECT count(*) FROM public.atlas_occurrences_public) AS view_rows;

DO $checks$
DECLARE
  rn text;
  n bigint;
  opts text[];
BEGIN
  -- 1. Privileges.
  FOREACH rn IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(rn, 'public.atlas_occurrences', 'SELECT')
       OR has_column_privilege(rn, 'public.atlas_occurrences', 'lat', 'SELECT')
       OR has_column_privilege(rn, 'public.atlas_occurrences', 'lng', 'SELECT')
       OR has_column_privilege(rn, 'public.atlas_occurrences', 'locality', 'SELECT') THEN
      RAISE EXCEPTION 'FAIL: % can read raw coordinates or locality', rn;
    END IF;
    IF NOT has_table_privilege(rn, 'public.atlas_occurrences_public', 'SELECT') THEN
      RAISE EXCEPTION 'FAIL: % cannot read the public view', rn;
    END IF;
    IF has_table_privilege(rn, 'public.atlas_occurrences_public', 'INSERT, UPDATE, DELETE, TRUNCATE') THEN
      RAISE EXCEPTION 'FAIL: % can write through the public view', rn;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.atlas_occurrences', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: service_role lost raw SELECT';
  END IF;

  -- 2. View options.
  SELECT reloptions INTO opts FROM pg_class WHERE oid = 'public.atlas_occurrences_public'::regclass;
  IF NOT coalesce('security_barrier=true' = ANY (opts), false) THEN
    RAISE EXCEPTION 'FAIL: view is not a security barrier';
  END IF;
  IF coalesce('security_invoker=true' = ANY (opts), false) THEN
    RAISE EXCEPTION 'FAIL: view is security_invoker; anon would need raw grants';
  END IF;

  -- 3. Row accounting: the view hides only rows curated as not displayable.
  SELECT (SELECT count(*) FROM public.atlas_occurrences WHERE public_display_allowed IS NOT FALSE)
       - (SELECT count(*) FROM public.atlas_occurrences_public) INTO n;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: view row count differs from displayable rows by %', n;
  END IF;

  -- 4. Locality withheld whenever protection applied.
  SELECT count(*) INTO n FROM public.atlas_occurrences_public
  WHERE locality_withheld AND locality IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: % protected rows still publish locality text', n;
  END IF;

  -- 5. Tier floors hold.
  SELECT count(*) INTO n FROM public.atlas_occurrences_public
  WHERE (published_precision_reason = 'unresolved-assessment' AND published_cell_deg < 0.05)
     OR (published_precision_reason = 'cites-appendix-i' AND published_cell_deg < 0.1)
     OR (published_precision_reason = 'threatened' AND published_cell_deg < 0.25)
     OR (published_precision_reason = 'curated-sensitive' AND published_cell_deg < 1.0)
     OR (published_precision_reason NOT IN ('exact', 'curated-release') AND published_cell_deg <= 0);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: % rows published finer than their tier floor', n;
  END IF;

  -- 6. Unresolved rows never publish exact coordinates unless a human decided.
  SELECT count(*) INTO n
  FROM public.atlas_occurrences_public v
  JOIN public.atlas_occurrences o ON o.id = v.id
  WHERE NOT v.assessment_resolved AND v.published_cell_deg = 0
    AND o.sensitive_location IS NULL AND NOT o.locality_release_approved;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: % unresolved rows published without generalisation', n;
  END IF;

  -- 7. Every generalised coordinate lies in the cell that contains the raw
  --    coordinate and is that cell's centre (compared, never printed).
  SELECT count(*) INTO n
  FROM public.atlas_occurrences_public v
  JOIN public.atlas_occurrences o ON o.id = v.id
  WHERE v.published_cell_deg > 0 AND o.lat IS NOT NULL AND o.lng IS NOT NULL
    AND (
      abs(v.lat - LEAST(90, GREATEST(-90, (floor(o.lat::double precision / v.published_cell_deg) + 0.5) * v.published_cell_deg))) > 1e-6
      OR abs(
           v.lng
           - (((floor(o.lng::double precision / v.published_cell_deg) + 0.5) * v.published_cell_deg)
              - 360 * floor((((floor(o.lng::double precision / v.published_cell_deg) + 0.5) * v.published_cell_deg) + 180) / 360))
         ) > 1e-6
    );
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: % generalised rows are not their cell centre', n;
  END IF;

  -- 8. When this session may act as anon, prove the raw table refuses it.
  IF pg_has_role(current_user, 'anon', 'MEMBER') THEN
    BEGIN
      SET LOCAL ROLE anon;
      PERFORM 1 FROM public.atlas_occurrences LIMIT 1;
      RAISE EXCEPTION 'FAIL: anon read the raw table';
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
    RESET ROLE;
    RAISE NOTICE 'PASS: anon is refused on the raw table';
  ELSE
    RAISE NOTICE 'SKIP: % is not a member of anon; check 8 runs via REST in the runbook', current_user;
  END IF;

  RAISE NOTICE 'PASS: all locality-protection checks';
END
$checks$;

ROLLBACK;
