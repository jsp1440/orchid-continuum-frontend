// src/lib/relationshipExplorer.ts
// BUILD 203D — Safe MVP payload wiring.
// These fallback payloads mirror oc_api.relationship_explorer_mvp_payload_safe_v1.
// The live API endpoint is attempted first; the safe payload keeps the UI useful
// until /api/relationship-explorer/species/{name} is fully deployed.

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://orchid-continuum-public-api.onrender.com";

export interface CardAvailability {
  species_profile: boolean;
  atlas_summary: boolean;
  image_gallery: boolean;
  interaction_summary: boolean;
  interaction_panel: boolean;
  reasoning: boolean;
  mycorrhiza_claims: boolean;
  fungal_dependency: boolean;
}

export interface SpeciesProfile {
  scientific_name: string;
  genus: string | null;
  species_epithet: string | null;
  author: string | null;
  common_name: string | null;
  description: string | null;
}

export interface AtlasSummary {
  occurrence_count: number | null;
  atlas_readiness: string | null;
  atlas_confidence_score: number | null;
  countries: string[] | null;
  elevation_range: string | null;
}

export interface GalleryImage {
  url: string;
  caption: string | null;
  credit: string | null;
}

export interface MycorrhizaClaim {
  fungal_taxon: string | null;
  relationship_type: string | null;
  evidence: string | null;
  source: string | null;
}

export interface FungalDependency {
  dependency_level: string | null;
  notes: string | null;
}

export interface ReasoningItem {
  statement: string;
  confidence: string | null;
  basis: string | null;
}

export interface InteractionRecord {
  partner: string | null;
  interaction_type: string | null;
  source: string | null;
}

export interface RelationshipExplorerPayload {
  scientific_name: string;
  cards: CardAvailability;
  species_profile: SpeciesProfile | null;
  atlas_summary: AtlasSummary | null;
  image_gallery: GalleryImage[] | null;
  mycorrhiza_claims: MycorrhizaClaim[] | null;
  fungal_dependency: FungalDependency | null;
  reasoning: ReasoningItem[] | null;
  interaction_summary: InteractionRecord[] | null;
  source: "api" | "safe-mvp" | "mock";
}

export const TEST_SPECIES = [
  "Angraecum sesquipedale",
  "Dendrobium anosmum",
  "Cattleya maxima",
  "Dracula vampira",
];

function emptyCards(): CardAvailability {
  return {
    species_profile: false,
    atlas_summary: false,
    image_gallery: false,
    interaction_summary: false,
    interaction_panel: false,
    reasoning: false,
    mycorrhiza_claims: false,
    fungal_dependency: false,
  };
}

function emptyPayload(name: string, source: "api" | "safe-mvp" | "mock" = "mock"): RelationshipExplorerPayload {
  const [genus, speciesEpithet] = name.split(" ");
  return {
    scientific_name: name,
    cards: { ...emptyCards(), species_profile: !!name },
    species_profile: name
      ? {
          scientific_name: name,
          genus: genus || null,
          species_epithet: speciesEpithet || null,
          author: null,
          common_name: null,
          description: null,
        }
      : null,
    atlas_summary: null,
    image_gallery: null,
    mycorrhiza_claims: null,
    fungal_dependency: null,
    reasoning: null,
    interaction_summary: null,
    source,
  };
}

function mockImages(label: string, n: number): GalleryImage[] {
  return Array.from({ length: Math.min(n, 12) }).map((_, index) => ({
    url: `https://placehold.co/900x650/12351f/f6f0dc?text=${encodeURIComponent(label)}+${index + 1}`,
    caption: `${label} — image endpoint available (${n.toLocaleString()} images in Continuum)`,
    credit: "Preview placeholder until live image payload is exposed by API",
  }));
}

function normalizePayload(name: string, raw: any): RelationshipExplorerPayload {
  if (!raw || typeof raw !== "object") return emptyPayload(name);

  const fallback = SAFE_MVP_PAYLOADS[name.toLowerCase()] || emptyPayload(name, "api");
  const cards: CardAvailability =
    raw.cards && typeof raw.cards === "object"
      ? { ...emptyCards(), ...raw.cards }
      : raw.mvp_card_status && typeof raw.mvp_card_status === "object"
        ? { ...emptyCards(), ...raw.mvp_card_status }
        : fallback.cards;

  return {
    scientific_name: raw.scientific_name || fallback.scientific_name || name,
    cards,
    species_profile: raw.species_profile ?? fallback.species_profile,
    atlas_summary: raw.atlas_summary ?? fallback.atlas_summary,
    image_gallery: Array.isArray(raw.image_gallery) ? raw.image_gallery : fallback.image_gallery,
    mycorrhiza_claims: Array.isArray(raw.mycorrhiza_claims) ? raw.mycorrhiza_claims : fallback.mycorrhiza_claims,
    fungal_dependency: raw.fungal_dependency ?? fallback.fungal_dependency,
    reasoning: Array.isArray(raw.reasoning) ? raw.reasoning : fallback.reasoning,
    interaction_summary: Array.isArray(raw.interaction_summary) ? raw.interaction_summary : fallback.interaction_summary,
    source: "api",
  };
}

export async function fetchRelationshipExplorerPayload(scientificName: string): Promise<RelationshipExplorerPayload> {
  const name = decodeURIComponent(scientificName || "Angraecum sesquipedale").trim();
  if (!name) return emptyPayload("");

  try {
    const response = await fetch(
      `${API_BASE}/api/relationship-explorer/species/${encodeURIComponent(name)}`,
      { headers: { Accept: "application/json" } },
    );
    if (response.ok) {
      const raw = await response.json();
      return normalizePayload(name, raw);
    }
  } catch {
    // The safe MVP fallback below is intentional.
  }

  return SAFE_MVP_PAYLOADS[name.toLowerCase()] || emptyPayload(name);
}

const SAFE_MVP_PAYLOADS: Record<string, RelationshipExplorerPayload> = {
  "angraecum sesquipedale": {
    scientific_name: "Angraecum sesquipedale",
    source: "safe-mvp",
    cards: {
      species_profile: true,
      atlas_summary: true,
      image_gallery: true,
      interaction_summary: false,
      interaction_panel: false,
      reasoning: true,
      mycorrhiza_claims: true,
      fungal_dependency: true,
    },
    species_profile: {
      scientific_name: "Angraecum sesquipedale",
      genus: "Angraecum",
      species_epithet: "sesquipedale",
      author: "Thouars",
      common_name: "Darwin's orchid / Comet orchid",
      description:
        "Safe MVP payload from Build 203C: images, atlas signal, reasoning, mycorrhizal claims, and fungal dependency are available.",
    },
    atlas_summary: {
      occurrence_count: 1,
      atlas_readiness: "atlas_seed",
      atlas_confidence_score: 0.024,
      countries: null,
      elevation_range: null,
    },
    image_gallery: mockImages("Angraecum sesquipedale", 101),
    mycorrhiza_claims: [
      {
        fungal_taxon: "fungal partner candidate",
        relationship_type: "orchid mycorrhiza",
        evidence: "2 mycorrhizal literature claims are available in the Continuum safe payload.",
        source: "oc_ecology.literature_mycorrhiza_symbiosis_claims",
      },
    ],
    fungal_dependency: {
      dependency_level: "seed/protocorm dependency",
      notes: "1 fungal dependency evidence record is attached for seed/protocorm orchid mycorrhiza.",
    },
    reasoning: [
      {
        statement:
          "This species represents a high-value reasoning example connecting floral specialization, pollinator prediction, coevolution, and island biogeography.",
        confidence: "moderate_reasoning_confidence · score 0.567",
        basis:
          "Build 203C safe payload: reasoning_density=high_reasoning_density; fired_rule_count=5; validation pathway compares spur length, pollinator proboscis length, distribution, and literature evidence.",
      },
    ],
    interaction_summary: null,
  },

  "dendrobium anosmum": {
    scientific_name: "Dendrobium anosmum",
    source: "safe-mvp",
    cards: {
      species_profile: true,
      atlas_summary: true,
      image_gallery: true,
      interaction_summary: true,
      interaction_panel: true,
      reasoning: false,
      mycorrhiza_claims: false,
      fungal_dependency: false,
    },
    species_profile: {
      scientific_name: "Dendrobium anosmum",
      genus: "Dendrobium",
      species_epithet: "anosmum",
      author: null,
      common_name: "Fragrant dendrobium",
      description:
        "Safe MVP payload from Build 203C: this is the current best pollinator/interaction test species for the Relationship Explorer.",
    },
    atlas_summary: {
      occurrence_count: 0,
      atlas_readiness: "needs_occurrence_data",
      atlas_confidence_score: 0,
      countries: null,
      elevation_range: null,
    },
    image_gallery: mockImages("Dendrobium anosmum", 108),
    mycorrhiza_claims: null,
    fungal_dependency: null,
    reasoning: null,
    interaction_summary: [
      {
        partner: "interaction partner available",
        interaction_type: "display-ready interaction signal",
        source:
          "oc_api.v_species_globi_interaction_summary_v1 · total_display_ready_interactions=1 · distinct_partner_taxa=1",
      },
    ],
  },

  "cattleya maxima": {
    scientific_name: "Cattleya maxima",
    source: "safe-mvp",
    cards: {
      species_profile: true,
      atlas_summary: true,
      image_gallery: true,
      interaction_summary: false,
      interaction_panel: false,
      reasoning: false,
      mycorrhiza_claims: true,
      fungal_dependency: false,
    },
    species_profile: {
      scientific_name: "Cattleya maxima",
      genus: "Cattleya",
      species_epithet: "maxima",
      author: "Lindl.",
      common_name: null,
      description:
        "Safe MVP payload from Build 203C: atlas, images, and one mycorrhizal literature claim are available.",
    },
    atlas_summary: {
      occurrence_count: 2,
      atlas_readiness: "atlas_seed",
      atlas_confidence_score: 0.048,
      countries: null,
      elevation_range: null,
    },
    image_gallery: mockImages("Cattleya maxima", 67),
    mycorrhiza_claims: [
      {
        fungal_taxon: "fungal partner candidate",
        relationship_type: "orchid mycorrhiza",
        evidence: "1 mycorrhizal literature claim is available in the Continuum safe payload.",
        source: "oc_ecology.literature_mycorrhiza_symbiosis_claims",
      },
    ],
    fungal_dependency: null,
    reasoning: null,
    interaction_summary: null,
  },

  "dracula vampira": {
    scientific_name: "Dracula vampira",
    source: "safe-mvp",
    cards: {
      species_profile: true,
      atlas_summary: true,
      image_gallery: true,
      interaction_summary: false,
      interaction_panel: false,
      reasoning: false,
      mycorrhiza_claims: false,
      fungal_dependency: false,
    },
    species_profile: {
      scientific_name: "Dracula vampira",
      genus: "Dracula",
      species_epithet: "vampira",
      author: "(Luer) Luer",
      common_name: null,
      description:
        "Safe MVP payload from Build 203C: atlas signal and image coverage are available; interaction and fungal layers are not populated yet.",
    },
    atlas_summary: {
      occurrence_count: 7,
      atlas_readiness: "atlas_partial",
      atlas_confidence_score: 0.168,
      countries: null,
      elevation_range: null,
    },
    image_gallery: mockImages("Dracula vampira", 14),
    mycorrhiza_claims: null,
    fungal_dependency: null,
    reasoning: null,
    interaction_summary: null,
  },
};
