import { CALYX_BACKEND_BASE_URL } from "../../lib/backendConfig";

export const PAPERBOTANICA_REVIEW_STATE = "REQUIRES BOTANICAL REVIEW";

export function paperBotanicaUrl(path: string): string {
  return `${CALYX_BACKEND_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
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

function requireReviewState(value: unknown): void {
  if (value !== PAPERBOTANICA_REVIEW_STATE) {
    throw new Error("PaperBotanica response is missing the required botanical-review state.");
  }
}

function parseSpecies(value: unknown): PaperBotanicaSpecies {
  if (!isRecord(value) || typeof value.species_id !== "string" || typeof value.scientific_name !== "string") {
    throw new Error("PaperBotanica returned an invalid species record.");
  }
  requireReviewState(value.publication_state);
  if (!isRecord(value.links) || typeof value.links.paperbotanica_model !== "string") {
    throw new Error("PaperBotanica species record has no reconstruction link.");
  }
  return value as unknown as PaperBotanicaSpecies;
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
  if (!Array.isArray((payload as unknown as PaperBotanicaProfile).sources) || !Array.isArray((payload as unknown as PaperBotanicaProfile).organs)) {
    throw new Error("PaperBotanica profile is missing evidence or organ records.");
  }
  return payload as PaperBotanicaProfile;
}

export async function downloadPaperBotanicaPackage(species: PaperBotanicaSpecies): Promise<void> {
  const response = await paperBotanicaRequest(species.links.paperbotanica_package, { method: "POST" });
  if (!response.ok) {
    throw new Error(`PaperBotanica package generation failed (${response.status}).`);
  }
  requireReviewState(response.headers.get("X-PaperBotanica-Publication-State"));
  const digest = response.headers.get("X-PaperBotanica-Construction-Digest");
  if (!digest || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error("PaperBotanica package has no valid construction digest.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${species.species_id}-paperbotanica-draft.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
