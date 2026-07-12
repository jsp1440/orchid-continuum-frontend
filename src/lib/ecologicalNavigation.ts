import type { EcologicalNeighborhoodCard as Card, EcologicalNeighborType } from '@/lib/ecologicalNeighborhood';

export interface EcologicalNavigationTarget {
  href: string;
  label: string;
}

function txt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : String(v ?? '').trim();
}

function slugify(value: string): string {
  return txt(value)
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function speciesFor(card: Card): string {
  return txt(card.scientificName) || txt(card.evidenceValue) || txt(card.title);
}

function firstGeoValue(card: Card): string {
  const raw = txt(card.evidenceValue) || txt(card.title);
  return raw.split(/[;,]/)[0]?.trim() || raw;
}

function pendingText(card: Card): string {
  return `${card.type} ${card.title} ${card.relationship} ${card.evidenceValue ?? ''}`.toLowerCase();
}

export function isEcologicalCardPending(card: Card): boolean {
  const text = pendingText(card);
  return (
    card.type === 'missing' ||
    text.includes('not yet linked') ||
    text.includes('data needed') ||
    text.includes('awaiting')
  );
}

function withSpeciesQuery(path: string, species: string): string {
  return species ? `${path}?species=${encodeURIComponent(species)}` : path;
}

/**
 * BUILD 208A — Graph navigation router.
 *
 * IMPORTANT: these targets intentionally use routes that already exist in
 * src/App.tsx. Earlier experimental paths such as /habitat, /fungi, and
 * /knowledge were aspirational and could land users on NotFound. This adapter
 * turns every ecological card into a safe graph-navigation link while keeping
 * the focal species in the URL when useful.
 */
export function navigationTargetForCard(card: Card): EcologicalNavigationTarget | null {
  if (isEcologicalCardPending(card)) return null;

  const type = card.type as EcologicalNeighborType;
  const focalSpecies = speciesFor(card);

  if (type === 'species' || type === 'co_occurring_orchid') {
    const species = speciesFor(card);
    return species ? { href: `/species/${encodeURIComponent(species)}`, label: 'Explore species' } : null;
  }

  if (type === 'geography') {
    const country = firstGeoValue(card);
    const species = speciesFor(card);
    const params = new URLSearchParams();
    if (country) params.set('country', country);
    if (species) params.set('species', species);
    const query = params.toString();
    return { href: query ? `/atlas?${query}` : '/atlas', label: 'Open atlas' };
  }

  if (type === 'habitat' || type === 'host_tree') {
    const slug = slugify(txt(card.evidenceValue) || card.title);
    return slug
      ? { href: withSpeciesQuery(`/habitats/${slug}`, focalSpecies), label: 'Explore habitat' }
      : { href: withSpeciesQuery('/habitats', focalSpecies), label: 'Explore habitat' };
  }

  if (type === 'pollinator') {
    const slug = slugify(txt(card.evidenceValue) || card.title);
    return slug
      ? { href: withSpeciesQuery(`/pollinators/${slug}`, focalSpecies), label: 'Explore pollinator' }
      : { href: withSpeciesQuery('/pollinators', focalSpecies), label: 'Explore pollinator' };
  }

  if (type === 'fungus' || type === 'fungal_dependency') {
    const slug = slugify(txt(card.evidenceValue) || card.title);
    return slug
      ? { href: withSpeciesQuery(`/mycorrhizae/${slug}`, focalSpecies), label: 'Explore mycorrhizae' }
      : { href: withSpeciesQuery('/mycorrhizae', focalSpecies), label: 'Explore mycorrhizae' };
  }

  if (type === 'conservation') {
    return { href: withSpeciesQuery('/conservation', focalSpecies), label: 'Explore conservation' };
  }

  if (type === 'knowledge' || type === 'ecological_partner') {
    const species = speciesFor(card);
    return species
      ? { href: `/relationship-explorer/${encodeURIComponent(species)}`, label: 'Open relationship explorer' }
      : { href: '/relationship-explorer', label: 'Open relationship explorer' };
  }

  return null;
}
