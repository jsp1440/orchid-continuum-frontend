import type { LexiconEntry } from "@/data/types";
import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

export type CanonicalMatrixLexiconEntry = LexiconEntry & {
  concept_id?: string;
  concept_uri?: string | null;
};

export type MatrixCharacterDefinition = {
  character: string;
  label: string;
  description?: string | null;
  value_type?: string;
  weight?: number;
  concept_id?: string | null;
  provenance?: Record<string, unknown> | null;
};

export type MatrixCharacterLexiconResolution =
  | {
      status: "mapped";
      character: MatrixCharacterDefinition;
      concept: CanonicalMatrixLexiconEntry;
    }
  | {
      status: "unmapped";
      character: MatrixCharacterDefinition;
    }
  | {
      status: "approved_concept_unavailable";
      character: MatrixCharacterDefinition;
      concept_id: string;
    };

async function requestJson<T>(path: string): Promise<{ ok: boolean; status: number; payload: T | null }> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null) as T | null;
  return { ok: response.ok, status: response.status, payload };
}

export async function resolveMatrixCharacterLexicon(
  registryId: string,
  version: string,
  characterId: string,
): Promise<MatrixCharacterLexiconResolution> {
  const registryResponse = await requestJson<{ characters?: MatrixCharacterDefinition[] }>(
    `/api/matrix-identification/registry/${encodeURIComponent(registryId)}/${encodeURIComponent(version)}`,
  );
  if (!registryResponse.ok || !registryResponse.payload) {
    throw new Error(`Matrix registry API ${registryResponse.status}`);
  }
  const character = (registryResponse.payload.characters ?? []).find((item) => item.character === characterId);
  if (!character) {
    throw new Error(`Matrix character is absent from the bound registry: ${characterId}`);
  }
  if (!character.concept_id) {
    return { status: "unmapped", character };
  }

  const conceptResponse = await requestJson<{ entry?: CanonicalMatrixLexiconEntry }>(
    `/api/lexicon/concepts/${encodeURIComponent(character.concept_id)}`,
  );
  if (conceptResponse.status === 404) {
    return {
      status: "approved_concept_unavailable",
      character,
      concept_id: character.concept_id,
    };
  }
  if (!conceptResponse.ok || !conceptResponse.payload?.entry) {
    throw new Error(`Canonical Lexicon API ${conceptResponse.status}`);
  }
  return {
    status: "mapped",
    character,
    concept: conceptResponse.payload.entry,
  };
}
