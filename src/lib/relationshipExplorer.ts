// src/lib/relationshipExplorer.ts
// Relationship Explorer payload loader.
//
// SCIENTIFIC-INTEGRITY CONTRACT: every field shown comes from the live
// relationship-explorer API (source "api") or is null. There is NO local
// fallback payload: fields the API omits stay null (the page renders an
// explicit "not available" state), and a failed / non-JSON request resolves to
// an empty payload with source "unavailable". Fallback data is never merged
// into an API response and never relabelled source "api". The image gallery
// may be filled separately from the live Orchid Continuum genus image library,
// each image keeping its own source/licence credit.

import { binomialOf, fetchGenusImagesWithSource, type GenusImage } from "@/lib/genusData";

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
  /**
   * "api" — the relationship-explorer API answered; only its fields are shown.
   * "unavailable" — the API did not answer (network error, non-2xx, or a body
   * that is not a JSON object); every relationship field is null.
   */
  source: RelationshipExplorerSource;
}

export type RelationshipExplorerSource = "api" | "unavailable";

type RelationshipExplorerApiPayload = Partial<
  Omit<RelationshipExplorerPayload, "cards" | "source">
> & {
  cards?: Partial<CardAvailability>;
  mvp_card_status?: Partial<CardAvailability>;
};

export const TEST_SPECIES = [
  "Angraecum sesquipedale",
  "Dendrobium anosmum",
  "Cattleya maxima",
  "Dracula vampira",
];

const FAKE_OR_DOCUMENT_IMAGE_RE =
  /(placehold\.co|placeholder|mock|preview|herbari|specimen|voucher|sheet|barcode|holotype|isotype|lectotype|syntype|neotype|paratype|scan|plate|illustration|drawing|document|jstor|gbif\.org\/occurrence|biodiversitylibrary|archive\.org|botanicus|plants\.jstor|sweetgum\.nybg|sernec|idigbio|mnhn|recolnat|jacq|tropicos|mobot)/i;

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

/**
 * An empty payload for `name`. The species profile holds only the requested
 * name split into genus + epithet (no author, common name or description);
 * every relationship layer is null.
 */
function emptyPayload(name: string, source: RelationshipExplorerSource): RelationshipExplorerPayload {
  const [genus, speciesEpithet] = name.split(" ");
  return {
    scientific_name: name,
    cards: emptyCards(),
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

function cleanGallery(images: GalleryImage[] | null | undefined): GalleryImage[] {
  if (!Array.isArray(images)) return [];
  const seen = new Set<string>();
  const out: GalleryImage[] = [];
  for (const img of images) {
    const url = typeof img?.url === "string" ? img.url.trim() : "";
    const hay = [url, img?.caption, img?.credit].filter(Boolean).join(" ");
    if (!url || seen.has(url) || FAKE_OR_DOCUMENT_IMAGE_RE.test(hay)) continue;
    seen.add(url);
    out.push({
      url,
      caption: img.caption || null,
      credit: img.credit || null,
    });
  }
  return out;
}

function galleryFromGenusImages(scientificName: string, images: GenusImage[]): GalleryImage[] {
  const wanted = binomialOf(scientificName);
  const seenUrls = new Set<string>();
  const exact: GenusImage[] = [];
  const related: GenusImage[] = [];

  for (const img of images) {
    const b = binomialOf(img.scientific_name);
    if (wanted && b === wanted) exact.push(img);
    else related.push(img);
  }

  const ordered = [...exact, ...related];
  const out: GalleryImage[] = [];
  for (const img of ordered) {
    const urls = Array.isArray(img.image_urls) && img.image_urls.length
      ? img.image_urls
      : img.image_url
        ? [img.image_url]
        : [];

    for (const raw of urls) {
      const url = typeof raw === "string" ? raw.trim() : "";
      const hay = [url, img.scientific_name, img.image_source, img.image_license].filter(Boolean).join(" ");
      if (!url || seenUrls.has(url) || FAKE_OR_DOCUMENT_IMAGE_RE.test(hay)) continue;
      seenUrls.add(url);
      out.push({
        url,
        caption: img.scientific_name || scientificName,
        credit: [img.image_source, img.image_license].filter(Boolean).join(" · ") || "Orchid Continuum image library",
      });
      break;
    }

    if (out.length >= 12) break;
  }
  return out;
}

async function withLiveGallery(payload: RelationshipExplorerPayload): Promise<RelationshipExplorerPayload> {
  const cleanedExisting = cleanGallery(payload.image_gallery);
  if (cleanedExisting.length > 0) {
    return {
      ...payload,
      image_gallery: cleanedExisting,
      cards: { ...payload.cards, image_gallery: true },
    };
  }

  const genus = payload.species_profile?.genus || payload.scientific_name.split(/\s+/)[0];
  if (!genus) {
    return {
      ...payload,
      image_gallery: null,
      cards: { ...payload.cards, image_gallery: false },
    };
  }

  try {
    const { images } = await fetchGenusImagesWithSource(genus, undefined, 60);
    const liveGallery = galleryFromGenusImages(payload.scientific_name, images);
    return {
      ...payload,
      image_gallery: liveGallery.length ? liveGallery : null,
      cards: { ...payload.cards, image_gallery: liveGallery.length > 0 },
    };
  } catch {
    return {
      ...payload,
      image_gallery: null,
      cards: { ...payload.cards, image_gallery: false },
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Card availability derived only from what the API payload actually holds. */
function cardsFromPayload(payload: Omit<RelationshipExplorerPayload, "cards" | "source">): CardAvailability {
  return {
    species_profile: !!payload.species_profile,
    atlas_summary: !!payload.atlas_summary,
    image_gallery: !!payload.image_gallery?.length,
    interaction_summary: !!payload.interaction_summary?.length,
    interaction_panel: !!payload.interaction_summary?.length,
    reasoning: !!payload.reasoning?.length,
    mycorrhiza_claims: !!payload.mycorrhiza_claims?.length,
    fungal_dependency: !!payload.fungal_dependency,
  };
}

/**
 * Normalise an API response. Fields the API omitted stay null; nothing is
 * filled in from a local fallback. Returns null when the body is unusable.
 */
export function normalizePayload(name: string, raw: unknown): RelationshipExplorerPayload | null {
  if (!isRecord(raw)) return null;

  const payload = raw as RelationshipExplorerApiPayload;
  const recognizedFields = [
    "scientific_name",
    "species_profile",
    "atlas_summary",
    "image_gallery",
    "mycorrhiza_claims",
    "fungal_dependency",
    "reasoning",
    "interaction_summary",
    "cards",
    "mvp_card_status",
  ];
  if (!recognizedFields.some((key) => Object.prototype.hasOwnProperty.call(payload, key))) return null;
  const imageGallery = cleanGallery(Array.isArray(payload.image_gallery) ? payload.image_gallery : null);

  const fields = {
    scientific_name: typeof payload.scientific_name === "string" && payload.scientific_name.trim()
      ? payload.scientific_name
      : name,
    species_profile: isRecord(payload.species_profile) ? (payload.species_profile as SpeciesProfile) : null,
    atlas_summary: isRecord(payload.atlas_summary) ? (payload.atlas_summary as AtlasSummary) : null,
    image_gallery: imageGallery.length ? imageGallery : null,
    mycorrhiza_claims: Array.isArray(payload.mycorrhiza_claims) ? payload.mycorrhiza_claims : null,
    fungal_dependency: isRecord(payload.fungal_dependency) ? (payload.fungal_dependency as FungalDependency) : null,
    reasoning: Array.isArray(payload.reasoning) ? payload.reasoning : null,
    interaction_summary: Array.isArray(payload.interaction_summary) ? payload.interaction_summary : null,
  };

  // Availability flags may come from the API, but a flag can never claim a
  // layer the payload does not actually carry.
  const derived = cardsFromPayload(fields);
  const declared = isRecord(payload.cards)
    ? payload.cards
    : isRecord(payload.mvp_card_status)
      ? payload.mvp_card_status
      : null;
  const cards: CardAvailability = declared
    ? (Object.fromEntries(
        (Object.keys(derived) as Array<keyof CardAvailability>).map((key) => [
          key,
          derived[key] && declared[key] !== false,
        ]),
      ) as unknown as CardAvailability)
    : derived;

  return { ...fields, cards, source: "api" };
}

export async function fetchRelationshipExplorerPayload(scientificName: string): Promise<RelationshipExplorerPayload> {
  const name = decodeURIComponent(scientificName || "Angraecum sesquipedale").trim();
  if (!name) return emptyPayload("", "unavailable");

  try {
    const response = await fetch(
      `${API_BASE}/api/relationship-explorer/species/${encodeURIComponent(name)}`,
      { headers: { Accept: "application/json" } },
    );
    if (response.ok) {
      const normalized = normalizePayload(name, await response.json());
      if (normalized) return withLiveGallery(normalized);
    }
  } catch {
    // Network / parse failure: fall through to the honest unavailable state.
  }

  return withLiveGallery(emptyPayload(name, "unavailable"));
}
