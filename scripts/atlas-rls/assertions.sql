-- SYNTHETIC TEST ASSERTIONS for the atlas_occurrences locality-protection
-- migration. Run by scripts/test-atlas-rls.sh as the cluster superuser against
-- the emulated project, AFTER the migration and the curation updates.
--
-- Output is PASS lines and counts only. No coordinate or locality value is
-- ever printed: comparisons happen inside SQL and failures RAISE with counts.

\set ON_ERROR_STOP 1

-- --------------------------------------------------------------------------
-- A. anon / authenticated cannot read the raw table in any form.
-- --------------------------------------------------------------------------
DO $a$
DECLARE
  rn text;
  q text;
BEGIN
  FOREACH rn IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH q IN ARRAY ARRAY[
      'SELECT lat FROM public.atlas_occurrences LIMIT 1',
      'SELECT lng FROM public.atlas_occurrences LIMIT 1',
      'SELECT locality FROM public.atlas_occurrences LIMIT 1',
      'SELECT * FROM public.atlas_occurrences LIMIT 1',
      'SELECT id FROM public.atlas_occurrences LIMIT 1',
      'SELECT count(*) FROM public.atlas_occurrences'
    ] LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', rn);
        EXECUTE q;
        RAISE EXCEPTION 'FAIL[A]: % executed a raw read: %', rn, q;
      EXCEPTION WHEN insufficient_privilege THEN
        NULL;
      END;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'PASS[A]: anon and authenticated are refused every raw read of atlas_occurrences';
END
$a$;

-- --------------------------------------------------------------------------
-- B. The view is readable by anon/authenticated, SELECT only, and exposes no
--    raw or curation column.
-- --------------------------------------------------------------------------
DO $b$
DECLARE
  rn text;
  q text;
  n bigint;
  expected_visible bigint;
BEGIN
  SELECT count(*) INTO expected_visible FROM synthetic_test.expected WHERE NOT hidden;
  FOREACH rn IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I', rn);
    EXECUTE 'SELECT count(*) FROM public.atlas_occurrences_public' INTO n;
    RESET ROLE;
    IF n <> expected_visible THEN
      RAISE EXCEPTION 'FAIL[B]: % view row count % (expected %)', rn, n, expected_visible;
    END IF;

    FOREACH q IN ARRAY ARRAY[
      'INSERT INTO public.atlas_occurrences_public (id) VALUES (gen_random_uuid())',
      'UPDATE public.atlas_occurrences_public SET locality = NULL',
      'DELETE FROM public.atlas_occurrences_public'
    ] LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', rn);
        EXECUTE q;
        RAISE EXCEPTION 'FAIL[B]: % wrote through the view: %', rn, q;
      EXCEPTION WHEN insufficient_privilege OR object_not_in_prerequisite_state OR feature_not_supported THEN
        NULL;
      END;
    END LOOP;

    FOREACH q IN ARRAY ARRAY[
      'SELECT sensitive_location FROM public.atlas_occurrences_public',
      'SELECT locality_release_approved FROM public.atlas_occurrences_public',
      'SELECT public_display_allowed FROM public.atlas_occurrences_public',
      'SELECT name_keys FROM public.atlas_occurrences_public',
      'SELECT protection_cell_deg FROM public.atlas_occurrences_public'
    ] LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', rn);
        EXECUTE q;
        RAISE EXCEPTION 'FAIL[B]: view exposes an internal column: %', q;
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END LOOP;

    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', rn);
      EXECUTE 'SELECT count(*) FROM synthetic_test.expected';
      RAISE EXCEPTION 'FAIL[B]: % can read the test expectations schema', rn;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PASS[B]: view readable (% rows) by anon/authenticated, read-only, no internal columns', expected_visible;
END
$b$;

-- --------------------------------------------------------------------------
-- C. Per-tier precision, cell-centre snapping, fail-closed, locality withheld.
--    Compared as the owner; values never leave SQL.
-- --------------------------------------------------------------------------
DO $c$
DECLARE
  n bigint;
  bad text;
BEGIN
  SELECT string_agg(right(e.id::text, 2) || ':' || coalesce(v.published_precision_reason, 'MISSING'), ', ')
    INTO bad
  FROM synthetic_test.expected e
  LEFT JOIN public.atlas_occurrences_public v ON v.id = e.id
  WHERE NOT e.hidden
    AND (v.id IS NULL
         OR v.published_cell_deg IS DISTINCT FROM e.cell::double precision
         OR v.published_precision_reason IS DISTINCT FROM e.reason
         OR v.locality_withheld IS DISTINCT FROM e.locality_withheld);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL[C1]: tier/reason mismatch for synthetic rows %', bad;
  END IF;

  SELECT count(*) INTO n
  FROM synthetic_test.expected e JOIN public.atlas_occurrences_public v ON v.id = e.id
  WHERE e.hidden;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL[C2]: % rows with public_display_allowed = false are visible', n;
  END IF;

  -- Locality: NULL when withheld, identical to the source otherwise.
  SELECT count(*) INTO n
  FROM public.atlas_occurrences_public v JOIN public.atlas_occurrences o ON o.id = v.id
  WHERE (v.locality_withheld AND v.locality IS NOT NULL)
     OR (NOT v.locality_withheld AND v.locality IS DISTINCT FROM o.locality);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL[C3]: % rows publish locality contrary to the decision', n;
  END IF;

  -- Exact rows are unchanged; generalised rows are the centre of the cell that
  -- contains the raw point, are within half a cell of it, and differ from it.
  SELECT count(*) INTO n
  FROM public.atlas_occurrences_public v JOIN public.atlas_occurrences o ON o.id = v.id
  WHERE v.published_cell_deg = 0 AND (v.lat <> o.lat OR v.lng <> o.lng);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL[C4]: % exact rows were altered', n;
  END IF;

  SELECT count(*) INTO n
  FROM public.atlas_occurrences_public v JOIN public.atlas_occurrences o ON o.id = v.id
  WHERE v.published_cell_deg > 0
    AND (
      abs(v.lat - (floor(o.lat / v.published_cell_deg) + 0.5) * v.published_cell_deg) > 1e-6
      OR abs(v.lng - (floor(o.lng / v.published_cell_deg) + 0.5) * v.published_cell_deg) > 1e-6
      OR abs(v.lat - o.lat) > v.published_cell_deg / 2 + 1e-6
      OR abs(v.lng - o.lng) > v.published_cell_deg / 2 + 1e-6
      OR (v.lat = o.lat AND v.lng = o.lng)
    );
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL[C5]: % generalised rows are not the containing cell centre', n;
  END IF;

  -- Unresolved rows fail closed.
  SELECT count(*) INTO n
  FROM public.atlas_occurrences_public v
  WHERE v.id = '10000000-0000-4000-8000-000000000006'
    AND NOT v.assessment_resolved AND v.published_cell_deg >= 0.05 AND v.locality IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL[C6]: unresolved synthetic taxon did not fail closed';
  END IF;

  -- Duplicate assessments never duplicate occurrences.
  SELECT count(*) - count(DISTINCT id) INTO n FROM public.atlas_occurrences_public;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL[C7]: the view duplicates % occurrences', n;
  END IF;

  RAISE NOTICE 'PASS[C]: tiers, fail-closed floor, CITES floor, curation, cell centres, locality withholding';
END
$c$;

-- --------------------------------------------------------------------------
-- D. service_role and the owner keep raw access.
-- --------------------------------------------------------------------------
DO $d$
DECLARE
  n bigint;
  total bigint;
BEGIN
  SELECT count(*) INTO total FROM public.atlas_occurrences;

  SET LOCAL ROLE service_role;
  SELECT count(*) INTO n FROM public.atlas_occurrences WHERE lat IS NOT NULL AND lng IS NOT NULL AND locality IS NOT NULL;
  RESET ROLE;
  IF n <> total THEN
    RAISE EXCEPTION 'FAIL[D]: service_role sees % of % raw rows', n, total;
  END IF;

  SET LOCAL ROLE atlas_owner;
  SELECT count(*) INTO n FROM public.atlas_occurrences WHERE lat IS NOT NULL AND lng IS NOT NULL AND locality IS NOT NULL;
  RESET ROLE;
  IF n <> total THEN
    RAISE EXCEPTION 'FAIL[D]: owner sees % of % raw rows', n, total;
  END IF;

  RAISE NOTICE 'PASS[D]: service_role and owner read all % raw rows', total;
END
$d$;
