-- =============================================================================
-- PROPOSAL — NOT APPLIED. DO NOT RUN AGAINST PRODUCTION WITHOUT OWNER REVIEW.
-- =============================================================================
--
-- Orchid Continuum · Living Atlas · Slice 2 · locality protection
--
-- WHY THIS EXISTS
--
-- The Continuum already has an ACTIVE standard for this: Brain KO-0029, "Atlas
-- Public Display Rules", requires that "sensitive location details are removed
-- or generalized" before public display, and names the fields that should carry
-- that decision — public_display_allowed, sensitive_location_removed, and
-- others.
--
-- The live `atlas_occurrences` table implements none of them, and its row-level
-- security grants `anon` unrestricted SELECT:
--
--     CREATE POLICY "atlas_occurrences_public_read"
--     ON public.atlas_occurrences FOR SELECT TO anon, authenticated USING (true);
--
-- The anon key ships inside the browser bundle, so any client can read the base
-- table directly. Generalisation performed in the frontend is therefore a
-- display courtesy and not a control: it protects what the Atlas draws, and
-- nothing at all about what the endpoint returns.
--
-- Measured on the live store (read-only probe, 2026-08-18):
--
--     atlas_occurrences                         31,073 rows
--     distinct scientific names among them       2,611
--     rows carrying species_id                     353   (1.1%)
--     iucn_code column                          ABSENT from the live table
--     species reference table                        9 rows, all assessed
--     sampled rows resolving to any assessment      5.5%
--     rows stating coordinate_uncertainty_m     19,761
--     rows with uncertainty over 10 km           6,953
--
--     A threatened species (Dracula vampira, VU) returns coordinates at six
--     decimal places to an anonymous caller, while the same row states a
--     coordinate uncertainty of 31,451 m. Both the withholding and the
--     precision are wrong, in opposite directions.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Adds the sensitivity fields KO-0029 already calls for.
--   2. Adds a security-barrier view that decides precision at the SOURCE and
--      fails closed when sensitivity cannot be resolved.
--   3. Moves anonymous read access from the base table onto that view.
--
-- Coordinate uncertainty is preserved as its own column and never conflated
-- with withholding. They mean different things: one is a property of the
-- observation, the other is a decision about publication.
--
-- ROLLOUT — this must NOT be applied as one step:
--
--   Stage 1  apply sections 1 and 2 (additive; nothing breaks)
--   Stage 2  point every consumer at atlas_occurrences_public and verify
--   Stage 3  apply section 3 (revokes anon on the base table — BREAKING for
--            any consumer still reading it, including the current frontend)
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sensitivity fields (additive, safe)
-- -----------------------------------------------------------------------------

ALTER TABLE public.atlas_occurrences
  -- KO-0029: public display permission.
  ADD COLUMN IF NOT EXISTS public_display_allowed boolean NOT NULL DEFAULT true,
  -- NULL means NOT YET DETERMINED, and is treated as sensitive. It is
  -- deliberately nullable so that "nobody has decided" is representable and
  -- cannot be confused with "decided: not sensitive".
  ADD COLUMN IF NOT EXISTS sensitive_location boolean DEFAULT NULL,
  -- How the decision above was reached, so it can be audited and re-run.
  ADD COLUMN IF NOT EXISTS sensitivity_source text DEFAULT NULL,
  -- Explicit override for a curated record whose site is genuinely publishable.
  ADD COLUMN IF NOT EXISTS locality_release_approved boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.atlas_occurrences.sensitive_location IS
  'TRUE = withhold precise site. FALSE = assessed and publishable. NULL = not yet determined, treated as sensitive. Never infer FALSE from absence of an assessment.';

COMMENT ON COLUMN public.atlas_occurrences.coordinate_uncertainty_m IS
  'Uncertainty STATED BY THE SOURCE. A property of the observation, not a publication decision. Must never be used to indicate withholding, and must never be overwritten by generalisation.';

-- -----------------------------------------------------------------------------
-- 2. The public view — decides precision at the source, and fails closed
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.atlas_occurrences_public
WITH (security_barrier = true) AS
WITH decided AS (
  SELECT
    o.*,
    -- Threat tier resolved by species link OR exact canonical binomial, using
    -- the same conservative rule as the client: exact match, nothing inferred.
    COALESCE(
      sp_by_id.iucn_code,
      sp_by_name.iucn_code
    ) AS resolved_iucn,
    (sp_by_id.id IS NOT NULL OR sp_by_name.id IS NOT NULL) AS assessment_resolved
  FROM public.atlas_occurrences o
  LEFT JOIN public.species sp_by_id
    ON sp_by_id.id = o.species_id
  LEFT JOIN public.species sp_by_name
    ON lower(btrim(sp_by_name.genus || ' ' || sp_by_name.epithet))
       = lower(btrim(COALESCE(o.accepted_name, o.scientific_name)))
),
policy AS (
  SELECT
    d.*,
    CASE
      -- An explicit curation decision wins, in either direction.
      WHEN d.locality_release_approved THEN 0
      WHEN d.sensitive_location IS TRUE THEN 1.0
      -- Threat tiers.
      WHEN d.resolved_iucn = 'CR' THEN 1.0
      WHEN d.resolved_iucn = 'EN' THEN 0.5
      WHEN d.resolved_iucn = 'VU' THEN 0.25
      -- FAIL CLOSED: nobody has assessed this name, and nobody has decided.
      WHEN NOT d.assessment_resolved AND d.sensitive_location IS NULL THEN 0.05
      ELSE 0
    END AS protection_cell_deg,
    -- Source imprecision, kept SEPARATE. It coarsens the drawn position but
    -- withholds nothing, because the record was never more precise than this.
    CASE
      WHEN d.coordinate_uncertainty_m IS NULL THEN 0
      WHEN d.coordinate_uncertainty_m <= 2000 THEN 0
      WHEN d.coordinate_uncertainty_m <= 11132 THEN 0.1
      WHEN d.coordinate_uncertainty_m <= 27830 THEN 0.25
      WHEN d.coordinate_uncertainty_m <= 55660 THEN 0.5
      ELSE 1.0
    END AS imprecision_cell_deg
  FROM decided d
)
SELECT
  p.id,
  p.scientific_name,
  p.accepted_name,
  p.genus,
  p.species,
  p.species_id,

  -- Snap to the centre of the containing cell. NEVER jitter: a jittered
  -- coordinate is a plausible-looking coordinate that is simply false, whereas
  -- a cell centre honestly means "somewhere in this square".
  CASE WHEN GREATEST(p.protection_cell_deg, p.imprecision_cell_deg) > 0
    THEN (floor(p.lat / GREATEST(p.protection_cell_deg, p.imprecision_cell_deg)) + 0.5)
         * GREATEST(p.protection_cell_deg, p.imprecision_cell_deg)
    ELSE p.lat
  END AS lat,
  CASE WHEN GREATEST(p.protection_cell_deg, p.imprecision_cell_deg) > 0
    THEN (floor(p.lng / GREATEST(p.protection_cell_deg, p.imprecision_cell_deg)) + 0.5)
         * GREATEST(p.protection_cell_deg, p.imprecision_cell_deg)
    ELSE p.lng
  END AS lng,

  -- What the client needs in order to say WHY, without recomputing policy.
  GREATEST(p.protection_cell_deg, p.imprecision_cell_deg) AS published_cell_deg,
  CASE
    WHEN p.protection_cell_deg >= p.imprecision_cell_deg AND p.protection_cell_deg > 0
      THEN CASE
             WHEN p.resolved_iucn IN ('CR', 'EN', 'VU') THEN 'threatened'
             WHEN p.sensitive_location IS TRUE THEN 'curated-sensitive'
             ELSE 'unresolved-assessment'
           END
    WHEN p.imprecision_cell_deg > 0 THEN 'source-imprecision'
    ELSE 'exact'
  END AS published_precision_reason,
  p.assessment_resolved,

  -- Preserved, unmodified, and distinct from any of the above.
  p.coordinate_uncertainty_m,

  p.country,
  p.region,
  -- Free-text locality follows the PROTECTION decision, not the coordinate
  -- reason: a locality string defeats generalisation entirely.
  CASE WHEN p.protection_cell_deg > 0 THEN NULL ELSE p.locality END AS locality,

  p.habitat,
  p.biome,
  p.elevation_m,
  p.year,
  p.source_dataset,
  p.source_record_id,
  p.media_url,
  p.verified,
  p.pollinator_data,
  p.mycorrhizal_data,
  p.ingested_at
FROM policy p
WHERE p.public_display_allowed;

COMMENT ON VIEW public.atlas_occurrences_public IS
  'Public read surface for the Living Atlas. Decides published coordinate precision at the source and fails closed when no conservation assessment can be resolved. Implements Brain KO-0029. Coordinate uncertainty is preserved separately and is never used to signal withholding.';

-- -----------------------------------------------------------------------------
-- 3. Move anonymous access onto the view  ***BREAKING — STAGE 3 ONLY***
-- -----------------------------------------------------------------------------
-- Apply only after every consumer reads the view. The current frontend reads
-- the base table and will return no rows the moment this runs.
--
-- DROP POLICY IF EXISTS "atlas_occurrences_public_read" ON public.atlas_occurrences;
--
-- CREATE POLICY "atlas_occurrences_authenticated_read"
--   ON public.atlas_occurrences FOR SELECT TO authenticated USING (true);
--
-- REVOKE SELECT ON public.atlas_occurrences FROM anon;
-- GRANT  SELECT ON public.atlas_occurrences_public TO anon, authenticated;
