/**
 * Orchidaceae entries of CITES Appendix I, used as a locality-protection floor.
 *
 * Mirrors the `cites_appendix_i` list in
 * docs/atlas-next/migrations/20260930_atlas_occurrences_locality_protection.sql
 * so the browser applies the same floor whether rows come from the protected
 * view or, before the migration, from the base table. `null` epithet means the
 * whole genus. Older synonyms that source datasets still use are included.
 *
 * This is a policy list, not evidence about any record. The owner verifies it
 * against the current Appendices before the migration is applied; adding a
 * name can only make the Atlas more protective.
 */
export const CITES_APPENDIX_I_ORCHIDS: ReadonlyArray<readonly [genus: string, epithet: string | null]> = [
  ['paphiopedilum', null],
  ['phragmipedium', null],
  ['mexipedium', 'xerophyticum'],
  ['aerangis', 'ellisii'],
  ['cattleya', 'jongheana'],
  ['laelia', 'jongheana'],
  ['hadrolaelia', 'jongheana'],
  ['cattleya', 'lobata'],
  ['laelia', 'lobata'],
  ['cattleya', 'trianae'],
  ['dendrobium', 'cruentum'],
  ['peristeria', 'elata'],
  ['renanthera', 'imschootiana'],
];

/** Minimum cell, in degrees, for a CITES Appendix I orchid. */
export const CITES_APPENDIX_I_FLOOR_DEG = 0.1;

const words = (value: string | undefined | null): string[] =>
  (value ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);

/**
 * True when any of the record's names is a CITES Appendix I orchid. Matching is
 * exact on genus (for whole-genus listings) or on the binomial, nothing fuzzy.
 */
export function isCitesAppendixIOrchid(names: {
  genus?: string | null;
  species?: string | null;
  canonicalName?: string | null;
  acceptedName?: string | null;
}): boolean {
  const binomials: Array<[string, string | undefined]> = [];
  const g = words(names.genus)[0];
  if (g) binomials.push([g, words(names.species)[0]]);
  for (const n of [names.canonicalName, names.acceptedName]) {
    const w = words(n);
    if (w[0]) binomials.push([w[0], w[1]]);
  }
  return binomials.some(([genus, epithet]) =>
    CITES_APPENDIX_I_ORCHIDS.some(([cg, ce]) => cg === genus && (ce === null || ce === epithet)),
  );
}
