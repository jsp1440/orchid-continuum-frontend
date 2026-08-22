import {
  SPECIES_DOSSIER_MATRIX_ORIGIN,
  parseSpeciesDossierMatrixContext,
} from '@/lib/speciesDossierMatrixNavigation';
import { RESEARCH_STATION_ORIGIN } from '@/lib/researchStationNavigation';

export interface IdentificationSourceContext {
  source?: 'lexicon' | typeof SPECIES_DOSSIER_MATRIX_ORIGIN | typeof RESEARCH_STATION_ORIGIN;
  concept?: string;
  label?: string;
  taxonId?: string;
  taxonLabel?: string | null;
  /** The research project the visitor arrived from, for the return path. */
  projectId?: string | null;
  contextIsObservation?: false;
  contextIsEvidence?: false;
}

export const MAX_IDENTIFICATION_CONTEXT_TEXT = 160;

const UNSAFE_CONTEXT_PUNCTUATION = /[<>{}\\]/;
const SAFE_PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

/**
 * Fail closed rather than truncate.
 *
 * boundedContextText slices an over-long value, which is right for a display
 * label but wrong for a taxon: a truncated binomial is a different name, and
 * silently showing one as the visitor's subject is worse than showing none.
 */
function strictTaxonText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (
    !text ||
    text.length > MAX_IDENTIFICATION_CONTEXT_TEXT ||
    hasControlCharacter(text) ||
    UNSAFE_CONTEXT_PUNCTUATION.test(text)
  ) {
    return null;
  }
  return text;
}


// This module carries bounded navigation context into Matrix. The reverse
// Matrix -> Lexicon direction is served by resolveMatrixCharacterLexicon(),
// which requires a reviewed canonical concept ID and reports 'unmapped' rather
// than deriving a lexicon lookup from a character label. Dossier taxon identity
// is navigation context only and is never promoted into an observation/evidence
// claim here.

function boundedContextText(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text ? text.slice(0, MAX_IDENTIFICATION_CONTEXT_TEXT) : undefined;
}

export function matrixHrefForLexiconConcept(slug: string, label: string): string {
  const params = new URLSearchParams();
  const boundedSlug = boundedContextText(slug);
  const boundedLabel = boundedContextText(label);
  if (boundedSlug) params.set('concept', boundedSlug);
  if (boundedLabel) params.set('label', boundedLabel);
  const query = params.toString();
  return query ? `/orchid-identification?${query}` : '/orchid-identification';
}

/**
 * A Research Station arrival.
 *
 * researchStationMatrixHref sends the investigation's subject here as `taxon`
 * with `origin=research-station`. Nothing read that, so the handoff landed with
 * the subject dropped entirely and no route back to the station — the visitor
 * left an investigation and arrived at a blank identification tool.
 *
 * The taxon is inbound navigation context, exactly as it is on every other leg
 * of the fan-out. It is not a Matrix observation and not an identification, and
 * this parser cannot make it one: it only reads a name the Research Station
 * already had.
 */
function readResearchStationContext(search: string): IdentificationSourceContext | null {
  const params = new URLSearchParams(search);
  if (params.get('origin') !== RESEARCH_STATION_ORIGIN) return null;

  const taxonLabel = strictTaxonText(params.get('taxon'));
  if (!taxonLabel) return null;

  const rawProject = params.get('project')?.trim();
  const projectId =
    rawProject && rawProject.length <= MAX_IDENTIFICATION_CONTEXT_TEXT && SAFE_PROJECT_ID.test(rawProject)
      ? rawProject
      : null;

  return {
    source: RESEARCH_STATION_ORIGIN,
    taxonLabel,
    projectId,
    contextIsObservation: false,
    contextIsEvidence: false,
  };
}

export function readIdentificationSourceContext(search: string): IdentificationSourceContext {
  const research = readResearchStationContext(search);
  if (research) return research;

  const dossier = parseSpeciesDossierMatrixContext(search);
  if (dossier) {
    return {
      source: SPECIES_DOSSIER_MATRIX_ORIGIN,
      taxonId: dossier.taxonId,
      taxonLabel: dossier.taxonLabel,
      contextIsObservation: false,
      contextIsEvidence: false,
    };
  }

  const params = new URLSearchParams(search);
  const concept = boundedContextText(params.get('concept'));
  const label = boundedContextText(params.get('label'));
  return { concept, label };
}
