// src/lib/relationshipExplorer.ts
// Isolated data access for the Relationship Explorer MVP (BUILD 203A).
// Tries the preferred backend endpoint first; falls back to internal
// MOCK_PAYLOADS (Build 202E summary) so the UI is reviewable immediately.

const API_BASE = "https://orchid-continuum-public-api.onrender.com";

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
  source: "api" | "mock";
}

export const TEST_SPECIES = [
  "Dracula vampira",
  "Cattleya maxima",
  "Angraecum sesquipedale",
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

function emptyPayload(name: string, source: "api" | "mock" = "mock"): RelationshipExplorerPayload {
  return {
    scientific_name: name,
    cards: { ...emptyCards(), species_profile: !!name },
    species_profile: name
      ? {
          scientific_name: name,
          genus: name.split(" ")[0] || null,
          species_epithet: name.split(" ")[1] || null,
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

// Defensively map an unknown API response into our payload shape.
function normalizePayload(name: string, raw: any, source: "api" | "mock"): RelationshipExplorerPayload {
  if (!raw || typeof raw !== "object") return emptyPayload(name, source);

  const cards: CardAvailability =
    raw.cards && typeof raw.cards === "object"
      ? { ...emptyCards(), ...raw.cards }
      : {
          ...emptyCards(),
          species_profile: !!(raw.species_profile || name),
          atlas_summary: !!raw.atlas_summary,
          image_gallery: Array.isArray(raw.image_gallery) && raw.image_gallery.length > 0,
          reasoning: Array.isArray(raw.reasoning) && raw.reasoning.length > 0,
          mycorrhiza_claims: Array.isArray(raw.mycorrhiza_claims) && raw.mycorrhiza_claims.length > 0,
          fungal_dependency: !!raw.fungal_dependency,
          interaction_summary: Array.isArray(raw.interaction_summary) && raw.interaction_summary.length > 0,
          interaction_panel: !!raw.interaction_panel,
        };

  return {
    scientific_name: raw.scientific_name || name,
    cards,
    species_profile: raw.species_profile ?? emptyPayload(name).species_profile,
    atlas_summary: raw.atlas_summary ?? null,
    image_gallery: Array.isArray(raw.image_gallery) ? raw.image_gallery : null,
    mycorrhiza_claims: Array.isArray(raw.mycorrhiza_claims) ? raw.mycorrhiza_claims : null,
    fungal_dependency: raw.fungal_dependency ?? null,
    reasoning: Array.isArray(raw.reasoning) ? raw.reasoning : null,
    interaction_summary: Array.isArray(raw.interaction_summary) ? raw.interaction_summary : null,
    source,
  };
}

export async function fetchRelationshipExplorerPayload(
  scientificName: string
): Promise<RelationshipExplorerPayload> {
  const name = (scientificName || "").trim();
  if (!name) return emptyPayload("");

  // 1. Try the preferred backend endpoint (auto-upgrades when wired).
  try {
    const res = await fetch(
      `${API_BASE}/api/relationship-explorer/species/${encodeURIComponent(name)}`,
      { headers: { Accept: "application/json" } }
    );
    if (res.ok) {
      const raw = await res.json();
      return normalizePayload(name, raw, "api");
    }
  } catch {
    // Endpoint not available yet — fall through to mock.
  }

  // 2. Fallback: internal mock payloads for review.
  const key = name.toLowerCase();
  if (MOCK_PAYLOADS[key]) return MOCK_PAYLOADS[key];

  // 3. Unknown species — minimal graceful payload.
  return emptyPayload(name);
}

// ---------------------------------------------------------------------------
// MOCK_PAYLOADS — mirrors the Build 202E card-availability summary.
// Replace with live API once /api/relationship-explorer is deployed.
// ---------------------------------------------------------------------------

function mockImages(label: string, n: number): GalleryImage[] {
  const tone = "3b7a57";
  return Array.from({ length: n }).map((_, i) => ({
    url: `https://placehold.co/400x300/${tone}/ffffff?text=${encodeURIComponent(label)}+${i + 1}`,
    caption: `${label} — preview image ${i + 1}`,
    credit: "Preview placeholder",
  }));
}

const MOCK_PAYLOADS: Record<string, RelationshipExplorerPayload> = {
  "dracula vampira": {
    scientific_name: "Dracula vampira",
    source: "mock",
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
      common_name: "Vampire orchid",
      description:
        "A cloud-forest epiphyte endemic to Ecuador, known for its dramatic dark, near-black flowers and long caudate sepals.",
    },
    atlas_summary: {
      occurrence_count: 142,
      atlas_readiness: "Moderate",
      atlas_confidence_score: 0.61,
      countries: ["Ecuador"],
      elevation_range: "1,800–2,300 m",
    },
    image_gallery: mockImages("Dracula vampira", 6),
    mycorrhiza_claims: null,
    fungal_dependency: null,
    reasoning: null,
    interaction_summary: null,
  },

  "cattleya maxima": {
    scientific_name: "Cattleya maxima",
    source: "mock",
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
      common_name: "Christmas orchid",
      description:
        "A showy epiphytic/lithophytic Cattleya distributed along the Pacific slopes of Ecuador, Colombia, and Peru.",
    },
    atlas_summary: {
      occurrence_count: 1187,
      atlas_readiness: "High",
      atlas_confidence_score: 0.84,
      countries: ["Ecuador", "Colombia", "Peru"],
      elevation_range: "0–1,500 m",
    },
    image_gallery: mockImages("Cattleya maxima", 8),
    mycorrhiza_claims: [
      {
        fungal_taxon: "Tulasnella spp.",
        relationship_type: "Mycorrhizal association",
        evidence: "Recovered from root pelotons in cultivated and wild material.",
        source: "Mock — Build 202E mycorrhiza_claims",
      },
    ],
    fungal_dependency: null,
    reasoning: null,
    interaction_summary: null,
  },

  "angraecum sesquipedale": {
    scientific_name: "Angraecum sesquipedale",
    source: "mock",
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
        "A Madagascan epiphyte famous for its very long nectar spur, which prompted Darwin's prediction of a matching long-tongued pollinator.",
    },
    atlas_summary: {
      occurrence_count: 318,
      atlas_readiness: "High",
      atlas_confidence_score: 0.79,
      countries: ["Madagascar"],
      elevation_range: "0–100 m",
    },
    image_gallery: mockImages("Angraecum sesquipedale", 9),
    mycorrhiza_claims: [
      {
        fungal_taxon: "Tulasnellaceae",
        relationship_type: "Mycorrhizal association",
        evidence: "Family-level association reported for Angraecoid orchids.",
        source: "Mock — Build 202E mycorrhiza_claims",
      },
    ],
    fungal_dependency: {
      dependency_level: "High",
      notes:
        "Germination and early seedling establishment are fungus-dependent, consistent with epiphytic angraecoids.",
    },
    reasoning: [
      {
        statement:
          "The exceptionally long nectar spur predicts a long-tongued hawkmoth pollinator.",
        confidence: "High",
        basis:
          "Morphological spur length matched to Xanthopan morganii praedicta (Darwin/Wallace prediction, later confirmed).",
      },
    ],
    interaction_summary: null,
  },
};
