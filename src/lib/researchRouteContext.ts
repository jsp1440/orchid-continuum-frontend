import { FEATURED_TAXON_ORIGIN } from '@/lib/featuredTaxonNavigation';
import { ATLAS_NEXT_RESEARCH_ORIGIN } from '@/features/atlas-next/researchHandoff';
import { MATRIX_RESEARCH_ORIGIN, parseMatrixResearchContext } from '@/lib/matrixResearchNavigation';

const MAX_GENUS_CHARACTERS = 120;
const MAX_PROJECT_CHARACTERS = 160;
const SAFE_GENUS = /^[A-Z][A-Za-z-]+$/;
const SAFE_PROJECT = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export type ResearchRouteOrigin =
  | typeof FEATURED_TAXON_ORIGIN
  | typeof ATLAS_NEXT_RESEARCH_ORIGIN
  | typeof MATRIX_RESEARCH_ORIGIN;

export type ResearchRouteContext = {
  origin: ResearchRouteOrigin;
  genus: string;
  taxon: string | null;
  projectId: string | null;
  contextIsEvidence: false;
  contextIsIdentification: false;
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
 * Only governed origins are accepted. Matrix candidate context is explicitly
 * neither evidence nor a verified identification. Locality, coordinates,
 * occurrence/catalogue identifiers, collector/site/grid/GPS/elevation data,
 * and all other route material are ignored at this module boundary.
 */
export function parseResearchRouteContext(search: string | URLSearchParams): ResearchRouteContext | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const matrixContext = parseMatrixResearchContext(params);
  if (matrixContext) {
    return {
      origin: MATRIX_RESEARCH_ORIGIN,
      genus: matrixContext.genus,
      taxon: matrixContext.taxon,
      projectId: null,
      contextIsEvidence: false,
      contextIsIdentification: false,
    };
  }

  const origin = params.get('origin');
  if (origin !== FEATURED_TAXON_ORIGIN && origin !== ATLAS_NEXT_RESEARCH_ORIGIN) return null;

  const genus = boundedGenus(params.get('genus'));
  if (!genus) return null;

  const evidenceFlag = params.get('context_is_evidence');
  if (origin === ATLAS_NEXT_RESEARCH_ORIGIN && evidenceFlag !== 'false') return null;

  return {
    origin,
    genus,
    taxon: null,
    projectId: boundedProject(params.get('project')),
    contextIsEvidence: false,
    contextIsIdentification: false,
  };
}
