import { FEATURED_TAXON_ORIGIN } from '@/lib/featuredTaxonNavigation';
import { ATLAS_NEXT_RESEARCH_ORIGIN } from '@/features/atlas-next/researchHandoff';

const MAX_GENUS_CHARACTERS = 120;
const MAX_PROJECT_CHARACTERS = 160;
const SAFE_GENUS = /^[A-Z][A-Za-z-]+$/;
const SAFE_PROJECT = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export type ResearchRouteOrigin = typeof FEATURED_TAXON_ORIGIN | typeof ATLAS_NEXT_RESEARCH_ORIGIN;

export type ResearchRouteContext = {
  origin: ResearchRouteOrigin;
  genus: string;
  projectId: string | null;
  contextIsEvidence: false;
};

function boundedGenus(value: string | null): string | null {
  const genus = String(value ?? '').trim();
  if (!genus || genus.length > MAX_GENUS_CHARACTERS || !SAFE_GENUS.test(genus)) return null;
  return genus;
}

function boundedProject(value: string | null): string | null {
  const project = String(value ?? '').trim();
  if (!project) return null;
  if (project.length > MAX_PROJECT_CHARACTERS || !SAFE_PROJECT.test(project)) return null;
  return project;
}

/**
 * Parse navigation context entering Research Center.
 *
 * Only the two governed origins are accepted. The parser intentionally reads
 * genus, project, origin, and context_is_evidence only; locality, coordinates,
 * occurrence identifiers, collector/catalogue fields, site/grid/GPS/elevation,
 * and all other route material are ignored at this module boundary.
 */
export function parseResearchRouteContext(search: string | URLSearchParams): ResearchRouteContext | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const origin = params.get('origin');
  if (origin !== FEATURED_TAXON_ORIGIN && origin !== ATLAS_NEXT_RESEARCH_ORIGIN) return null;

  const genus = boundedGenus(params.get('genus'));
  if (!genus) return null;

  // Navigation context is never scientific evidence. A malformed or truthy
  // route assertion fails closed rather than upgrading the context boundary.
  const evidenceFlag = params.get('context_is_evidence');
  if (origin === ATLAS_NEXT_RESEARCH_ORIGIN && evidenceFlag !== 'false') return null;

  return {
    origin,
    genus,
    projectId: boundedProject(params.get('project')),
    contextIsEvidence: false,
  };
}
