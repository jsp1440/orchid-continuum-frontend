import type { FeaturedTaxonContinuum } from '@/lib/featuredTaxonContinuum';

export type PublicCalyxContinuumStatus = 'loading' | 'ready' | 'unavailable';

export type PublicCalyxRelationshipId = 'pollinators' | 'fungi' | 'geography';

export type PublicCalyxRelationshipState =
  | 'loading'
  | 'documented'
  | 'unknown'
  | 'unavailable';

export type PublicCalyxRelationshipContext = {
  id: PublicCalyxRelationshipId;
  label: string;
  state: PublicCalyxRelationshipState;
  count: number | null;
};

export type PublicCalyxGuideModel = {
  genus: string;
  continuumStatus: PublicCalyxContinuumStatus;
  atlasTheme: {
    id: null;
    label: 'No theme selected on homepage';
  };
  evidence: {
    knownDomains: string[];
    gapDomains: string[];
    state: 'loading' | 'available' | 'gaps' | 'unavailable';
  };
  relationships: PublicCalyxRelationshipContext[];
  provenance: 'canonical-continuum' | 'not-available';
};

export type PublicCalyxPrompt = {
  label: string;
  relationship: PublicCalyxRelationshipId | 'evidence';
  question: string;
};

const DOMAIN_LABELS: Record<string, string> = {
  taxonomy: 'taxonomy',
  media: 'media',
  occurrences: 'occurrence geography',
  traits: 'traits',
  literature: 'literature',
  pollinators: 'pollinators',
  conservation: 'conservation',
};

const RELATIONSHIPS: ReadonlyArray<{
  id: PublicCalyxRelationshipId;
  label: string;
  key: 'pollinators' | 'fungi' | 'geography';
}> = [
  { id: 'pollinators', label: 'Pollinators', key: 'pollinators' },
  { id: 'fungi', label: 'Fungi', key: 'fungi' },
  { id: 'geography', label: 'Place', key: 'geography' },
];

function boundedCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function relationshipState(
  status: PublicCalyxContinuumStatus,
  continuum: FeaturedTaxonContinuum | null,
  key: 'pollinators' | 'fungi' | 'geography',
): PublicCalyxRelationshipState {
  if (status === 'loading') return 'loading';
  if (status !== 'ready' || !continuum?.relationships) return 'unavailable';
  return continuum.relationships[key].hasData ? 'documented' : 'unknown';
}

function relationshipCount(
  status: PublicCalyxContinuumStatus,
  continuum: FeaturedTaxonContinuum | null,
  key: 'pollinators' | 'fungi' | 'geography',
): number | null {
  if (status !== 'ready' || !continuum?.relationships) return null;
  const node = continuum.relationships[key];
  return node.hasData ? boundedCount(node.count) : null;
}

function evidenceState(
  status: PublicCalyxContinuumStatus,
  continuum: FeaturedTaxonContinuum | null,
): PublicCalyxGuideModel['evidence'] {
  if (status === 'loading') return { knownDomains: [], gapDomains: [], state: 'loading' };
  if (status !== 'ready' || !continuum) {
    return { knownDomains: [], gapDomains: [], state: 'unavailable' };
  }

  const knownDomains = continuum.domains
    .filter((domain) => domain.state === 'known')
    .map((domain) => DOMAIN_LABELS[domain.domain] ?? domain.domain);
  const gapDomains = continuum.domains
    .filter((domain) => domain.state === 'unknown')
    .map((domain) => DOMAIN_LABELS[domain.domain] ?? domain.domain);

  return {
    knownDomains,
    gapDomains,
    state: knownDomains.length ? 'available' : gapDomains.length ? 'gaps' : 'unavailable',
  };
}

/**
 * Build the bounded page context shown by Public Calyx.
 *
 * Relationship counts and graph-domain states come from the canonical featured
 * taxon read model. We deliberately omit backend summaries/items here: public
 * Calyx needs enough context to ask a useful question, but it must not echo
 * unbounded backend text or turn an unknown state into biological absence.
 */
export function buildPublicCalyxGuideModel(options: {
  genus: string;
  continuum: FeaturedTaxonContinuum | null;
  continuumStatus: PublicCalyxContinuumStatus;
}): PublicCalyxGuideModel {
  const { genus, continuum, continuumStatus } = options;
  const relationships = RELATIONSHIPS.map(({ id, label, key }) => ({
    id,
    label,
    state: relationshipState(continuumStatus, continuum, key),
    count: relationshipCount(continuumStatus, continuum, key),
  }));

  return {
    genus,
    continuumStatus,
    atlasTheme: { id: null, label: 'No theme selected on homepage' },
    evidence: evidenceState(continuumStatus, continuum),
    relationships,
    provenance: continuumStatus === 'ready' && continuum ? 'canonical-continuum' : 'not-available',
  };
}

function relationshipQuestion(
  model: PublicCalyxGuideModel,
  id: PublicCalyxRelationshipId,
  documentedQuestion: string,
  unknownQuestion: string,
): string {
  const relationship = model.relationships.find((item) => item.id === id);
  if (relationship?.state === 'documented') return documentedQuestion;
  if (relationship?.state === 'unknown') return unknownQuestion;
  return `What is currently known about ${relationship?.label.toLowerCase() ?? id} for ${model.genus}?`;
}

/** Prompts are interaction context, never a claim about scientific evidence. */
export function buildPublicCalyxPrompts(model: PublicCalyxGuideModel): PublicCalyxPrompt[] {
  return [
    {
      label: 'Pollination',
      relationship: 'pollinators',
      question: relationshipQuestion(
        model,
        'pollinators',
        `What does the documented pollinator evidence for ${model.genus} actually show?`,
        `Why is missing pollinator evidence for ${model.genus} scientifically useful?`,
      ),
    },
    {
      label: 'Fungi',
      relationship: 'fungi',
      question: relationshipQuestion(
        model,
        'fungi',
        `What do the documented fungal partnerships tell us about ${model.genus}?`,
        `What would researchers need to document the fungal partners of ${model.genus}?`,
      ),
    },
    {
      label: 'Place',
      relationship: 'geography',
      question: relationshipQuestion(
        model,
        'geography',
        `What can the occurrence evidence tell us about where ${model.genus} is known?`,
        `What does it mean when geographic evidence is not yet linked for ${model.genus}?`,
      ),
    },
    {
      label: 'Evidence',
      relationship: 'evidence',
      question: model.evidence.gapDomains.length
        ? `Which evidence gaps for ${model.genus} would be most valuable to close next?`
        : `Which sources support what the Continuum currently shows for ${model.genus}?`,
    },
  ];
}

export function relationshipStatusLabel(
  relationship: PublicCalyxRelationshipContext,
): string {
  if (relationship.state === 'loading') return 'Loading canonical state';
  if (relationship.state === 'unavailable') return 'Unavailable; no claim made';
  if (relationship.state === 'unknown') return 'No linked evidence in this traversal';
  if (relationship.count === null) return 'Linked evidence available';
  return `${relationship.count.toLocaleString()} linked record${relationship.count === 1 ? '' : 's'}`;
}

export function evidenceStatusLabel(model: PublicCalyxGuideModel): string {
  if (model.evidence.state === 'loading') return 'Loading canonical graph state';
  if (model.evidence.state === 'unavailable') return 'Unavailable; no fallback substituted';
  if (model.evidence.state === 'gaps') return 'Known graph gaps remain; unknown is not absence';
  return `${model.evidence.knownDomains.length} canonical domain${model.evidence.knownDomains.length === 1 ? '' : 's'} linked`;
}
