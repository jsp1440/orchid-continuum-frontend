# BUILD 204I-D — Relationship Harvest Expansion Option B
# Target: all species with image records.
# Run in Colab/Jupyter with DATABASE_URL or DATABASE secret available.

import os
import pandas as pd
from sqlalchemy import create_engine, text

try:
    from google.colab import userdata
except Exception:
    userdata = None


def get_secret(name: str):
    if userdata is None:
        return None
    try:
        return userdata.get(name)
    except Exception:
        return None


DATABASE_URL = (
    get_secret("DATABASE_URL")
    or get_secret("DATABASE")
    or get_secret("DATABASE_PUBLIC_URL")
    or os.environ.get("DATABASE_URL")
)

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not found in Colab Secrets or environment.")

engine = create_engine(DATABASE_URL)

DDL_SQL = """
CREATE SCHEMA IF NOT EXISTS oc_ecology;
CREATE SCHEMA IF NOT EXISTS oc_api;

CREATE TABLE IF NOT EXISTS oc_ecology.species_ecological_relationship_harvest (
    relationship_id bigserial PRIMARY KEY,
    focal_species text NOT NULL,
    focal_genus text,
    neighbor_name text NOT NULL,
    neighbor_type text NOT NULL,
    relationship_category text NOT NULL,
    title text NOT NULL,
    subtitle text,
    relationship_reason text NOT NULL,
    evidence_score numeric,
    evidence_label text,
    evidence_value text,
    source_schema text,
    source_table text,
    source_count integer DEFAULT 1,
    image_url text,
    source_url text,
    harvest_build text DEFAULT '204I-D',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_species_relationship_harvest_focal
ON oc_ecology.species_ecological_relationship_harvest (focal_species);

CREATE INDEX IF NOT EXISTS idx_species_relationship_harvest_type
ON oc_ecology.species_ecological_relationship_harvest (neighbor_type);

CREATE INDEX IF NOT EXISTS idx_species_relationship_harvest_build
ON oc_ecology.species_ecological_relationship_harvest (harvest_build);

DELETE FROM oc_ecology.species_ecological_relationship_harvest
WHERE harvest_build = '204I-D';
"""

SPECIES_SQL = """
WITH targets AS (
    SELECT DISTINCT
        p.scientific_name,
        p.genus,
        COALESCE(p.image_count, 0) AS image_count
    FROM oc_api.v_relationship_explorer_species_profile_v1 p
    WHERE p.scientific_name IS NOT NULL
      AND COALESCE(p.image_count, 0) > 0
)
INSERT INTO oc_ecology.species_ecological_relationship_harvest (
    focal_species, focal_genus, neighbor_name, neighbor_type,
    relationship_category, title, subtitle, relationship_reason,
    evidence_score, evidence_label, evidence_value,
    source_schema, source_table, source_count, image_url, harvest_build
)
SELECT
    t.scientific_name,
    t.genus,
    t.scientific_name,
    'species',
    'focal_species',
    t.scientific_name,
    'Active species',
    'This is the active species-centered node used to build the ecological neighborhood.',
    t.image_count,
    'image records',
    t.image_count::text,
    'oc_api',
    'v_relationship_explorer_species_profile_v1',
    1,
    img.image_url,
    '204I-D'
FROM targets t
LEFT JOIN LATERAL (
    SELECT image_url
    FROM api.v_frontend_orchid_images i
    WHERE i.scientific_name = t.scientific_name
      AND i.image_url IS NOT NULL
    LIMIT 1
) img ON true;
"""

GEOGRAPHY_SQL = """
WITH targets AS (
    SELECT DISTINCT focal_species
    FROM oc_ecology.species_ecological_relationship_harvest
    WHERE harvest_build = '204I-D'
)
INSERT INTO oc_ecology.species_ecological_relationship_harvest (
    focal_species, focal_genus, neighbor_name, neighbor_type,
    relationship_category, title, subtitle, relationship_reason,
    evidence_score, evidence_label, evidence_value,
    source_schema, source_table, source_count, harvest_build
)
SELECT
    a.scientific_name,
    split_part(a.scientific_name, ' ', 1),
    'Geographic neighborhood',
    'geography',
    'atlas',
    'Geographic neighborhood',
    a.atlas_readiness,
    'Mapped occurrence evidence can anchor co-occurring species, habitat, climate, and conservation relationships.',
    COALESCE(a.atlas_confidence_score, 0),
    'occurrence records',
    COALESCE(a.occurrence_count, 0)::text,
    'oc_api',
    'species_atlas_summary_v1',
    COALESCE(a.occurrence_count, 0)::integer,
    '204I-D'
FROM oc_api.species_atlas_summary_v1 a
JOIN targets t ON t.focal_species = a.scientific_name;
"""

MYCORRHIZA_SQL = """
WITH targets AS (
    SELECT DISTINCT focal_species
    FROM oc_ecology.species_ecological_relationship_harvest
    WHERE harvest_build = '204I-D'
)
INSERT INTO oc_ecology.species_ecological_relationship_harvest (
    focal_species, focal_genus, neighbor_name, neighbor_type,
    relationship_category, title, subtitle, relationship_reason,
    evidence_score, evidence_label, evidence_value,
    source_schema, source_table, source_count, source_url, harvest_build
)
SELECT
    m.scientific_name,
    m.genus,
    COALESCE(NULLIF(m.partner_candidate, ''), 'fungal partner candidate'),
    'fungus',
    'mycorrhiza',
    'Mycorrhizal association',
    m.symbiosis_signal,
    COALESCE(m.source_title, 'Literature-linked orchid mycorrhiza or fungal association claim.'),
    COALESCE(m.confidence_score, 0),
    'confidence',
    COALESCE(m.confidence_score, 0)::text,
    'oc_ecology',
    'literature_mycorrhiza_symbiosis_claims',
    1,
    m.source_doi,
    '204I-D'
FROM oc_ecology.literature_mycorrhiza_symbiosis_claims m
JOIN targets t ON t.focal_species = m.scientific_name;
"""

FUNGAL_DEPENDENCY_SQL = """
WITH targets AS (
    SELECT DISTINCT focal_species
    FROM oc_ecology.species_ecological_relationship_harvest
    WHERE harvest_build = '204I-D'
)
INSERT INTO oc_ecology.species_ecological_relationship_harvest (
    focal_species, focal_genus, neighbor_name, neighbor_type,
    relationship_category, title, subtitle, relationship_reason,
    evidence_score, evidence_label, evidence_value,
    source_schema, source_table, source_count, source_url, harvest_build
)
SELECT
    f.accepted_scientific_name,
    split_part(f.accepted_scientific_name, ' ', 1),
    COALESCE(f.fungal_association_type, 'orchid mycorrhiza'),
    'fungal_dependency',
    'fungal_dependency',
    'Fungal dependency',
    f.life_stage,
    COALESCE(f.evidence_summary, 'This species has fungal dependency evidence.'),
    COALESCE(f.fungal_dependency_score, 0),
    'confidence',
    COALESCE(f.confidence, f.evidence_level, 'linked'),
    'oc_dependency',
    'fungal_dependency_evidence',
    1,
    COALESCE(f.url, f.doi),
    '204I-D'
FROM oc_dependency.fungal_dependency_evidence f
JOIN targets t ON t.focal_species = f.accepted_scientific_name;
"""

REASONING_SQL = """
WITH targets AS (
    SELECT DISTINCT focal_species
    FROM oc_ecology.species_ecological_relationship_harvest
    WHERE harvest_build = '204I-D'
)
INSERT INTO oc_ecology.species_ecological_relationship_harvest (
    focal_species, focal_genus, neighbor_name, neighbor_type,
    relationship_category, title, subtitle, relationship_reason,
    evidence_score, evidence_label, evidence_value,
    source_schema, source_table, source_count, harvest_build
)
SELECT
    r.scientific_name,
    r.genus,
    'Knowledge graph signal',
    'knowledge',
    'reasoning',
    'Knowledge graph signal',
    r.reasoning_density,
    COALESCE(r.reasoning_narrative, 'The reasoning layer has inferred ecological concepts for this species.'),
    COALESCE(r.fired_rule_count, 0),
    'rules fired',
    COALESCE(r.fired_rule_count, 0)::text,
    'oc_api',
    'v_species_reasoning_narrative_v1',
    COALESCE(r.fired_rule_count, 0)::integer,
    '204I-D'
FROM oc_api.v_species_reasoning_narrative_v1 r
JOIN targets t ON t.focal_species = r.scientific_name;
"""

GAP_SQL = """
WITH targets AS (
    SELECT DISTINCT focal_species, focal_genus
    FROM oc_ecology.species_ecological_relationship_harvest
    WHERE harvest_build = '204I-D'
)
INSERT INTO oc_ecology.species_ecological_relationship_harvest (
    focal_species, focal_genus, neighbor_name, neighbor_type,
    relationship_category, title, subtitle, relationship_reason,
    evidence_score, evidence_label, evidence_value,
    source_schema, source_table, source_count, harvest_build
)
SELECT
    t.focal_species,
    t.focal_genus,
    m.neighbor_name,
    m.neighbor_type,
    m.relationship_category,
    m.title,
    'Data needed',
    m.relationship_reason,
    0,
    'status',
    'not yet linked',
    'oc_ecology',
    'species_ecological_relationship_harvest',
    0,
    '204I-D'
FROM targets t
CROSS JOIN (
    VALUES
      ('Pollinator relationship not yet linked', 'pollinator', 'pollinator_gap', 'Pollinator relationship not yet linked', 'No species-level pollinator card is linked yet.'),
      ('Habitat profile not yet linked', 'habitat', 'habitat_gap', 'Habitat profile not yet linked', 'Species-level habitat should show habitat type, elevation band, substrate, climate, and associated community.'),
      ('Conservation card not yet linked', 'conservation', 'conservation_gap', 'Conservation card not yet linked', 'Future cards should show IUCN status, population trend, threat type, and habitat-loss pressure.'),
      ('Co-occurring orchid neighbors', 'co_occurring_orchid', 'cooccurrence_gap', 'Co-occurring orchid neighbors', 'Reserved for species-level co-occurrence.'),
      ('Host tree / substrate', 'host_tree', 'host_substrate_gap', 'Host tree / substrate', 'Reserved for epiphyte substrate relationships.')
) AS m(neighbor_name, neighbor_type, relationship_category, title, relationship_reason);
"""

VIEW_SQL = """
DROP VIEW IF EXISTS oc_api.species_ecological_neighborhood_v1;

CREATE VIEW oc_api.species_ecological_neighborhood_v1 AS
SELECT *
FROM oc_ecology.species_ecological_relationship_harvest
WHERE harvest_build IN ('204I-D', '204I-B');
"""

SQL_BLOCKS = [
    ("DDL", DDL_SQL),
    ("species", SPECIES_SQL),
    ("geography", GEOGRAPHY_SQL),
    ("mycorrhiza", MYCORRHIZA_SQL),
    ("fungal_dependency", FUNGAL_DEPENDENCY_SQL),
    ("reasoning", REASONING_SQL),
    ("gap_cards", GAP_SQL),
    ("api_view", VIEW_SQL),
]

with engine.begin() as conn:
    for label, sql in SQL_BLOCKS:
        print(f"Running {label}...")
        conn.execute(text(sql))

summary = pd.read_sql(
    """
    SELECT neighbor_type, COUNT(*) AS relationship_count
    FROM oc_api.species_ecological_neighborhood_v1
    WHERE harvest_build = '204I-D'
    GROUP BY neighbor_type
    ORDER BY relationship_count DESC
    """,
    engine,
)

lobbii_check = pd.read_sql(
    """
    SELECT focal_species, neighbor_type, COUNT(*) AS relationship_count
    FROM oc_api.species_ecological_neighborhood_v1
    WHERE harvest_build = '204I-D'
      AND focal_species ILIKE 'Bulbophyllum lobbii'
    GROUP BY focal_species, neighbor_type
    ORDER BY neighbor_type
    """,
    engine,
)

recent_sample = pd.read_sql(
    """
    SELECT focal_species, neighbor_type, title, subtitle, evidence_label, evidence_value, source_table
    FROM oc_api.species_ecological_neighborhood_v1
    WHERE harvest_build = '204I-D'
    ORDER BY created_at DESC, relationship_id DESC
    LIMIT 60
    """,
    engine,
)

summary_file = "/content/build_204i_d_harvest_expansion_summary.csv"
lobbii_file = "/content/build_204i_d_bulbophyllum_lobbii_check.csv"
sample_file = "/content/build_204i_d_harvest_expansion_sample.csv"

summary.to_csv(summary_file, index=False)
lobbii_check.to_csv(lobbii_file, index=False)
recent_sample.to_csv(sample_file, index=False)

print("\n" + "=" * 80)
print("BUILD 204I-D COMPLETE")
print("RELATIONSHIP HARVEST EXPANSION — OPTION B")
print("=" * 80)
print("\nSUMMARY")
print(summary)
print("\nBULBOPHYLLUM LOBBII CHECK")
print(lobbii_check)
print("\nFILES WRITTEN")
print(summary_file)
print(lobbii_file)
print(sample_file)
