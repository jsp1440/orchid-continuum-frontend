import type { HomepageDocument, IdentificationResult, MatrixResult } from "@/lib/parallelPlatform";

export const homepageFixture: HomepageDocument = {
  contract_version: "oc-parallel-v1",
  title: "Orchid Continuum",
  mission: "Connect orchid biodiversity knowledge across species, places, evidence, and people.",
  sections: [
    { id: "mission", availability: "available", data: { headline: "Local roots. Global blooms." }, evidence: ["contract:mission"] },
    { id: "featured_genus", availability: "degraded", data: null, evidence: [], message: "Waiting for the canonical Featured Genus feed." },
    { id: "featured_species", availability: "degraded", data: null, evidence: [], message: "Waiting for an approved image and canonical species record." },
    { id: "evolution", availability: "degraded", data: null, evidence: [], message: "Evolutionary context is being assembled from the Knowledge Graph." },
    { id: "relationships", availability: "available", data: { route: "/relationship-matrix" }, evidence: ["contract:matrix"] },
    { id: "species", availability: "available", data: { route: "/species" }, evidence: ["route:species"] },
    { id: "conservation", availability: "degraded", data: null, evidence: [], message: "Conservation hotspot summaries are pending evidence coverage." },
    { id: "education", availability: "available", data: { route: "/university" }, evidence: ["route:university"] },
    { id: "current_activity", availability: "degraded", data: null, evidence: [], message: "Live Continuum activity is temporarily unavailable." },
  ],
  governance: {
    real_approved_imagery_only: true,
    provenance_required: true,
    uncertainty_required: true,
    client_scoring_allowed: false,
  },
};

export const matrixFixture: MatrixResult = {
  contract_version: "oc-parallel-v1",
  subject_taxon_id: "taxon:cattleya-labiata",
  object_taxon_id: "taxon:cattleya-warneri",
  score: 0.74,
  coverage: 0.545455,
  interpretation: "candidate_relationship",
  publication_authority: false,
  dimensions: [
    { name: "taxonomy", availability: "available", score: 0.9, weight: 2, confidence: 0.95, evidence: ["graph:shared-genus"] },
    { name: "morphology", availability: "available", score: 0.78, weight: 1, confidence: 0.75, evidence: ["trait:flower-form"] },
    { name: "ecology", availability: "degraded", score: 0.54, weight: 1, confidence: 0.35, evidence: [] },
    { name: "geography", availability: "available", score: 0.61, weight: 1, confidence: 0.7, evidence: ["occurrence:range-overlap"] },
    { name: "phenology", availability: "available", score: 0.72, weight: 1, confidence: 0.68, evidence: ["observation:bloom-months"] },
    { name: "pollinator", availability: "unavailable", score: null, weight: 1, confidence: null, evidence: [] },
    { name: "mycorrhiza", availability: "unavailable", score: null, weight: 1, confidence: null, evidence: [] },
    { name: "conservation", availability: "unavailable", score: null, weight: 1, confidence: null, evidence: [] },
    { name: "cultivation", availability: "available", score: 0.69, weight: 1, confidence: 0.55, evidence: ["culture:temperature"] },
    { name: "literature", availability: "unavailable", score: null, weight: 1, confidence: null, evidence: [] },
    { name: "knowledge_graph", availability: "available", score: 0.81, weight: 1, confidence: 0.82, evidence: ["graph:neighborhood"] },
  ],
};

export const identificationFixture: IdentificationResult = {
  contract_version: "oc-parallel-v1",
  observation_id: "observation:fixture-1",
  state: "ambiguous",
  verified_identity: null,
  publication_authority: false,
  next_best_observation: "fragrance_time",
  candidates: [
    {
      taxon_id: "taxon:angraecum-sesquipedale",
      scientific_name: "Angraecum sesquipedale",
      score: 0.82,
      support: ["white_flower", "long_spur", "star_shape"],
      conflicts: [],
      missing: ["fragrance_time"],
      evidence: ["taxonomy:accepted", "morphology:spur"],
      state: "candidate_suggestion",
    },
    {
      taxon_id: "taxon:angraecum-sororium",
      scientific_name: "Angraecum sororium",
      score: 0.58,
      support: ["white_flower", "star_shape"],
      conflicts: ["spur_length"],
      missing: ["fragrance_time"],
      evidence: ["taxonomy:accepted"],
      state: "candidate_suggestion",
    },
  ],
};
