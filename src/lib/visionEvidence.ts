/**
 * visionEvidence — typed, fail-closed client for the Calyx Vision-Lexicon
 * concept evidence summary:
 *
 *   GET {CALYX_BACKEND_BASE_URL}/api/vision-lexicon/lexicon/concepts/{concept_id}/vision-evidence
 *
 * The endpoint is a public read (backend app/vision_lexicon/routes.py,
 * response model EvidenceSummaryResponse). This client never sends
 * credentials and never writes.
 *
 * Every outcome is a distinct, explicit state so the UI can never render an
 * outage or a malformed body as "no evidence":
 *
 *   - `not_applicable` — the entry has no UUID concept id (the backend would
 *                        reject it with a 422); nothing is requested.
 *   - `unavailable`    — network failure, timeout, or a non-2xx response.
 *   - `malformed`      — a 2xx that is not JSON, or JSON that does not match
 *                        the EvidenceSummaryResponse contract.
 *   - `empty`          — a valid summary that carries no reference sets, images,
 *                        observations, morphometrics, figures, assets or runs.
 *   - `ready`          — a valid summary carrying at least one record.
 *
 * Values are passed through exactly as returned. Nothing is defaulted,
 * inferred or synthesised; in particular no image URL is ever constructed —
 * the contract returns image identifiers only.
 */
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import { isJsonContentType } from '@/lib/api';

export const VISION_EVIDENCE_TIMEOUT_MS = 10_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type JsonRecord = Record<string, unknown>;

export interface VisionEvidenceSummary {
  concept_id: string | null;
  concept_label: string | null;
  reference_sets: JsonRecord[];
  reference_images: JsonRecord[];
  vision_observations: JsonRecord[];
  morphometrics: JsonRecord[];
  aggregate_summary: JsonRecord | null;
  figure_specifications: JsonRecord[];
  visual_assets: JsonRecord[];
  validation_runs: JsonRecord[];
  review_state: string;
  provenance: JsonRecord;
  limitations: string[];
}

export type VisionEvidenceResult =
  | { state: 'not_applicable' }
  | { state: 'unavailable'; status: number; code: string | null; message: string }
  | { state: 'malformed'; reason: string }
  | { state: 'empty'; summary: VisionEvidenceSummary }
  | { state: 'ready'; summary: VisionEvidenceSummary };

export function isVisionConceptId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function visionEvidenceUrl(conceptId: string): string {
  return `${CALYX_BACKEND_BASE_URL}/api/vision-lexicon/lexicon/concepts/${encodeURIComponent(conceptId.trim())}/vision-evidence`;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRecordArray = (value: unknown): value is JsonRecord[] =>
  Array.isArray(value) && value.every(isRecord);

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const ARRAY_FIELDS = [
  'reference_sets',
  'reference_images',
  'vision_observations',
  'morphometrics',
  'figure_specifications',
  'visual_assets',
  'validation_runs',
] as const;

/**
 * Validate a body against EvidenceSummaryResponse. Returns the summary or a
 * reason string describing the first contract violation. Missing fields are
 * violations — the backend model declares every field required.
 */
export function parseVisionEvidenceSummary(
  body: unknown,
  requestedConceptId?: string,
): { ok: true; summary: VisionEvidenceSummary } | { ok: false; reason: string } {
  if (!isRecord(body)) return { ok: false, reason: 'body is not a JSON object' };
  if (!isNullableString(body.concept_id)) return { ok: false, reason: 'concept_id is not a string or null' };
  if (!isNullableString(body.concept_label)) return { ok: false, reason: 'concept_label is not a string or null' };
  for (const field of ARRAY_FIELDS) {
    if (!isRecordArray(body[field])) return { ok: false, reason: `${field} is not an array of objects` };
  }
  if (!(body.aggregate_summary === null || isRecord(body.aggregate_summary))) {
    return { ok: false, reason: 'aggregate_summary is not an object or null' };
  }
  if (typeof body.review_state !== 'string' || !body.review_state.trim()) {
    return { ok: false, reason: 'review_state is missing' };
  }
  if (!isRecord(body.provenance)) return { ok: false, reason: 'provenance is not an object' };
  if (!Array.isArray(body.limitations) || !body.limitations.every((item) => typeof item === 'string')) {
    return { ok: false, reason: 'limitations is not an array of strings' };
  }
  if (
    requestedConceptId &&
    typeof body.concept_id === 'string' &&
    body.concept_id.toLowerCase() !== requestedConceptId.trim().toLowerCase()
  ) {
    return { ok: false, reason: 'concept_id does not match the requested concept' };
  }
  return {
    ok: true,
    summary: {
      concept_id: body.concept_id,
      concept_label: body.concept_label,
      reference_sets: body.reference_sets as JsonRecord[],
      reference_images: body.reference_images as JsonRecord[],
      vision_observations: body.vision_observations as JsonRecord[],
      morphometrics: body.morphometrics as JsonRecord[],
      aggregate_summary: body.aggregate_summary as JsonRecord | null,
      figure_specifications: body.figure_specifications as JsonRecord[],
      visual_assets: body.visual_assets as JsonRecord[],
      validation_runs: body.validation_runs as JsonRecord[],
      review_state: body.review_state,
      provenance: body.provenance,
      limitations: body.limitations as string[],
    },
  };
}

export function isEmptyVisionEvidence(summary: VisionEvidenceSummary): boolean {
  return ARRAY_FIELDS.every((field) => summary[field].length === 0) && summary.aggregate_summary === null;
}

function errorCode(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const detail = body.detail;
  if (isRecord(detail) && typeof detail.code === 'string') return detail.code;
  return null;
}

export async function fetchVisionEvidence(
  conceptId: string | null | undefined,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<VisionEvidenceResult> {
  if (!isVisionConceptId(conceptId)) return { state: 'not_applicable' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? VISION_EVIDENCE_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    options.signal.addEventListener('abort', onAbort);
  }

  try {
    let response: Response;
    try {
      response = await fetch(visionEvidenceUrl(conceptId), {
        method: 'GET',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        state: 'unavailable',
        status: aborted ? 408 : 0,
        code: null,
        message: aborted ? 'Vision evidence request timed out' : 'Vision evidence service could not be reached',
      };
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return {
        state: 'unavailable',
        status: response.status,
        code: errorCode(body),
        message: `Vision evidence request failed (${response.status})`,
      };
    }

    if (!isJsonContentType(response.headers?.get?.('content-type'))) {
      return { state: 'malformed', reason: 'response is not JSON' };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { state: 'malformed', reason: 'response body is not valid JSON' };
    }

    const parsed = parseVisionEvidenceSummary(body, conceptId);
    if (parsed.ok === false) return { state: 'malformed', reason: parsed.reason };
    return isEmptyVisionEvidence(parsed.summary)
      ? { state: 'empty', summary: parsed.summary }
      : { state: 'ready', summary: parsed.summary };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
