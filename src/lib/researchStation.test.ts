import { describe, expect, it } from 'vitest';
import {
  buildResearchDossier,
  researchStationCalyxQuestion,
  type ResearchProject,
} from '@/lib/researchStation';
import {
  assertNoLocalityLeak,
  researchStationAtlasHref,
  researchStationCalyxHref,
  researchStationHref,
  researchStationLexiconHref,
  researchStationMatrixHref,
  researchStationRelationshipsHref,
  RESEARCH_STATION_ORIGIN,
} from '@/lib/researchStationNavigation';

const project: ResearchProject = {
  project_id: 'proj-1',
  title: 'Velamen and epiphytic water relations',
  research_question: 'Does velamen thickness track drought exposure?',
  hypothesis: 'Thicker velamen occurs in more seasonally dry canopies.',
  status: 'ACTIVE',
};

describe('research dossier', () => {
  const dossier = buildResearchDossier({
    project,
    taxa: [
      { project_id: 'proj-1', taxon_id: 'Phalaenopsis amabilis', relationship: 'SUBJECT' },
      { project_id: 'proj-1', taxon_id: 'Vanda tricolor', relationship: 'COMPARISON' },
      { project_id: 'proj-1', taxon_id: 'Dendrobium', relationship: 'CONTEXT' },
    ],
    documents: [
      { project_id: 'proj-1', document_id: 'doc-source', relationship: 'SOURCE' },
      { project_id: 'proj-1', document_id: 'doc-background', relationship: 'BACKGROUND' },
      { project_id: 'proj-1', document_id: 'doc-conflict', relationship: 'CONTRADICTS' },
      { project_id: 'proj-1', document_id: 'doc-method', relationship: 'METHOD' },
    ],
    evidence: [
      { project_id: 'proj-1', evidence_kind: 'CANDIDATE', evidence_id: 'cand-1' },
    ],
    notes: [
      { note_id: 'n1', project_id: 'proj-1', body: 'General note', note_type: 'GENERAL' },
      { note_id: 'n2', project_id: 'proj-1', body: 'Open question', note_type: 'QUESTION' },
    ],
  });

  it('identifies the subject taxon separately from comparisons and context', () => {
    expect(dossier.subject?.taxon_id).toBe('Phalaenopsis amabilis');
    expect(dossier.comparisons.map((item) => item.taxon_id)).toEqual(['Vanda tricolor']);
    expect(dossier.context.map((item) => item.taxon_id)).toEqual(['Dendrobium']);
  });

  it('keeps contradicting sources apart from supporting evidence', () => {
    expect(dossier.conflicts.map((item) => item.document_id)).toEqual(['doc-conflict']);
    expect(dossier.supporting.map((item) => item.document_id)).toEqual([
      'doc-source',
      'doc-background',
    ]);
    // A contradiction must never be counted as support.
    expect(dossier.supporting.some((item) => item.relationship === 'CONTRADICTS')).toBe(false);
  });

  it('separates method documents from evidence', () => {
    expect(dossier.methods.map((item) => item.document_id)).toEqual(['doc-method']);
    expect(dossier.supporting.some((item) => item.document_id === 'doc-method')).toBe(false);
  });

  it('surfaces only recorded questions as open questions', () => {
    expect(dossier.openQuestions.map((item) => item.note_id)).toEqual(['n2']);
  });

  it('reports an empty evidence record as empty rather than as a finding', () => {
    const empty = buildResearchDossier({
      project,
      taxa: [],
      documents: [],
      evidence: [],
      notes: [],
    });
    expect(empty.evidenceEmpty).toBe(true);
    expect(empty.subject).toBeNull();
    expect(empty.conflicts).toEqual([]);
  });

  it('does not treat a project with evidence as empty', () => {
    expect(dossier.evidenceEmpty).toBe(false);
  });
});

describe('carrying the investigation into Calyx', () => {
  it('combines the research question with the subject taxon', () => {
    const dossier = buildResearchDossier({
      project,
      taxa: [{ project_id: 'proj-1', taxon_id: 'Phalaenopsis amabilis', relationship: 'SUBJECT' }],
      documents: [],
      evidence: [],
      notes: [],
    });
    expect(researchStationCalyxQuestion(dossier)).toBe(
      'Regarding Phalaenopsis amabilis: Does velamen thickness track drought exposure?',
    );
  });

  it('never invents a research question the project does not hold', () => {
    const dossier = buildResearchDossier({
      project: { ...project, research_question: null },
      taxa: [{ project_id: 'proj-1', taxon_id: 'Phalaenopsis amabilis', relationship: 'SUBJECT' }],
      documents: [],
      evidence: [],
      notes: [],
    });
    expect(researchStationCalyxQuestion(dossier)).toBeNull();
  });
});

describe('cross-module context continuity', () => {
  const context = { taxon: 'Phalaenopsis amabilis', projectId: 'proj-1' };

  it('carries taxon and project identity into every module', () => {
    for (const href of [
      researchStationAtlasHref(context),
      researchStationCalyxHref(context),
      researchStationRelationshipsHref(context),
      researchStationMatrixHref(context),
      researchStationLexiconHref(context),
    ]) {
      const url = new URL(href, 'https://orchid.test');
      // The taxon travels either in the path or as a query value depending on
      // the destination route; both must decode back to the same identity.
      const carriedTaxon = [
        ...url.searchParams.values(),
        ...decodeURIComponent(url.pathname).split('/'),
      ];
      expect(carriedTaxon).toContain('Phalaenopsis amabilis');
      expect(url.searchParams.get('project')).toBe('proj-1');
      expect(url.searchParams.get('origin')).toBe(RESEARCH_STATION_ORIGIN);
    }
  });

  it('carries a species subject into Calyx without claiming the species is a genus', () => {
    const href = researchStationCalyxHref(context);
    const url = new URL(href, 'https://orchid.test');
    expect(url.searchParams.get('genus')).toBe('Phalaenopsis');
    expect(url.searchParams.get('taxon')).toBe('Phalaenopsis amabilis');
    expect(url.searchParams.get('genus')).not.toBe('Phalaenopsis amabilis');
  });

  it('keeps an unambiguous genus as genus context in Calyx', () => {
    const url = new URL(
      researchStationCalyxHref({ taxon: 'Vanda', projectId: 'proj-1' }),
      'https://orchid.test',
    );
    expect(url.searchParams.get('genus')).toBe('Vanda');
    expect(url.searchParams.has('taxon')).toBe(false);
  });

  it('does not promote an opaque taxon identity into a Calyx genus claim', () => {
    const url = new URL(
      researchStationCalyxHref({ taxon: 'taxon:12345', projectId: 'proj-1' }),
      'https://orchid.test',
    );
    expect(url.searchParams.get('taxon')).toBe('taxon:12345');
    expect(url.searchParams.has('genus')).toBe(false);
  });

  it('continues an existing Calyx conversation instead of restarting the thread', () => {
    const href = researchStationCalyxHref({ ...context, conversationId: 'conv-9' });
    expect(href).toContain('conversation=conv-9');
  });

  it('returns to the station with the project preserved', () => {
    expect(researchStationHref('proj-1')).toBe('/research?project=proj-1');
    expect(researchStationHref('')).toBe('/research');
  });

  it('requires a canonical taxon identity rather than emitting an empty link', () => {
    expect(() => researchStationAtlasHref({ taxon: '  ' })).toThrow(/taxon identity is required/);
  });

  it('omits absent optional context instead of emitting blank parameters', () => {
    const href = researchStationAtlasHref({ taxon: 'Vanda' });
    expect(href).not.toContain('project=');
    expect(href).not.toContain('conversation=');
  });
});

describe('locality never leaks between modules', () => {
  it.each([
    'lat',
    'latitude',
    'lon',
    'lng',
    'longitude',
    'coordinates',
    'locality',
    'location',
    'site',
    'gps',
  ])('refuses to emit a %s parameter', (key) => {
    expect(() => assertNoLocalityLeak({ [key]: '1.234' })).toThrow(/must not carry locality/);
  });

  it('is case-insensitive about locality keys', () => {
    expect(() => assertNoLocalityLeak({ Latitude: '1.0' })).toThrow(/must not carry locality/);
  });

  it('allows the bounded semantic context the station does carry', () => {
    expect(() =>
      assertNoLocalityLeak({ genera: 'Vanda', project: 'proj-1', origin: RESEARCH_STATION_ORIGIN }),
    ).not.toThrow();
  });

  it('keeps every station link free of coordinate context', () => {
    const href = researchStationAtlasHref({ taxon: 'Vanda', projectId: 'proj-1' });
    for (const forbidden of ['lat=', 'lon=', 'lng=', 'locality=', 'coordinates=']) {
      expect(href).not.toContain(forbidden);
    }
  });
});
