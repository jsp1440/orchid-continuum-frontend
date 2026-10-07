/**
 * Lance Field Kit — Atlas projection.
 *
 * The one place a field observation becomes an Atlas-shaped occurrence. The
 * rule is absolute: only records the observer explicitly marked `public`
 * produce coordinates at all, and those coordinates were already coarsened
 * to ~11 km at creation (see fieldDrafts.applyLocalityProtection). Private
 * and research-restricted records return null — for the Atlas they do not
 * exist. Backend records also carry scientific_status "observer_report" and
 * knowledge_graph_publication "blocked_pending_human_scientific_review", so
 * curation remains a second gate downstream.
 */

import type { FieldDraft } from "@/lib/fieldDrafts";

export type AtlasOccurrencePreview = {
  source: "field_journal";
  /** Backend observation id when synced, else the durable local draft id. */
  observationRef: string;
  /** Canonical name only when the public API matched one; otherwise the
   *  record is UNIDENTIFIED and carries no name. */
  canonicalName: string | null;
  taxonomyId: string | null;
  latitude: number;
  longitude: number;
  coordinatePrecision: "coarsened_0.1deg";
  localityVisibility: "public";
  scientificStatus: "observer_report";
  occursAt: string;
  observerName: string | null;
};

/**
 * Project a draft to an Atlas-compatible occurrence, or null when locality
 * protection withholds it. Never throws: an Atlas that cannot show a record
 * safely simply does not show it.
 */
export function toAtlasOccurrencePreview(draft: FieldDraft): AtlasOccurrencePreview | null {
  if (draft.localityVisibility !== "public") return null;
  if (!draft.coordinates) return null;
  const { latitude, longitude } = draft.coordinates;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  return {
    source: "field_journal",
    observationRef: draft.backendObservationId ?? draft.id,
    canonicalName: draft.taxonomyMatch?.canonicalName ?? null,
    taxonomyId: draft.taxonomyMatch?.taxonomyId ?? null,
    latitude,
    longitude,
    coordinatePrecision: "coarsened_0.1deg",
    localityVisibility: "public",
    scientificStatus: "observer_report",
    occursAt: draft.createdAt,
    observerName: draft.observerName,
  };
}

/** Atlas-facing list projection: withholds everything protected. */
export function toAtlasOccurrencePreviews(drafts: readonly FieldDraft[]): AtlasOccurrencePreview[] {
  return drafts
    .map(toAtlasOccurrencePreview)
    .filter((item): item is AtlasOccurrencePreview => item !== null);
}
