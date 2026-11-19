-- SYNTHETIC TEST FIXTURE — NOT PRODUCTION DATA.
--
-- Emulates the parts of a Supabase project that the atlas_occurrences
-- locality-protection migration depends on, inside a disposable local
-- Postgres 16 created by scripts/test-atlas-rls.sh:
--
--   * roles anon / authenticated (NOLOGIN), service_role (BYPASSRLS), and a
--     non-superuser owner role standing in for Supabase's `postgres`, which is
--     a member of anon / authenticated / service_role;
--   * Supabase's default privileges (ALL on new relations to the API roles);
--   * public.species and public.atlas_occurrences with the production column
--     set the frontend selects (src/lib/orchidContinuum.ts SPECIES_COLUMNS /
--     ATLAS_COLUMNS, docs/evidence/atlas-next/locality-safety-probe.json);
--   * RLS enabled with the live USING (true) public-read policy.
--
-- Every taxon name below is SYNTHETIC ("Synthetica ...", or an invented
-- epithet under a real CITES Appendix I genus to exercise that rule). Every
-- coordinate is an open-ocean point in the south-east Pacific. None of it is
-- an orchid record.
--
SET client_min_messages = warning;

-- Run as the cluster superuser. The roles are cluster-wide; the objects are
-- per database.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_owner') THEN
    CREATE ROLE atlas_owner LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$roles$;

GRANT anon, authenticated, service_role TO atlas_owner;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT CREATE ON SCHEMA public TO atlas_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE atlas_owner IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

SET ROLE atlas_owner;

CREATE TABLE public.species (
  id uuid PRIMARY KEY,
  slug text,
  genus text,
  epithet text,
  common_name text,
  authority text,
  family text,
  subfamily text,
  tribe text,
  region text,
  countries text[],
  habitat text,
  growth_form text,
  ecology text,
  description text,
  conservation_status text,
  iucn_code text,
  image_url text,
  occurrences jsonb,
  pollinators jsonb,
  traits jsonb
);

CREATE TABLE public.atlas_occurrences (
  id uuid PRIMARY KEY,
  scientific_name text NOT NULL,
  accepted_name text,
  genus text,
  species text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  elevation_m numeric,
  country text,
  region text,
  locality text,
  habitat text,
  biome text,
  year integer,
  source_dataset text NOT NULL,
  source_record_id text NOT NULL,
  media_url text,
  verified boolean,
  coordinate_uncertainty_m numeric,
  pollinator_data jsonb,
  mycorrhizal_data jsonb,
  species_id uuid REFERENCES public.species (id),
  ingested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.species ENABLE ROW LEVEL SECURITY;
CREATE POLICY "species_public_read" ON public.species FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.atlas_occurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "atlas_occurrences_public_read"
  ON public.atlas_occurrences FOR SELECT TO anon, authenticated USING (true);

-- Synthetic assessments. Two rows share a name on purpose (VU and EN) to prove
-- the most protective tier wins and that a join never duplicates occurrences.
INSERT INTO public.species (id, slug, genus, epithet, conservation_status, iucn_code) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'synthetic-cr', 'Synthetica', 'critica', 'Critically Endangered', 'CR'),
  ('00000000-0000-4000-8000-0000000000e1', 'synthetic-en', 'Synthetica', 'endangera', 'Endangered', 'EN'),
  ('00000000-0000-4000-8000-0000000000f1', 'synthetic-vu', 'Synthetica', 'vulnerata', 'Vulnerable', 'VU'),
  ('00000000-0000-4000-8000-0000000000a1', 'synthetic-lc', 'Synthetica', 'communis', 'Least Concern', 'LC'),
  ('00000000-0000-4000-8000-0000000000b1', 'synthetic-text', 'Synthetica', 'verbalis', 'Endangered (text only)', NULL),
  ('00000000-0000-4000-8000-0000000000d1', 'synthetic-dup-vu', 'Synthetica', 'duplicata', 'Vulnerable', 'VU'),
  ('00000000-0000-4000-8000-0000000000d2', 'synthetic-dup-en', 'Synthetica', 'duplicata', 'Endangered', 'EN'),
  ('00000000-0000-4000-8000-0000000000a2', 'synthetic-lc-cites', 'Paphiopedilum', 'syntheticum', 'Least Concern', 'LC');

-- Synthetic occurrences: south-east Pacific open ocean, never a real site.
INSERT INTO public.atlas_occurrences
  (id, scientific_name, accepted_name, genus, species, lat, lng, country, region, locality, habitat,
   year, source_dataset, source_record_id, verified, coordinate_uncertainty_m, species_id)
VALUES
  -- CR by species_id although the name does not match anything.
  ('10000000-0000-4000-8000-000000000001', 'SYNTHETIC unmatched name', NULL, NULL, NULL,
   -41.23457, -115.67891, 'SYNTHETIC', 'SYNTHETIC', 'SYNTHETIC locality CR', NULL,
   2001, 'SYNTHETIC', 'SYN-1', true, NULL, '00000000-0000-4000-8000-0000000000c1'),
  -- EN by genus + species.
  ('10000000-0000-4000-8000-000000000002', 'Synthetica endangera', NULL, 'Synthetica', 'endangera',
   -42.31219, -113.43671, 'SYNTHETIC', NULL, 'SYNTHETIC locality EN', NULL,
   2002, 'SYNTHETIC', 'SYN-2', true, 50, NULL),
  -- VU by the first two words of a scientific_name that carries authorship.
  ('10000000-0000-4000-8000-000000000003', 'Synthetica vulnerata (Synth.) Synth.', NULL, NULL, NULL,
   -43.07773, -117.91113, 'SYNTHETIC', NULL, 'SYNTHETIC locality VU', NULL,
   2003, 'SYNTHETIC', 'SYN-3', true, NULL, NULL),
  -- LC, precise: published exactly, locality kept.
  ('10000000-0000-4000-8000-000000000004', 'Synthetica communis', NULL, 'Synthetica', 'communis',
   -40.55551, -111.12347, 'SYNTHETIC', NULL, 'SYNTHETIC locality LC exact', NULL,
   2004, 'SYNTHETIC', 'SYN-4', true, 30, NULL),
  -- LC with 20 km stated uncertainty: 0.25 deg source imprecision, locality kept.
  ('10000000-0000-4000-8000-000000000005', 'Synthetica communis', 'Synthetica communis', 'Synthetica', 'communis',
   -40.81239, -112.36547, 'SYNTHETIC', NULL, 'SYNTHETIC locality LC imprecise', NULL,
   2005, 'SYNTHETIC', 'SYN-5', true, 20000, NULL),
  -- UNRESOLVED: no species row. Fail closed to 0.05 deg, locality withheld.
  ('10000000-0000-4000-8000-000000000006', 'Synthetica ignota', NULL, 'Synthetica', 'ignota',
   -41.77777, -114.22229, 'SYNTHETIC', NULL, 'SYNTHETIC locality unresolved', NULL,
   2006, 'SYNTHETIC', 'SYN-6', false, NULL, NULL),
  -- CITES Appendix I genus, unresolved: floor 0.1 deg, locality withheld.
  ('10000000-0000-4000-8000-000000000007', 'Paphiopedilum inventum', NULL, 'Paphiopedilum', 'inventum',
   -42.66661, -116.54323, 'SYNTHETIC', NULL, 'SYNTHETIC locality CITES unresolved', NULL,
   2007, 'SYNTHETIC', 'SYN-7', true, NULL, NULL),
  -- CITES Appendix I genus, assessed LC: still 0.1 deg.
  ('10000000-0000-4000-8000-000000000008', 'Paphiopedilum syntheticum', NULL, 'Paphiopedilum', 'syntheticum',
   -43.44449, -110.87651, 'SYNTHETIC', NULL, 'SYNTHETIC locality CITES LC', NULL,
   2008, 'SYNTHETIC', 'SYN-8', true, NULL, NULL),
  -- Duplicate species rows (VU + EN): the more protective EN wins, one output row.
  ('10000000-0000-4000-8000-000000000009', 'Synthetica duplicata', NULL, 'Synthetica', 'duplicata',
   -40.33337, -118.76543, 'SYNTHETIC', NULL, 'SYNTHETIC locality duplicate', NULL,
   2009, 'SYNTHETIC', 'SYN-9', true, NULL, NULL),
  -- Status text only ("Endangered ..."), no iucn_code: EN.
  ('10000000-0000-4000-8000-000000000010', 'Synthetica verbalis', NULL, 'Synthetica', 'verbalis',
   -41.99991, -119.33337, 'SYNTHETIC', NULL, 'SYNTHETIC locality text status', NULL,
   2010, 'SYNTHETIC', 'SYN-10', true, NULL, NULL),
  -- CR with 80 km uncertainty: protection (1.0) still decides, reason threatened.
  ('10000000-0000-4000-8000-000000000011', 'Synthetica critica', NULL, 'Synthetica', 'critica',
   -42.12343, -112.98761, 'SYNTHETIC', NULL, 'SYNTHETIC locality CR imprecise', NULL,
   2011, 'SYNTHETIC', 'SYN-11', true, 80000, NULL),
  -- Unresolved, curated sensitive_location = TRUE after the migration: 1.0 deg.
  ('10000000-0000-4000-8000-000000000012', 'Synthetica curata', NULL, 'Synthetica', 'curata',
   -43.87653, -114.87651, 'SYNTHETIC', NULL, 'SYNTHETIC locality curated sensitive', NULL,
   2012, 'SYNTHETIC', 'SYN-12', true, NULL, NULL),
  -- Unresolved, curated sensitive_location = FALSE after the migration: exact.
  ('10000000-0000-4000-8000-000000000013', 'Synthetica publica', NULL, 'Synthetica', 'publica',
   -40.12347, -116.11113, 'SYNTHETIC', NULL, 'SYNTHETIC locality curated publishable', NULL,
   2013, 'SYNTHETIC', 'SYN-13', true, NULL, NULL),
  -- Threatened, locality_release_approved = TRUE after the migration: exact.
  ('10000000-0000-4000-8000-000000000014', 'Synthetica endangera', NULL, 'Synthetica', 'endangera',
   -41.45679, -117.24681, 'SYNTHETIC', NULL, 'SYNTHETIC locality released', NULL,
   2014, 'SYNTHETIC', 'SYN-14', true, NULL, NULL),
  -- public_display_allowed = FALSE after the migration: hidden from the view.
  ('10000000-0000-4000-8000-000000000015', 'Synthetica communis', NULL, 'Synthetica', 'communis',
   -42.88889, -115.11113, 'SYNTHETIC', NULL, 'SYNTHETIC locality hidden', NULL,
   2015, 'SYNTHETIC', 'SYN-15', true, NULL, NULL);

RESET ROLE;

-- Expectations live outside the API-visible schema.
CREATE SCHEMA synthetic_test;
CREATE TABLE synthetic_test.expected (
  id uuid PRIMARY KEY,
  cell numeric NOT NULL,
  reason text NOT NULL,
  locality_withheld boolean NOT NULL,
  hidden boolean NOT NULL DEFAULT false
);
INSERT INTO synthetic_test.expected (id, cell, reason, locality_withheld, hidden) VALUES
  ('10000000-0000-4000-8000-000000000001', 1.0,  'threatened',            true,  false),
  ('10000000-0000-4000-8000-000000000002', 0.5,  'threatened',            true,  false),
  ('10000000-0000-4000-8000-000000000003', 0.25, 'threatened',            true,  false),
  ('10000000-0000-4000-8000-000000000004', 0,    'exact',                 false, false),
  ('10000000-0000-4000-8000-000000000005', 0.25, 'source-imprecision',    false, false),
  ('10000000-0000-4000-8000-000000000006', 0.05, 'unresolved-assessment', true,  false),
  ('10000000-0000-4000-8000-000000000007', 0.1,  'cites-appendix-i',      true,  false),
  ('10000000-0000-4000-8000-000000000008', 0.1,  'cites-appendix-i',      true,  false),
  ('10000000-0000-4000-8000-000000000009', 0.5,  'threatened',            true,  false),
  ('10000000-0000-4000-8000-000000000010', 0.5,  'threatened',            true,  false),
  ('10000000-0000-4000-8000-000000000011', 1.0,  'threatened',            true,  false),
  ('10000000-0000-4000-8000-000000000012', 1.0,  'curated-sensitive',     true,  false),
  ('10000000-0000-4000-8000-000000000013', 0,    'exact',                 false, false),
  ('10000000-0000-4000-8000-000000000014', 0,    'curated-release',       false, false),
  ('10000000-0000-4000-8000-000000000015', 0,    'exact',                 false, true);
