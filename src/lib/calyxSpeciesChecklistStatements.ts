/**
 * Checklist statements for a species page: `GET /api/platform/species/{taxon_id}/checklist-statements`
 * (backend draft #2426, off by default behind two switches, `Cache-Control: no-store`).
 *
 * The route answers HTTP 200 with a `status` for every state that is not an error, and HTTP 404 for an
 * unknown id. This module turns one answer into one of five results and never throws for an answer:
 *
 *   - `inert`: nothing is to be shown and nothing is said. The route is switched off (`not_enabled`), the page's
 *     taxon has no single graph node (`no_graph_node`: nothing was read), the id is unknown or foreign (HTTP 4xx),
 *     the request failed before an answer arrived, or the answer is not the v1 envelope. An old backend that has
 *     no such route answers 404, so a page that mounts this component is unchanged until the route is on.
 *   - `could_not_be_read`: HTTP 5xx, or `status: unavailable` (busy, over the time budget, not configured, read
 *     failed). A stated gap; the returned explanation is carried; nothing is concluded from it.
 *   - `could_not_be_displayed`: `available`, but the block cannot be read safely by `readScientificEvidence`.
 *   - `available`: the block, read by the same reader as a Calyx turn, plus what the envelope says about
 *     which topics were read.
 *
 * Nothing here words a statement, resolves a name or builds text from a backend sentence.
 */

import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import { readScientificEvidence, type CalyxEvidenceView } from "@/lib/calyxScientificEvidence";

export const SPECIES_CHECKLIST_STATEMENTS_SCHEMA = "oc.species-checklist-statements.v1";

export type SpeciesChecklistStatementsResult =
  | { kind: "inert" }
  | { kind: "could_not_be_read"; explanation: string | null; code: string | null }
  | { kind: "could_not_be_displayed" }
  | {
      kind: "available";
      /** The envelope's own notice, as returned. */
      notice: string | null;
      acceptedName: string | null;
      /** Topics the envelope marks `not_read`, as returned. */
      topicsNotRead: string[];
      /** `all_topics_read === false`: a topic was read but not to its end. null when not reported. */
      allTopicsRead: boolean | null;
      evidence: CalyxEvidenceView;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** One envelope (the JSON body of an HTTP 200) read into a result. */
export function readSpeciesChecklistStatements(raw: unknown): SpeciesChecklistStatementsResult {
  if (!isRecord(raw) || raw.schema !== SPECIES_CHECKLIST_STATEMENTS_SCHEMA || typeof raw.status !== "string") return { kind: "inert" };
  switch (raw.status) {
    case "not_enabled":
    case "no_graph_node":
      return { kind: "inert" };
    case "unavailable":
      return { kind: "could_not_be_read", explanation: text(raw.explanation), code: text(raw.reason_code) };
    case "available": {
      const evidence = readScientificEvidence(raw.scientific_evidence);
      if (evidence.kind !== "available") return { kind: "could_not_be_displayed" };
      const status = raw.topic_status;
      let topicsNotRead: string[] = [];
      if (status !== undefined && status !== null) {
        if (!isRecord(status)) return { kind: "could_not_be_displayed" };
        topicsNotRead = Object.entries(status).flatMap(([topic, state]) => (state === "not_read" ? [topic] : []));
      }
      return {
        kind: "available",
        notice: text(raw.notice),
        acceptedName: text(raw.accepted_name),
        topicsNotRead,
        allTopicsRead: typeof raw.all_topics_read === "boolean" ? raw.all_topics_read : null,
        evidence,
      };
    }
    default:
      return { kind: "inert" };
  }
}

export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Pick<Response, "ok" | "status" | "json">>;

/**
 * Ask the route for the taxon of a species page (the dossier's `identity.taxon_id`).
 * An aborted request is rethrown so the caller can ignore it; every other failure is a result.
 */
export async function fetchSpeciesChecklistStatements(
  taxonId: string,
  signal?: AbortSignal,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<SpeciesChecklistStatementsResult> {
  let response: Pick<Response, "ok" | "status" | "json">;
  try {
    response = await fetchImpl(`${CALYX_BACKEND_BASE_URL}/api/platform/species/${encodeURIComponent(taxonId)}/checklist-statements`, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    return { kind: "inert" };
  }
  if (response.status >= 500) return { kind: "could_not_be_read", explanation: null, code: `HTTP_${response.status}` };
  if (!response.ok) return { kind: "inert" };
  try {
    return readSpeciesChecklistStatements(await response.json());
  } catch (error) {
    if (signal?.aborted) throw error;
    return { kind: "inert" };
  }
}
