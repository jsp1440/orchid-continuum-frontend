export const ATLAS_NEXT_RESEARCH_ORIGIN = 'atlas-next';
export const ATLAS_NEXT_RESEARCH_CONTEXT_IS_EVIDENCE = false;

const MAX_TAXON_CHARACTERS = 120;
const MAX_PROJECT_CHARACTERS = 160;
const SAFE_GENUS = /^[A-Z][A-Za-z-]+$/;
const SAFE_PROJECT = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export type AtlasNextResearchContext = {
  /** Canonical genus selected in Atlas Next. Navigation context only. */
  genus: string;
  /** Persisted research project when the Atlas was entered from one. */
  projectId?: string | null;
};

function boundedGenus(value: string): string | null {
  const genus = String(value ?? '').trim();
  if (!genus || genus.length > MAX_TAXON_CHARACTERS || !SAFE_GENUS.test(genus)) return null;
  return genus;
}

function boundedProject(value: string | null | undefined): string | null {
  const project = String(value ?? '').trim();
  if (!project) return null;
  if (project.length > MAX_PROJECT_CHARACTERS || !SAFE_PROJECT.test(project)) return null;
  return project;
}

function projectWasSupplied(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

/**
 * Build the Atlas Next → Research Center handoff.
 *
 * This intentionally accepts only canonical genus identity and an optional
 * project identifier. There is no parameter through which an occurrence id,
 * coordinate, locality, collector, catalogue number, site, grid, GPS value, or
 * elevation can cross the module boundary. Research receives the subject as
 * navigation context and must never promote it to scientific evidence.
 *
 * If a project was explicitly supplied but is malformed, the entire handoff
 * fails closed. Silently dropping a malformed persisted-project identity would
 * widen the arrival from “this genus in this research project” to an unrelated
 * genus-only Research session, which is a continuity error rather than a safe
 * fallback.
 */
export function atlasNextResearchHref(context: AtlasNextResearchContext): string | null {
  const genus = boundedGenus(context.genus);
  if (!genus) return null;

  const project = boundedProject(context.projectId);
  if (projectWasSupplied(context.projectId) && !project) return null;

  const params = new URLSearchParams({
    genus,
    origin: ATLAS_NEXT_RESEARCH_ORIGIN,
    context_is_evidence: String(ATLAS_NEXT_RESEARCH_CONTEXT_IS_EVIDENCE),
  });
  if (project) params.set('project', project);

  return `/research?${params.toString()}`;
}
