// src/lib/relationshipExplorer.ts
// Relationship Explorer client. Fails closed: a field the API does not return
// stays null, and a failed, missing, or unreadable response is reported by
// `status` and never replaced with canned relationship content. The image
// gallery is separate: it comes from the live trusted genus image library and
// image_gallery is only marked true when real image URLs are available.

import { binomialOf, fetchGenusImagesWithSource, type GenusImage } from "@/lib/genusData";
import { isJsonContentType, isUsableApiOrigin } from "@/lib/api";
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
   * "api" only when the relationship service answered with a readable payload
   * (status "ok"). "none" for every other status. "safe-mvp" and "mock" are
   * retained in the type for older consumers and are no longer produced.
   */
  source: "api" | "safe-mvp" | "mock" | "none";
  /** Outcome of the relationship-service request. See RelationshipExplorerStatus. */
  status: RelationshipExplorerStatus;
}

/**
 * These states are distinct and must stay distinct:
 * - ok:          the service returned a JSON object; null fields mean the
 *                service returned nothing for them.
 * - not_found:   the service answered 404 for this name.
 * - unavailable: the service could not be checked (transport failure, non-404
 *                error status, or no usable API origin). Says nothing about
 *                whether records exist.
 * - invalid:     a response arrived but was not a readable JSON object (for
 *                example the SPA shell served as a 200), a rendered list held
 *                an element that is not an object, or no name was given.
 */
export type RelationshipExplorerStatus = "ok" | "not_found" | "unavailable" | "invalid";

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

function emptyPayload(
  name: string,
  status: RelationshipExplorerStatus,
): RelationshipExplorerPayload {
  return {
    scientific_name: name,
    cards: emptyCards(),
    species_profile: null,
    atlas_summary: null,
    image_gallery: null,
    mycorrhiza_claims: null,
    fungal_dependency: null,
    reasoning: null,
    interaction_summary: null,
    source: status === "ok" ? "api" : "none",
    status,
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function objectOrNull<T>(value: unknown): T | null {
  return isPlainObject(value) ? (value as T) : null;
}

function arrayOrNull<T>(value: unknown): T[] | null {
  return Array.isArray(value) ? (value as T[]) : null;
}

/**
 * The page reads properties of every element of mycorrhiza_claims,
 * interaction_summary and reasoning, so each element has to be an object.
 * One element that is not makes the whole body unreadable: dropping it would
 * silently shorten the list the service sent.
 */
function hasOnlyObjectElements(value: unknown[] | null): boolean {
  return value === null || value.every(isPlainObject);
}

/** reasoning[].statement is rendered as-is, so it cannot be an object or array. */
function hasRenderableStatement(item: unknown): boolean {
  const statement = (item as { statement?: unknown }).statement;
  return statement === null || typeof statement !== "object";
}

/**
 * Normalize a live API body. Nothing is filled in from anywhere else: a field
 * the API omits, returns as null, or returns with the wrong shape stays null,
 * and a card flag is true only when the API did not mark it false and its
 * field actually carries content. Returns null (reported as "invalid") when
 * the body is not an object or a rendered list holds an unreadable element.
 */
function normalizePayload(name: string, raw: unknown): RelationshipExplorerPayload | null {
  if (!isPlainObject(raw)) return null;

  const payload = raw as RelationshipExplorerApiPayload;
  const apiCards: Partial<CardAvailability> = isPlainObject(payload.cards)
    ? payload.cards
    : isPlainObject(payload.mvp_card_status)
      ? payload.mvp_card_status
      : {};
  const allowed = (key: keyof CardAvailability) => apiCards[key] !== false;

  const speciesProfile = objectOrNull<SpeciesProfile>(payload.species_profile);
  const atlasSummary = objectOrNull<AtlasSummary>(payload.atlas_summary);
  const mycorrhizaClaims = arrayOrNull<MycorrhizaClaim>(payload.mycorrhiza_claims);
  const fungalDependency = objectOrNull<FungalDependency>(payload.fungal_dependency);
  const reasoning = arrayOrNull<ReasoningItem>(payload.reasoning);
  const interactionSummary = arrayOrNull<InteractionRecord>(payload.interaction_summary);
  const imageGallery = cleanGallery(arrayOrNull<GalleryImage>(payload.image_gallery));

  if (
    !hasOnlyObjectElements(mycorrhizaClaims) ||
    !hasOnlyObjectElements(interactionSummary) ||
    !hasOnlyObjectElements(reasoning) ||
    !(reasoning ?? []).every(hasRenderableStatement)
  ) {
    return null;
  }

  return {
    scientific_name:
      typeof payload.scientific_name === "string" && payload.scientific_name.trim()
        ? payload.scientific_name
        : name,
    cards: {
      species_profile: allowed("species_profile") && speciesProfile !== null,
      atlas_summary: allowed("atlas_summary") && atlasSummary !== null,
      image_gallery: imageGallery.length > 0,
      interaction_summary: allowed("interaction_summary") && !!interactionSummary?.length,
      interaction_panel: apiCards.interaction_panel === true && !!interactionSummary?.length,
      reasoning: allowed("reasoning") && !!reasoning?.length,
      mycorrhiza_claims: allowed("mycorrhiza_claims") && !!mycorrhizaClaims?.length,
      fungal_dependency: allowed("fungal_dependency") && fungalDependency !== null,
    },
    species_profile: speciesProfile,
    atlas_summary: atlasSummary,
    image_gallery: imageGallery.length ? imageGallery : null,
    mycorrhiza_claims: mycorrhizaClaims,
    fungal_dependency: fungalDependency,
    reasoning,
    interaction_summary: interactionSummary,
    source: "api",
    status: "ok",
  };
}

async function requestRelationshipPayload(name: string): Promise<RelationshipExplorerPayload> {
  // A relative or malformed base would resolve to the SPA shell; treat it as
  // a service that cannot be checked rather than issuing the request.
  if (!isUsableApiOrigin(API_BASE)) return emptyPayload(name, "unavailable");

  let response: Response;
  try {
    response = await fetch(
      `${API_BASE}/api/relationship-explorer/species/${encodeURIComponent(name)}`,
      { headers: { Accept: "application/json" } },
    );
  } catch {
    return emptyPayload(name, "unavailable");
  }

  if (response.status === 404) return emptyPayload(name, "not_found");
  if (!response.ok) return emptyPayload(name, "unavailable");
  // A 200 that is not JSON is the SPA shell or a proxy page, not an answer.
  if (!isJsonContentType(response.headers.get("content-type"))) return emptyPayload(name, "invalid");

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return emptyPayload(name, "invalid");
  }
  return normalizePayload(name, raw) ?? emptyPayload(name, "invalid");
}

/**
 * Always resolves; inspect `status` before reading the evidence fields. The
 * image gallery is looked up from the genus image library for every status,
 * because it does not depend on the relationship service.
 */
export async function fetchRelationshipExplorerPayload(scientificName: string): Promise<RelationshipExplorerPayload> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(scientificName || "Angraecum sesquipedale");
  } catch {
    return emptyPayload(scientificName, "invalid");
  }
  const name = decoded.trim();
  if (!name) return emptyPayload("", "invalid");

  return withLiveGallery(await requestRelationshipPayload(name));
}
