import { resolveSpeciesDossierCanonicalSubject, type SpeciesDossierAtlasIdentity } from '../../lib/speciesDossierAtlasNavigation';

/** Navigation identity only; no taxonomic or scientific assertion is created. */
export function paperBotanicaDossierHref(identity: SpeciesDossierAtlasIdentity): string | null {
  const subject = resolveSpeciesDossierCanonicalSubject(identity);
  return subject ? `/paperbotanica?${new URLSearchParams({ species: subject.taxon })}` : null;
}
