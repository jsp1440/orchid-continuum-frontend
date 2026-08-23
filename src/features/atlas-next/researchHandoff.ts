export const ATLAS_NEXT_RESEARCH_ORIGIN = 'atlas-next';
export const ATLAS_NEXT_RESEARCH_CONTEXT_IS_EVIDENCE = false;
export const ATLAS_NEXT_CALYX_ORIGIN = 'atlas-next';
export const ATLAS_NEXT_CALYX_CONTEXT_IS_EVIDENCE = false;

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

export type AtlasNextCalyxContext = {
  /** Canonical genus selected in Atlas Next. Navigation context only. */
  genus: string;
};

export type AtlasNextContinuumAction = {
  id: 'research' | 'calyx';
  label: string;
  href: string;
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

/**
 * Build the Atlas Next → Research Center handoff.
 *
 * This intentionally accepts only canonical genus identity and an optional
 * project identifier. There is no parameter through which an occurrence id,
 * coordinate, locality, collector, catalogue number, site, grid, GPS value, or
 * elevation can cross the module boundary. Research receives the subject as
 * navigation context and must never promote it to scientific evidence.
 */
export function atlasNextResearchHref(context: AtlasNextResearchContext): string | null {
  const genus = boundedGenus(context.genus);
  if (!genus) return null;

  const project = boundedProject(context.projectId);
  const params = new URLSearchParams({
    genus,
    origin: ATLAS_NEXT_RESEARCH_ORIGIN,
    context_is_evidence: String(ATLAS_NEXT_RESEARCH_CONTEXT_IS_EVIDENCE),
  });
  if (project) params.set('project', project);

  return `/research?${params.toString()}`;
}

/**
 * Build the Atlas Next → Calyx handoff for the active genus.
 *
 * Only the bounded canonical genus crosses this boundary. Atlas occurrence
 * selections, coordinates, locality, project identity, collector/catalogue
 * fields, evidence, confidence and conclusions deliberately have no channel.
 * The genus is navigation context and is explicitly marked non-evidentiary.
 */
export function atlasNextCalyxHref(context: AtlasNextCalyxContext): string | null {
  const genus = boundedGenus(context.genus);
  if (!genus) return null;

  const params = new URLSearchParams({
    genus,
    origin: ATLAS_NEXT_CALYX_ORIGIN,
    context_is_evidence: String(ATLAS_NEXT_CALYX_CONTEXT_IS_EVIDENCE),
  });

  return `/calyx?${params.toString()}`;
}

/**
 * Resolve every cross-Continuum action Atlas Next may expose for its active
 * genus. Keeping this as one model prevents the mounted shell from constructing
 * one safe Research link and a subtly different Calyx link by hand.
 *
 * The action set is all-or-nothing on genus validity: malformed active context
 * yields no continuation affordances at all rather than letting one consumer
 * fail open. Project identity remains Research-only and never enters Calyx.
 */
export function atlasNextContinuumActions(
  context: AtlasNextResearchContext,
): AtlasNextContinuumAction[] {
  const researchHref = atlasNextResearchHref(context);
  const calyxHref = atlasNextCalyxHref({ genus: context.genus });
  if (!researchHref || !calyxHref) return [];

  return [
    { id: 'research', label: 'Continue in Research Station', href: researchHref },
    { id: 'calyx', label: 'Ask Calyx about this genus', href: calyxHref },
  ];
}
