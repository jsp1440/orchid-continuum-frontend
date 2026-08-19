export const ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN = 'atlas-next-occurrence-evidence';

const MAX_GENUS_CHARACTERS = 80;
const SAFE_GENUS = /^[A-Za-z][A-Za-z -]*$/;

/**
 * Build the bounded Atlas Next → Calyx handoff URL.
 *
 * Only genus-level identity and a workflow origin are forwarded. Occurrence
 * identifiers, coordinates, locality text, collector data, and other record
 * fields are deliberately excluded so protected locality cannot escape via the
 * route contract.
 */
export function atlasOccurrenceEvidenceCalyxHref(genus: string | null | undefined): string | null {
  const normalized = genus?.trim() ?? '';
  if (!normalized || normalized.length > MAX_GENUS_CHARACTERS || !SAFE_GENUS.test(normalized)) {
    return null;
  }

  const params = new URLSearchParams({
    genus: normalized,
    origin: ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN,
  });
  return `/calyx?${params.toString()}`;
}
