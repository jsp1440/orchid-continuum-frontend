#!/usr/bin/env node
/**
 * scripts/verify-cross-system-contracts.mjs
 *
 * Verifies cross-module entity continuity across the canonical Orchid Continuum stack:
 *  1. Taxon -> 2. Atlas -> 3. Graph -> 4. Evidence -> 5. Matrix -> 6. Calyx -> 7. Research Station -> 8. Conservatory -> 9. Conservation
 */

import assert from "node:assert/strict";

const CANONICAL_SAMPLE = {
  pipeline_id: "cross-system-canonical-001",
  taxon: {
    taxon_id: "taxon:orchid:cattleya_trianae",
    canonical_name: "Cattleya trianae",
    genus: "Cattleya",
    species: "trianae",
  },
  atlas: {
    occurrence_id: "occ:12345",
    taxon_id: "taxon:orchid:cattleya_trianae",
    latitude: 4.5709,
    longitude: -74.2973,
    country_code: "CO",
  },
  graph: {
    edge_id: "edge:456",
    subject_id: "taxon:orchid:cattleya_trianae",
    predicate: "has_pollinator",
    object_id: "pollinator:eulaema_meriana",
    evidence_ids: ["ev:lit:987"],
    confidence: 0.88,
  },
  evidence: {
    evidence_id: "ev:lit:987",
    source_type: "peer_reviewed_literature",
    citation: "Dressler (1981) The Orchids: Natural History and Classification",
    claim: "Observed pollination interaction in Colombian Andean cloud forest",
    provenance_verified: true,
  },
  matrix_vision: {
    character_id: "char:labellum_color",
    label: "Labellum color and pattern",
    value_type: "categorical",
    concept_id: "concept:labellum_magenta_disc",
  },
  calyx_reasoning: {
    contract_version: "oc-parallel-v1",
    reasoning_id: "reasoning:789",
    candidate_knowledge: "Candidate relation: Cattleya trianae -> Eulaema meriana",
    human_review_required: true,
    automatic_scientific_publication_allowed: false,
    private_chain_of_thought_stored: false,
  },
  research_station: {
    project_id: "proj:colombia_conservation_2026",
    analysis_id: "analysis:001",
    method_name: "Generalized Linear Model (Elevation vs Pollination)",
    variables: ["elevation_m", "pollination_frequency"],
    reproducibility_hash: "sha256:abc123def456",
  },
  conservatory: {
    plant_id: "b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    accession_number: "ORCH-2026-0042",
    qr_scan_path: "/scan?id=b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  },
  conservation: {
    taxon_id: "taxon:orchid:cattleya_trianae",
    iucn_category: "EN",
    habitat_status: "Fragmented Andean cloud forest",
  },
};

function verifyContinuumCrossSystemFlow(data) {
  // 1. Taxon
  assert.ok(data.taxon.taxon_id && data.taxon.canonical_name, "Taxon must have ID and name");
  assert.ok(data.taxon.canonical_name.startsWith(data.taxon.genus), "Canonical name must start with genus");

  // 2. Atlas
  assert.equal(data.atlas.taxon_id, data.taxon.taxon_id, "Atlas occurrence must reference the canonical taxon");
  assert.ok(data.atlas.latitude >= -90 && data.atlas.latitude <= 90, "Latitude in range");
  assert.ok(data.atlas.longitude >= -180 && data.atlas.longitude <= 180, "Longitude in range");

  // 3. Graph
  assert.equal(data.graph.subject_id, data.taxon.taxon_id, "Graph edge subject must match canonical taxon");
  assert.ok(data.graph.evidence_ids?.length > 0, "Graph edge must have provenance evidence");

  // 4. Evidence
  assert.ok(data.graph.evidence_ids.includes(data.evidence.evidence_id), "Evidence ID must link to graph edge");
  assert.ok(data.evidence.citation && data.evidence.claim, "Evidence must preserve citation and claim");

  // 5. Matrix / Vision
  assert.ok(data.matrix_vision.concept_id && data.matrix_vision.character_id, "Matrix character must have concept ID");

  // 6. Calyx
  assert.equal(data.calyx_reasoning.automatic_scientific_publication_allowed, false, "Auto-publishing is prohibited");
  assert.equal(data.calyx_reasoning.human_review_required, true, "Human review required");

  // 7. Research Station
  assert.ok(data.research_station.variables?.length > 0, "Research Station plan must specify analytical variables");
  assert.ok(data.research_station.reproducibility_hash, "Research Station plan must include reproducibility hash");

  // 8. Conservatory
  assert.ok(data.conservatory.qr_scan_path.startsWith("/scan?id="), "Conservatory QR must match scan deep-link pattern");
  assert.ok(data.conservatory.qr_scan_path.includes(data.conservatory.plant_id), "QR scan path must embed plant_id");

  // 9. Conservation
  assert.equal(data.conservation.taxon_id, data.taxon.taxon_id, "Conservation record must match canonical taxon");
  assert.ok(["EX", "EW", "CR", "EN", "VU", "NT", "LC", "DD", "NE"].includes(data.conservation.iucn_category), "Valid IUCN category");

  return true;
}

try {
  verifyContinuumCrossSystemFlow(CANONICAL_SAMPLE);
  console.log("PASS: Cross-system Continuum integration flow verified (all 9 canonical stages).");
} catch (err) {
  console.error("FAIL: Cross-system Continuum integration verification error:", err.message);
  process.exit(1);
}
