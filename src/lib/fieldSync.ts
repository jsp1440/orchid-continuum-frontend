/**
 * Lance Field Kit — synchronization engine.
 *
 * Vertical slice: iPad draft → Calyx backend observation record
 * (`POST /api/field-observations`, contract `field-observations/v1`).
 *
 * Idempotency is structural, not best-effort:
 *  - every draft carries a durable local id (`draft.id`, a UUID minted at
 *    capture) which is sent as `client_draft_id`;
 *  - the backend derives the observation id deterministically from
 *    (observer, client_draft_id) and answers 200 with the existing record on
 *    replays, so retries, double-taps and re-syncs cannot duplicate;
 *  - a draft already carrying `backendObservationId` is never re-posted.
 *
 * Locality fail-closed: the backend contract rejects any payload key naming
 * coordinates, so the sync payload is built from an explicit allow-list and
 * never contains location data. Precise coordinates stay on the device and
 * in the export bundle only.
 *
 * Media bytes are NOT uploaded (no governed byte-storage endpoint exists
 * yet). Originals remain in IndexedDB after sync and the export bundle stays
 * available as the media recovery path.
 */

import {
  transitionFieldDraftSync,
  type FieldDraft,
  type FieldTaxonomyMatch,
} from "@/lib/fieldDrafts";
import { BACKEND_BASE_URL, CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

export const FIELD_OBSERVATIONS_PATH = "/api/field-observations";
const SPECIES_SEARCH_PATH = "/api/species/search";

export type SyncFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

export type SyncDeps = {
  fetchFn?: SyncFetch;
  calyxBaseUrl?: string;
  publicApiBaseUrl?: string;
  now?: () => string;
};

/** The backend requires a non-empty note; a photo-only observation gets an
 *  honest placeholder, and structured ecology fields ride along as an
 *  appendix so nothing captured is silently dropped by the narrower backend
 *  contract (which forbids extra keys). */
export function buildSyncNote(draft: FieldDraft): string {
  const lines: string[] = [draft.note || "(Photo-only observation — no free-text note.)"];
  const appendix: string[] = [];
  const eco = draft.ecology;
  const rel = draft.relationships;
  if (eco.growthHabit) appendix.push(`Growth habit: ${eco.growthHabit}`);
  if (eco.substrate) appendix.push(`Substrate: ${eco.substrate}`);
  if (eco.habitat) appendix.push(`Habitat: ${eco.habitat}`);
  if (eco.surroundingVegetation) appendix.push(`Surrounding vegetation: ${eco.surroundingVegetation}`);
  if (eco.plantDescription) appendix.push(`Plant description: ${eco.plantDescription}`);
  if (rel.pollinatorInteraction) appendix.push(`Pollinator interaction: ${rel.pollinatorInteraction}`);
  if (rel.mycorrhizalObservation) appendix.push(`Mycorrhizal observation: ${rel.mycorrhizalObservation}`);
  if (rel.otherRelationships) appendix.push(`Other relationships: ${rel.otherRelationships}`);
  if (draft.observerName) appendix.push(`Observer: ${draft.observerName}`);
  if (draft.provenance) appendix.push(`Provenance: ${draft.provenance}`);
  if (draft.coordinates) {
    appendix.push(
      draft.localityVisibility === "public"
        ? "Location: coarsened fix retained on device; precise locality withheld."
        : "Location: precise fix retained on device under locality protection (not uploaded).",
    );
  }
  if (appendix.length) lines.push("", "Field details:", ...appendix);
  return lines.join("\n").slice(0, 4900);
}

export type FieldObservationSyncPayload = {
  observed_at: string;
  note: string;
  taxon_hint: string | null;
  epistemic_certainty: "POSSIBLE";
  locality_visibility: FieldDraft["localityVisibility"];
  media: Array<{ name: string; size: number; type: string }>;
  client_draft_id: string;
};

/** Explicit allow-list mapping to `field-observations/v1`. Coordinates,
 *  media ids and every other local-only field are deliberately absent. */
export function buildSyncPayload(draft: FieldDraft): FieldObservationSyncPayload {
  return {
    observed_at: draft.createdAt,
    note: buildSyncNote(draft),
    taxon_hint: draft.taxonLabel,
    epistemic_certainty: "POSSIBLE",
    locality_visibility: draft.localityVisibility,
    media: draft.media.map((item) => ({ name: item.name, size: item.size, type: item.type })),
    client_draft_id: draft.id,
  };
}

export type SyncOutcome = {
  draft: FieldDraft;
  backendObservationId: string | null;
  /** True when the backend confirmed (or already held) the record. */
  confirmed: boolean;
};

export async function syncFieldDraft(draft: FieldDraft, deps: SyncDeps = {}): Promise<SyncOutcome> {
  const now = deps.now ?? (() => new Date().toISOString());
  // Dedupe guard: a confirmed record is never re-posted.
  if (draft.syncStatus === "synced" && draft.backendObservationId) {
    return { draft, backendObservationId: draft.backendObservationId, confirmed: true };
  }

  const fetchFn = deps.fetchFn ?? (globalThis.fetch as unknown as SyncFetch | undefined);
  // A "synced" draft that never recorded its backend id is walked back to
  // local_saved first so the state machine permits re-queueing.
  const restartable =
    draft.syncStatus === "synced"
      ? transitionFieldDraftSync(draft, "local_saved", now())
      : draft;
  const pending =
    restartable.syncStatus === "sync_pending"
      ? restartable
      : transitionFieldDraftSync(restartable, "sync_pending", now());
  if (!fetchFn) {
    return {
      draft: transitionFieldDraftSync(pending, "sync_error", now(), "No network stack available on this device."),
      backendObservationId: null,
      confirmed: false,
    };
  }

  try {
    const response = await fetchFn(
      `${(deps.calyxBaseUrl ?? CALYX_BACKEND_BASE_URL).replace(/\/$/, "")}${FIELD_OBSERVATIONS_PATH}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify(buildSyncPayload(pending)),
      },
    );
    if (!response.ok) {
      const message =
        response.status === 401 || response.status === 403
          ? "Sign-in required: the owner session is not active on this device."
          : `Backend rejected the observation (HTTP ${response.status}).`;
      return {
        draft: transitionFieldDraftSync(pending, "sync_error", now(), message),
        backendObservationId: null,
        confirmed: false,
      };
    }
    const body = (await response.json()) as { id?: unknown };
    const backendId = typeof body.id === "string" && body.id ? body.id : null;
    const synced = transitionFieldDraftSync(pending, "synced", now());
    return {
      draft: { ...synced, backendObservationId: backendId },
      backendObservationId: backendId,
      confirmed: true,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Network unavailable.";
    return {
      draft: transitionFieldDraftSync(pending, "sync_error", now(), message),
      backendObservationId: null,
      confirmed: false,
    };
  }
}

/**
 * Resolve the observer's tentative label against Orchid Continuum canonical
 * taxonomy via the public API. Returns null when there is no exact
 * (case-insensitive) canonical match — an unresolved label stays an
 * unresolved label and is never upgraded to an identification.
 */
export async function lookupCanonicalTaxon(
  taxonLabel: string,
  deps: SyncDeps = {},
): Promise<FieldTaxonomyMatch | null> {
  const fetchFn = deps.fetchFn ?? (globalThis.fetch as unknown as SyncFetch | undefined);
  if (!fetchFn || !taxonLabel.trim()) return null;
  const now = deps.now ?? (() => new Date().toISOString());
  try {
    const base = (deps.publicApiBaseUrl ?? BACKEND_BASE_URL).replace(/\/$/, "");
    const response = await fetchFn(
      `${base}${SPECIES_SEARCH_PATH}?q=${encodeURIComponent(taxonLabel.trim())}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) return null;
    const wanted = taxonLabel.trim().toLowerCase();
    const hit = body.find((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const name = (entry as { canonical_name?: unknown }).canonical_name;
      return typeof name === "string" && name.trim().toLowerCase() === wanted;
    }) as { canonical_name?: unknown; taxonomy_id?: unknown } | undefined;
    if (!hit || typeof hit.canonical_name !== "string") return null;
    return {
      taxonomyId: typeof hit.taxonomy_id === "string" ? hit.taxonomy_id : null,
      canonicalName: hit.canonical_name,
      matchedAt: now(),
    };
  } catch {
    return null;
  }
}

/**
 * Full online pass for one draft: resolve taxonomy (best-effort) then sync
 * the observation record. Taxonomy failure never blocks synchronization.
 */
export async function syncDraftWithTaxonomy(
  draft: FieldDraft,
  deps: SyncDeps = {},
): Promise<SyncOutcome> {
  let working = draft;
  if (draft.taxonLabel && !draft.taxonomyMatch) {
    const match = await lookupCanonicalTaxon(draft.taxonLabel, deps);
    if (match) working = { ...working, taxonomyMatch: match };
  }
  return syncFieldDraft(working, deps);
}
