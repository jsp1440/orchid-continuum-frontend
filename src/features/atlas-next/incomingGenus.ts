const SAFE_CANONICAL_GENUS = /^[A-Z][A-Za-z-]+$/;
const MAX_CANONICAL_GENUS_LENGTH = 120;

/**
 * Resolve the one genus Atlas Next may promote from shared Atlas URL filters
 * into its local interactive selection.
 *
 * The shared Atlas filter contract legitimately supports multiple genera, but
 * Atlas Next's Research continuation represents one active subject. Picking the
 * first value from a multi-genus filter would silently narrow the user's query,
 * so only exactly one bounded canonical genus can hydrate the local selection.
 */
export function resolveAtlasNextIncomingGenus(
  genera: readonly string[] | undefined,
): string | null {
  if (!genera || genera.length !== 1) return null;

  const genus = String(genera[0] ?? '').trim();
  if (
    !genus ||
    genus.length > MAX_CANONICAL_GENUS_LENGTH ||
    !SAFE_CANONICAL_GENUS.test(genus)
  ) {
    return null;
  }

  return genus;
}
