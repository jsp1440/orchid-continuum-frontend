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

export function navigationTargetForCard(card: Card): EcologicalNavigationTarget | null {
  if (isEcologicalCardPending(card)) return null;

  const type = card.type as EcologicalNeighborType;

  if (type === 'species' || type === 'co_occurring_orchid') {
    const species = speciesFor(card);
    return species ? { href: `/species/${encodeURIComponent(species)}`, label: 'Explore species' } : null;
  }

  if (type === 'geography') {
    const country = firstGeoValue(card);
    return country ? { href: `/atlas?country=${encodeURIComponent(country)}`, label: 'Open atlas' } : null;
  }

  if (type === 'habitat' || type === 'host_tree') {
    const slug = slugify(txt(card.evidenceValue) || card.title);
    return slug ? { href: `/habitat/${slug}`, label: 'Explore habitat' } : null;
  }

  if (type === 'pollinator') {
    const slug = slugify(txt(card.evidenceValue) || card.title);
    return slug ? { href: `/pollinators/${slug}`, label: 'Explore pollinator' } : null;
  }

  if (type === 'fungus' || type === 'fungal_dependency') {
    const slug = slugify(txt(card.evidenceValue) || card.title);
    return slug ? { href: `/fungi/${slug}`, label: 'Explore fungi' } : null;
  }

  if (type === 'conservation') {
    const slug = slugify(txt(card.evidenceValue) || card.title);
    return slug ? { href: `/conservation/${slug}`, label: 'Explore conservation' } : null;
  }

  if (type === 'knowledge' || type === 'ecological_partner') {
    const species = speciesFor(card);
    return species
      ? { href: `/knowledge?species=${encodeURIComponent(species)}`, label: 'Open knowledge graph' }
      : { href: '/knowledge', label: 'Open knowledge graph' };
  }

  return null;
}
