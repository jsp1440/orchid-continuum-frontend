import { CALYX_BACKEND_BASE_URL } from "../../lib/backendConfig";

export const PAPERBOTANICA_REVIEW_STATE = "REQUIRES BOTANICAL REVIEW";

export function paperBotanicaUrl(path: string): string {
  if (!/^\/api\/paperbotanica\/[a-zA-Z0-9/_.-]+$/.test(path) || path.includes("..")) {
    throw new Error("Invalid PaperBotanica API path.");
  }
  return `${CALYX_BACKEND_BASE_URL}${path}`;
}

export function paperBotanicaRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(paperBotanicaUrl(path), {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", ...(init.headers ?? {}) },
  });
}

export interface PaperBotanicaSpecies {
  species_id: string;
  scientific_name: string;
  accepted_name: string;
  common_name: string;
  story_name: string;
  readiness: string;
  publication_state: string;
  organ_count: number;
  organ_evidence_classes: string[];
  missing_evidence_views: string[];
  links: {
    canonical_species_resolve: string;
    paperbotanica_evidence: string;
    paperbotanica_model: string;
    paperbotanica_package: string;
  };
}

export interface PaperBotanicaCollection {
  schema_version: string;
  algorithm_version: string;
  species_count: number;
  species: PaperBotanicaSpecies[];
}

export interface PaperBotanicaProfile extends PaperBotanicaSpecies {
  distribution: string;
  habitat: string;
  botanical_fact: string;
  conservation_message: string;
  sources: Array<{
    source_id: string;
    title: string;
    url: string;
    source_type: string;
    creator: string;
    license: string;
    notes: string;
  }>;
  evidence: Array<{
    evidence_id: string;
    evidence_class: string;
    structures: string[];
    view: string;
    confidence: string;
    notes: string;
  }>;
  organs: Array<{
    organ_id: string;
    kind: string;
    label: string;
    evidence_class: string;
    attachment: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function requireReviewState(value: unknown): void {
  if (value !== PAPERBOTANICA_REVIEW_STATE) {
    throw new Error("PaperBotanica response is missing the required botanical-review state.");
  }
}

const EVIDENCE_CLASSES = new Set(["MEASURED", "OBSERVED", "INFERRED", "HYPOTHETICAL"]);
// Producer confidence vocabulary is distinct from scientific claim/review status.
const EVIDENCE_CONFIDENCE = new Set([
  "HIGH", "MEDIUM", "LOW", "INDETERMINATE", "LITERATURE_REPORTED_NOT_SPECIMEN_MEASURED",
  "CONFIRMED", "PROBABLE", "HYPOTHESIZED", "UNKNOWN",
]);
const ORGAN_KINDS = new Set([
  "dorsal_sepal", "lateral_sepal", "lateral_petal", "labellum", "column", "synsepal",
  "spur", "staminode", "inflorescence", "stem", "leaf", "root", "pseudobulb",
]);
function requiredText(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((k) => typeof value[k] === "string" && String(value[k]).trim().length > 0);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string" && x.trim().length > 0);
}

function textFields(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((k) => typeof value[k] === "string");
}

function parseSpecies(value: unknown): PaperBotanicaSpecies {
  if (!isRecord(value) || !textFields(value, ["species_id", "scientific_name", "accepted_name", "common_name", "story_name", "readiness"]) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value.species_id)) ||
      !requiredText(value, ["scientific_name", "accepted_name", "common_name", "readiness"])) {
    throw new Error("PaperBotanica returned an invalid species record.");
  }
  requireReviewState(value.publication_state);
  if (!Number.isInteger(value.organ_count) || Number(value.organ_count) < 1 || Number(value.organ_count) > 24 ||
      !strings(value.organ_evidence_classes) || !value.organ_evidence_classes.length || !value.organ_evidence_classes.every(x => EVIDENCE_CLASSES.has(x)) || !strings(value.missing_evidence_views)) {
    throw new Error("PaperBotanica species record has invalid organ/evidence fields.");
  }
  const base = `/api/paperbotanica/species/${value.species_id}`;
  if (!isRecord(value.links) || value.links.paperbotanica_model !== `${base}/model.glb` ||
      value.links.paperbotanica_package !== `${base}/package` || value.links.paperbotanica_evidence !== `${base}/evidence` ||
      typeof value.links.canonical_species_resolve !== "string" ||
      !value.links.canonical_species_resolve.startsWith("/api/platform/federation/resolve-species?name=")) {
    throw new Error("PaperBotanica species record has invalid integration links.");
  }
  return value as unknown as PaperBotanicaSpecies;
}

export function requireArtifact(response: Response, mime: string): string {
  if (!response.ok) throw new Error(`PaperBotanica request failed (${response.status}).`);
  requireReviewState(response.headers.get("X-PaperBotanica-Publication-State"));
  const digest = response.headers.get("X-PaperBotanica-Construction-Digest");
  if (!digest || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("PaperBotanica artifact has no valid construction digest.");
  if (response.headers.get("Content-Type")?.split(";")[0] !== mime) throw new Error("PaperBotanica artifact has an unexpected media type.");
  return digest;
}

export async function fetchPaperBotanicaView(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await paperBotanicaRequest(path, { signal });
  requireArtifact(response, "image/png");
  return response.blob();
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`PaperBotanica request failed (${response.status}).`);
  }
  return response.json() as Promise<unknown>;
}

export async function fetchPaperBotanicaCollection(signal?: AbortSignal): Promise<PaperBotanicaCollection> {
  const response = await paperBotanicaRequest("/api/paperbotanica/species", { signal });
  const payload = await readJson(response);
  if (!isRecord(payload) || payload.schema_version !== "paperbotanica-collection-api/v1" || !Array.isArray(payload.species)) {
    throw new Error("Unsupported PaperBotanica collection contract.");
  }
  const species = payload.species.map(parseSpecies);
  if (payload.species_count !== species.length) {
    throw new Error("PaperBotanica collection count does not match its records.");
  }
  return { ...payload, species } as unknown as PaperBotanicaCollection;
}

export async function fetchPaperBotanicaProfile(speciesId: string, signal?: AbortSignal): Promise<PaperBotanicaProfile> {
  const response = await paperBotanicaRequest(`/api/paperbotanica/species/${encodeURIComponent(speciesId)}`, { signal });
  const payload = parseSpecies(await readJson(response));
  const record = payload as unknown as Record<string, unknown>;
  if (payload.species_id !== speciesId || !textFields(record, ["distribution", "habitat", "botanical_fact", "conservation_message"]) ||
      !Array.isArray(record.sources) || !record.sources.length || !record.sources.every((x) => isRecord(x) &&
        textFields(x,["source_id","title","url","source_type","creator","license","notes"]) && requiredText(x, ["source_id", "title", "license", "source_type", "creator"]) && /^https?:\/\//.test(String(x.url))) ||
      !Array.isArray(record.evidence) || !record.evidence.length || !record.evidence.every((x) => isRecord(x) &&
        textFields(x,["evidence_id","source_id","evidence_class","view","confidence","notes"]) && requiredText(x, ["evidence_id", "source_id", "evidence_class", "view", "confidence"]) &&
        EVIDENCE_CLASSES.has(String(x.evidence_class)) && EVIDENCE_CONFIDENCE.has(String(x.confidence)) &&
        strings(x.structures) && x.structures.length > 0) ||
      !Array.isArray(record.organs) || record.organs.length !== payload.organ_count || !record.organs.every((x) => isRecord(x) &&
        textFields(x,["organ_id","kind","label","evidence_class","attachment"]) && requiredText(x, ["organ_id", "kind", "label", "evidence_class", "attachment"]) &&
        EVIDENCE_CLASSES.has(String(x.evidence_class)) && ORGAN_KINDS.has(String(x.kind)))) {
    throw new Error("PaperBotanica profile is missing valid evidence or organ records.");
  }
  const sourceIds = new Set(record.sources.map((x) => (x as Record<string, unknown>).source_id));
  if (sourceIds.size !== record.sources.length || record.evidence.some((x) => !sourceIds.has((x as Record<string, unknown>).source_id))) {
    throw new Error("PaperBotanica profile has orphan or duplicate provenance.");
  }
  for (const [records, key] of [[record.evidence, "evidence_id"], [record.organs, "organ_id"]] as const) {
    if (new Set(records.map(x => (x as Record<string, unknown>)[key])).size !== records.length) {
      throw new Error("PaperBotanica profile has duplicate evidence or organ identifiers.");
    }
  }
  return payload as PaperBotanicaProfile;
}

export async function downloadPaperBotanicaPackage(species: PaperBotanicaSpecies, signal?: AbortSignal): Promise<void> {
  const response = await paperBotanicaRequest(species.links.paperbotanica_package, { method: "POST", signal });
  if (!response.ok) {
    throw new Error(`PaperBotanica package generation failed (${response.status}).`);
  }
  requireArtifact(response, "application/zip");
  const blob = await response.blob();
  signal?.throwIfAborted();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${species.species_id}-paperbotanica-draft.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

