-- =============================================================================
-- OWNER-APPLIED MIGRATION. NOT APPLIED BY ANY AGENT OR CI JOB.
-- =============================================================================
--
-- Orchid Continuum · Living Atlas · atlas_occurrences locality protection
--
-- Supersedes the review draft docs/atlas-next/proposed/
-- 20260818_atlas_occurrences_locality_protection.sql. Runbook:
-- docs/atlas-next/APPLY-LOCALITY-PROTECTION.md. Rollback:
-- 20260930_atlas_occurrences_locality_protection_rollback.sql. Verification:
-- 20260930_atlas_occurrences_locality_protection_verify.sql. Local proof:
-- scripts/test-atlas-rls.sh (disposable Postgres 16, synthetic rows only).
--
-- PROBLEM (repository evidence: the draft above and SLICE-2-REPORT.md §11)
--
--   The live table carries
--     CREATE POLICY "atlas_occurrences_public_read"
--       ON public.atlas_occurrences FOR SELECT TO anon, authenticated USING (true);
--   and the anon key ships in the browser bundle, so any caller can read raw
--   lat / lng / locality, including for threatened taxa. Client-side
--   generalisation protects what the Atlas draws, not what the endpoint returns.
--
-- WHAT THIS DOES (one transaction; any failed check aborts everything)
--
--   0. Preconditions: required tables / columns / roles exist, and the role
--      applying this (which becomes the view owner) is not subject to RLS on
--      the base table. Otherwise the view would return zero rows.
--   1. Adds the KO-0029 curation columns (additive; defaults keep behaviour).
--   2. (Re)creates public.atlas_occurrences_public: a security-barrier view
--      that runs with its OWNER's privileges (security_invoker = false) — the
--      only way to publish a coarsened coordinate without granting the caller
--      the raw one. It exposes ONLY generalised lat / lng, withholds free-text
--      locality whenever a protection decision applied, and keeps every other
--      column the Atlas UI selects.
--   3. Revokes anon / authenticated SELECT on the raw table (table-level and
--      the coordinate/locality columns) and drops the USING (true) policy.
--      service_role (BYPASSRLS) and the table owner keep raw access.
--   4. Postconditions: asserts the privilege matrix, then asks PostgREST to
--      reload its schema cache.
--
-- PRECISION POLICY (mirrors src/lib/atlasLocalitySafety.ts and
-- src/features/atlas-next/sensitivity.ts; the larger cell always wins)
--
--   curated sensitive_location = TRUE          1.0 deg   locality withheld
--   IUCN CR                                    1.0 deg   locality withheld
--   IUCN EN                                    0.5 deg   locality withheld
--   IUCN VU                                    0.25 deg  locality withheld
--   CITES Appendix I orchid (list below)       0.1 deg   locality withheld
--   no reachable assessment, not curated       0.05 deg  locality withheld (fail closed)
--   source coordinate_uncertainty_m            0.1-1.0   locality kept (nothing withheld)
--   curated locality_release_approved = TRUE   protection 0 (explicit human decision)
--
--   An assessment is "reachable" when a public.species row carrying an
--   iucn_code or conservation_status matches by species_id or by exact
--   binomial (genus + species, or the first two words of scientific_name /
--   accepted_name). When several rows match, the MOST protective tier wins.
--
--   Generalisation snaps to the grid-cell CENTRE. It never jitters.
--   coordinate_uncertainty_m is published unmodified and never signals
--   withholding.
--
-- IDEMPOTENT: safe to re-run. NON-DESTRUCTIVE: no row is modified or deleted;
-- the only object dropped is this migration's own view (re-created at once).
-- REVERSIBLE: the rollback file restores the previous grant and policy.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- -----------------------------------------------------------------------------
-- 0. Preconditions
-- -----------------------------------------------------------------------------
DO $pre$
DECLARE
  missing text;
  r record;
  can_bypass boolean;
BEGIN
  IF to_regclass('public.atlas_occurrences') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.atlas_occurrences does not exist';
  END IF;
  IF to_regclass('public.species') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.species does not exist';
  END IF;

  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY[
    'id', 'scientific_name', 'accepted_name', 'genus', 'species', 'species_id',
    'lat', 'lng', 'elevation_m', 'country', 'region', 'locality', 'habitat',
    'biome', 'year', 'source_dataset', 'source_record_id', 'media_url',
    'verified', 'coordinate_uncertainty_m', 'pollinator_data',
    'mycorrhizal_data', 'ingested_at'
  ]) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'atlas_occurrences' AND column_name = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'precondition: atlas_occurrences is missing columns: %', missing;
  END IF;

  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY['id', 'genus', 'epithet', 'iucn_code', 'conservation_status']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'species' AND column_name = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'precondition: species is missing columns: %', missing;
  END IF;

  SELECT string_agg(rn, ', ') INTO missing
  FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS rn
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rn);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'precondition: roles missing: %', missing;
  END IF;

  -- The view runs as its owner (the role applying this migration). If that
  -- role is itself subject to RLS on the base table, and no policy grants it
  -- rows, the public view would silently return nothing once step 3 runs.
  SELECT c.relowner, c.relforcerowsecurity, ro.rolsuper, ro.rolbypassrls
    INTO r
  FROM pg_class c, pg_roles ro
  WHERE c.oid = 'public.atlas_occurrences'::regclass AND ro.rolname = current_user;
  can_bypass := r.rolsuper OR r.rolbypassrls
    OR (r.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND NOT r.relforcerowsecurity);
  IF NOT can_bypass THEN
    RAISE EXCEPTION 'precondition: role % would be subject to RLS on atlas_occurrences as view owner; apply as the table owner (without FORCE ROW LEVEL SECURITY) or a BYPASSRLS role', current_user;
  END IF;

  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.species'::regclass)
     AND NOT (r.rolsuper OR r.rolbypassrls
              OR (SELECT relowner FROM pg_class WHERE oid = 'public.species'::regclass)
                 = (SELECT oid FROM pg_roles WHERE rolname = current_user)) THEN
    -- Fail-closed direction: unreadable assessments make rows MORE protected.
    RAISE NOTICE 'note: species is RLS-protected for %; unmatched assessments will fail closed', current_user;
  END IF;
END
$pre$;

-- -----------------------------------------------------------------------------
-- 1. KO-0029 curation fields (additive; defaults preserve current behaviour)
-- -----------------------------------------------------------------------------
ALTER TABLE public.atlas_occurrences
  ADD COLUMN IF NOT EXISTS public_display_allowed boolean NOT NULL DEFAULT true,
  -- NULL = not yet determined (treated as sensitive when unassessed).
  ADD COLUMN IF NOT EXISTS sensitive_location boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sensitivity_source text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS locality_release_approved boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.atlas_occurrences.sensitive_location IS
  'TRUE = withhold precise site. FALSE = assessed and publishable. NULL = not yet determined, treated as sensitive when no assessment is reachable. Never infer FALSE from absence of an assessment.';
COMMENT ON COLUMN public.atlas_occurrences.locality_release_approved IS
  'Explicit, audited human decision that this record''s precise site may be published. Record who/why in sensitivity_source.';
COMMENT ON COLUMN public.atlas_occurrences.coordinate_uncertainty_m IS
  'Uncertainty STATED BY THE SOURCE. A property of the observation, not a publication decision. Never used to signal withholding and never overwritten by generalisation.';

-- -----------------------------------------------------------------------------
-- 2. Public read surface
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.atlas_occurrences_public;

CREATE VIEW public.atlas_occurrences_public
WITH (security_barrier = true, security_invoker = false) AS
WITH cites_appendix_i (genus, epithet) AS (
  -- Orchidaceae entries of CITES Appendix I, transcribed for this policy.
  -- epithet NULL = the whole genus. Includes older synonyms that source
  -- datasets still use. The owner verifies this list against the current
  -- Appendices (checklist.cites.org) before applying; adding a name can only
  -- make the Atlas MORE protective.
  VALUES
    ('paphiopedilum', NULL::text),
    ('phragmipedium', NULL),
    ('mexipedium', 'xerophyticum'),
    ('aerangis', 'ellisii'),
    ('cattleya', 'jongheana'),
    ('laelia', 'jongheana'),
    ('hadrolaelia', 'jongheana'),
    ('cattleya', 'lobata'),
    ('laelia', 'lobata'),
    ('cattleya', 'trianae'),
    ('dendrobium', 'cruentum'),
    ('peristeria', 'elata'),
    ('renanthera', 'imschootiana')
),
named AS (
  SELECT
    o.*,
    ARRAY[
      regexp_replace(lower(btrim(coalesce(o.genus, '') || ' ' || coalesce(o.species, ''))), '\s+', ' ', 'g'),
      regexp_replace(lower(btrim(o.scientific_name)), '\s+', ' ', 'g'),
      regexp_replace(lower(btrim(o.accepted_name)), '\s+', ' ', 'g'),
      split_part(regexp_replace(lower(btrim(o.scientific_name)), '\s+', ' ', 'g'), ' ', 1) || ' '
        || split_part(regexp_replace(lower(btrim(o.scientific_name)), '\s+', ' ', 'g'), ' ', 2),
      split_part(regexp_replace(lower(btrim(o.accepted_name)), '\s+', ' ', 'g'), ' ', 1) || ' '
        || split_part(regexp_replace(lower(btrim(o.accepted_name)), '\s+', ' ', 'g'), ' ', 2)
    ] AS name_keys,
    lower(btrim(o.genus)) AS genus_key
  FROM public.atlas_occurrences o
),
assessed AS (
  SELECT
    n.*,
    coalesce(a.resolved, false) AS assessment_resolved_calc,
    coalesce(a.severity, 0) AS threat_severity,
    EXISTS (
      SELECT 1
      FROM cites_appendix_i c
      WHERE (c.epithet IS NULL AND (
               c.genus = n.genus_key
               OR EXISTS (SELECT 1 FROM unnest(n.name_keys) k WHERE split_part(k, ' ', 1) = c.genus)))
         OR (c.epithet IS NOT NULL AND (c.genus || ' ' || c.epithet) = ANY (n.name_keys))
    ) AS cites_i
  FROM named n
  LEFT JOIN LATERAL (
    SELECT
      bool_or(nullif(btrim(sp.iucn_code), '') IS NOT NULL
              OR nullif(btrim(sp.conservation_status), '') IS NOT NULL) AS resolved,
      max(CASE
            WHEN upper(btrim(sp.iucn_code)) = 'CR' THEN 3
            WHEN upper(btrim(sp.iucn_code)) = 'EN' THEN 2
            WHEN upper(btrim(sp.iucn_code)) = 'VU' THEN 1
            WHEN lower(sp.conservation_status) LIKE '%critically endangered%' THEN 3
            WHEN lower(sp.conservation_status) LIKE '%endangered%' THEN 2
            WHEN lower(sp.conservation_status) LIKE '%vulnerable%' THEN 1
            ELSE 0
          END) AS severity
    FROM public.species sp
    WHERE (n.species_id IS NOT NULL AND sp.id::text = n.species_id::text)
       OR (nullif(btrim(sp.epithet), '') IS NOT NULL
           AND regexp_replace(lower(btrim(coalesce(sp.genus, '') || ' ' || sp.epithet)), '\s+', ' ', 'g')
               = ANY (n.name_keys))
  ) a ON true
),
decided AS (
  SELECT
    s.*,
    CASE WHEN s.locality_release_approved THEN 0::numeric ELSE GREATEST(
      CASE WHEN s.sensitive_location IS TRUE THEN 1.0 ELSE 0 END,
      CASE s.threat_severity WHEN 3 THEN 1.0 WHEN 2 THEN 0.5 WHEN 1 THEN 0.25 ELSE 0 END,
      CASE WHEN s.cites_i THEN 0.1 ELSE 0 END,
      CASE WHEN NOT s.assessment_resolved_calc AND s.sensitive_location IS NULL THEN 0.05 ELSE 0 END
    ) END AS protection_cell_deg,
    -- Same thresholds as uncertaintyToCellDeg() (metres / 111320 per degree).
    CASE
      WHEN s.coordinate_uncertainty_m IS NULL OR s.coordinate_uncertainty_m <= 2226.4 THEN 0::numeric
      WHEN s.coordinate_uncertainty_m <= 11132 THEN 0.1
      WHEN s.coordinate_uncertainty_m <= 27830 THEN 0.25
      WHEN s.coordinate_uncertainty_m <= 55660 THEN 0.5
      ELSE 1.0
    END AS imprecision_cell_deg
  FROM assessed s
  WHERE s.public_display_allowed IS NOT FALSE
),
celled AS (
  SELECT
    d.*,
    GREATEST(d.protection_cell_deg, d.imprecision_cell_deg)::double precision AS cell,
    (floor(d.lat::double precision / nullif(GREATEST(d.protection_cell_deg, d.imprecision_cell_deg), 0)::double precision) + 0.5)
      * GREATEST(d.protection_cell_deg, d.imprecision_cell_deg)::double precision AS lat_centre,
    (floor(d.lng::double precision / nullif(GREATEST(d.protection_cell_deg, d.imprecision_cell_deg), 0)::double precision) + 0.5)
      * GREATEST(d.protection_cell_deg, d.imprecision_cell_deg)::double precision AS lng_centre
  FROM decided d
)
SELECT
  c.id,
  c.scientific_name,
  c.accepted_name,
  c.genus,
  c.species,
  c.species_id,
  CASE WHEN c.cell > 0
    THEN round(LEAST(90, GREATEST(-90, c.lat_centre))::numeric, 6)::double precision
    ELSE c.lat::double precision
  END AS lat,
  CASE WHEN c.cell > 0
    THEN round((c.lng_centre - 360 * floor((c.lng_centre + 180) / 360))::numeric, 6)::double precision
    ELSE c.lng::double precision
  END AS lng,
  c.elevation_m,
  c.country,
  c.region,
  -- A locality string defeats generalisation, so it follows the PROTECTION
  -- decision (not source imprecision, where nothing is being withheld).
  CASE WHEN c.protection_cell_deg > 0 THEN NULL ELSE c.locality END AS locality,
  c.habitat,
  c.biome,
  c.year,
  c.source_dataset,
  c.source_record_id,
  c.media_url,
  c.verified,
  c.coordinate_uncertainty_m,
  c.pollinator_data,
  c.mycorrhizal_data,
  c.ingested_at,
  c.cell AS published_cell_deg,
  CASE
    WHEN c.protection_cell_deg > 0 AND c.protection_cell_deg >= c.imprecision_cell_deg THEN
      CASE
        WHEN c.sensitive_location IS TRUE AND c.protection_cell_deg = 1.0 THEN 'curated-sensitive'
        WHEN c.threat_severity > 0
             AND c.protection_cell_deg = (CASE c.threat_severity WHEN 3 THEN 1.0 WHEN 2 THEN 0.5 ELSE 0.25 END)
          THEN 'threatened'
        WHEN c.cites_i AND c.protection_cell_deg = 0.1 THEN 'cites-appendix-i'
        ELSE 'unresolved-assessment'
      END
    WHEN c.imprecision_cell_deg > 0 THEN 'source-imprecision'
    WHEN c.locality_release_approved THEN 'curated-release'
    ELSE 'exact'
  END AS published_precision_reason,
  c.protection_cell_deg > 0 AS locality_withheld,
  c.assessment_resolved_calc AS assessment_resolved
FROM celled c;

COMMENT ON VIEW public.atlas_occurrences_public IS
  'Public read surface for the Living Atlas (OWNER-APPLIED 20260930). Runs with owner privileges (security_invoker=false) behind a security barrier; publishes only grid-centre coordinates per sensitivity tier, fails closed when no assessment is reachable, and withholds free-text locality whenever protection applied. Implements Brain KO-0029 / KO-0043.';

-- Supabase default privileges grant ALL on new relations to anon/authenticated.
-- The public surface is SELECT only.
REVOKE ALL ON public.atlas_occurrences_public FROM PUBLIC;
REVOKE ALL ON public.atlas_occurrences_public FROM anon, authenticated;
GRANT SELECT ON public.atlas_occurrences_public TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Remove raw public read access
-- -----------------------------------------------------------------------------
-- RLS state is left exactly as found; the control here is the privilege, which
-- no policy can widen.
DROP POLICY IF EXISTS "atlas_occurrences_public_read" ON public.atlas_occurrences;
REVOKE SELECT ON public.atlas_occurrences FROM anon, authenticated;
-- Column-level grants survive a table-level REVOKE; remove them explicitly.
REVOKE SELECT (lat, lng, locality) ON public.atlas_occurrences FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Postconditions
-- -----------------------------------------------------------------------------
DO $post$
DECLARE
  rn text;
  col text;
  leftover text;
BEGIN
  FOREACH rn IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(rn, 'public.atlas_occurrences', 'SELECT') THEN
      RAISE EXCEPTION 'postcondition: % still has table SELECT on atlas_occurrences', rn;
    END IF;
    FOREACH col IN ARRAY ARRAY['lat', 'lng', 'locality'] LOOP
      IF has_column_privilege(rn, 'public.atlas_occurrences', col, 'SELECT') THEN
        RAISE EXCEPTION 'postcondition: % can still SELECT atlas_occurrences.%', rn, col;
      END IF;
    END LOOP;
    IF NOT has_table_privilege(rn, 'public.atlas_occurrences_public', 'SELECT') THEN
      RAISE EXCEPTION 'postcondition: % cannot SELECT atlas_occurrences_public', rn;
    END IF;
    IF has_table_privilege(rn, 'public.atlas_occurrences_public', 'INSERT, UPDATE, DELETE, TRUNCATE') THEN
      RAISE EXCEPTION 'postcondition: % holds a write privilege on atlas_occurrences_public', rn;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.atlas_occurrences', 'SELECT') THEN
    RAISE EXCEPTION 'postcondition: service_role lost SELECT on atlas_occurrences';
  END IF;

  -- Policies are inert without a grant, but report any that would re-open the
  -- table if a grant came back.
  SELECT string_agg(policyname, ', ') INTO leftover
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'atlas_occurrences'
    AND cmd IN ('SELECT', 'ALL')
    AND roles && ARRAY['anon', 'authenticated', 'public']::name[];
  IF leftover IS NOT NULL THEN
    RAISE WARNING 'review: permissive policies still name anon/authenticated/public on atlas_occurrences: %', leftover;
  END IF;
END
$post$;

NOTIFY pgrst, 'reload schema';

COMMIT;
