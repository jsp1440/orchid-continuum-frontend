import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_GRAPH_DOMAINS } from '@/lib/knowledgeGraph';
import {
  buildProposedNode,
  buildProposedRelationships,
  GLOSSARY_KG_DOMAINS,
  glossaryNodeId,
  inferDomains,
} from '@/lib/glossary/knowledgeGraph';
import type { NormalizedGlossary } from '@/lib/glossary/types';

function glossary(overrides: Partial<NormalizedGlossary> = {}): NormalizedGlossary {
  return {
    term: 'Velamen',
    definition: 'A spongy epidermis on aerial roots.',
    category: 'morphology',
    synonyms: ['velamen radicum'],
    relatedTerms: ['root', 'epiphyte'],
    source: 'Pridgeon 1987',
    sourceCitation: 'Pridgeon 1987, p. 3',
    notes: null,
    ...overrides,
  };
}

describe('drift guard', () => {
  it('local KG domain mirror stays in sync with the frontend model', () => {
    // If this fails, KNOWLEDGE_GRAPH_DOMAINS changed — update GLOSSARY_KG_DOMAINS.
    expect([...GLOSSARY_KG_DOMAINS]).toEqual([...KNOWLEDGE_GRAPH_DOMAINS]);
  });
});

describe('inferDomains', () => {
  it('maps known category keywords onto KG domains', () => {
    expect(inferDomains('morphology')).toEqual(['traits']);
    expect(inferDomains('taxonomy')).toEqual(['taxonomy']);
    expect(inferDomains('pollination biology')).toEqual(['pollinators']);
    expect(inferDomains('conservation status')).toEqual(['conservation']);
  });

  it('falls back to traits for unknown or missing categories', () => {
    expect(inferDomains(null)).toEqual(['traits']);
    expect(inferDomains('completely unrelated')).toEqual(['traits']);
  });
});

describe('buildProposedNode', () => {
  it('builds a proposed (never-published) node with the documented gap', () => {
    const node = buildProposedNode(glossary(), 'velamen');
    expect(node.id).toBe('glossary:velamen');
    expect(node.nodeType).toBe('glossary_term');
    expect(node.knowledgeObjectType).toBeNull();
    expect(node.publicationStatus).toBe('proposed');
    expect(node.domains).toEqual(['traits']);
  });
});

describe('buildProposedRelationships', () => {
  it('proposes synonym, related, category, and source edges', () => {
    const rels = buildProposedRelationships(glossary(), 'velamen');
    const types = rels.map((r) => r.type);
    expect(types).toEqual(['has_synonym', 'related_to', 'related_to', 'in_category', 'sourced_from']);
    expect(rels.every((r) => r.publicationStatus === 'proposed')).toBe(true);
    expect(rels[0].sourceId).toBe(glossaryNodeId('velamen'));
  });

  it('is deterministic and derives stable target ids', () => {
    expect(buildProposedRelationships(glossary(), 'velamen')).toEqual(
      buildProposedRelationships(glossary(), 'velamen'),
    );
    const rels = buildProposedRelationships(glossary(), 'velamen');
    expect(rels[0].targetId).toBe('glossary:velamen-radicum');
  });

  it('omits category/source edges when those fields are absent', () => {
    const rels = buildProposedRelationships(
      glossary({ category: null, source: null, synonyms: [], relatedTerms: [] }),
      'velamen',
    );
    expect(rels).toEqual([]);
  });
});
