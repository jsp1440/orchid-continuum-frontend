import { describe, expect, it } from 'vitest';

import { atlasOccurrenceEvidenceCalyxHref } from '@/features/atlas-next/calyxHandoff';
import { buildCalyxTurnContext, parseCalyxRouteContext } from '@/lib/calyxConversation';
import {
  ATLAS_WORKSPACE_ORIGIN,
  FEATURED_TAXON_ORIGIN,
  atlasWorkspaceCalyxHref,
  featuredTaxonAtlasHref,
  featuredTaxonCalyxHref,
} from '@/lib/featuredTaxonNavigation';
import { researchStationCalyxHref } from '@/lib/researchStationNavigation';

const DEMO_GENUS = 'Vanilla';

describe('NAOCC demo continuity', () => {
  it('carries the featured genus from the homepage into canonical Atlas filtering', () => {
    const atlasUrl = new URL(featuredTaxonAtlasHref(DEMO_GENUS), 'https://orchidcontinuum.org');

    expect(atlasUrl.pathname).toBe('/atlas');
    expect(atlasUrl.searchParams.get('genera')).toBe(DEMO_GENUS);
  });

  it('carries the same featured genus directly into Calyx route context', () => {
    const calyxUrl = new URL(featuredTaxonCalyxHref(DEMO_GENUS), 'https://orchidcontinuum.org');
    const routeContext = parseCalyxRouteContext(calyxUrl.search);

    expect(calyxUrl.pathname).toBe('/calyx');
    expect(routeContext).toEqual({
      origin: FEATURED_TAXON_ORIGIN,
      featuredTaxon: { rank: 'genus', name: DEMO_GENUS },
      questionContext: null,
    });
  });

  it('continues the mounted Atlas single-genus context into Calyx', () => {
    const calyxUrl = new URL(atlasWorkspaceCalyxHref(DEMO_GENUS), 'https://orchidcontinuum.org');
    const routeContext = parseCalyxRouteContext(calyxUrl.search);

    expect(calyxUrl.pathname).toBe('/calyx');
    expect(routeContext).toEqual({
      origin: ATLAS_WORKSPACE_ORIGIN,
      featuredTaxon: { rank: 'genus', name: DEMO_GENUS },
      questionContext: null,
    });
  });

  it('continues an Atlas scientific question into Calyx as non-evidentiary interaction context', () => {
    const href = atlasOccurrenceEvidenceCalyxHref(
      DEMO_GENUS,
      'What ecological evidence helps explain this distribution?',
    );
    expect(href).not.toBeNull();

    const calyxUrl = new URL(href as string, 'https://orchidcontinuum.org');
    const turnContext = buildCalyxTurnContext({
      projectId: 'naocc-demo',
      uploadedFiles: [],
      routeSearch: calyxUrl.search,
    });

    expect(turnContext.route_context).toEqual({
      origin: 'atlas-next-occurrence-evidence',
      featured_taxon: { rank: 'genus', accepted_name: DEMO_GENUS },
      question: 'What ecological evidence helps explain this distribution?',
      question_source: 'user',
      question_is_evidence: false,
    });
  });

  it('carries a Research species, project, and conversation into Calyx without promoting the species to evidence', () => {
    const href = researchStationCalyxHref({
      taxon: 'Phalaenopsis amabilis',
      projectId: 'naocc-phalaenopsis',
      conversationId: 'conversation-phalaenopsis',
    });
    const calyxUrl = new URL(href, 'https://orchidcontinuum.org');

    expect(calyxUrl.pathname).toBe('/calyx');
    expect(calyxUrl.searchParams.get('genus')).toBe('Phalaenopsis');
    expect(calyxUrl.searchParams.get('taxon')).toBe('Phalaenopsis amabilis');
    expect(calyxUrl.searchParams.get('project')).toBe('naocc-phalaenopsis');
    expect(calyxUrl.searchParams.get('conversation')).toBe('conversation-phalaenopsis');
    expect(calyxUrl.searchParams.get('origin')).toBe('research-station');

    const turnContext = buildCalyxTurnContext({
      projectId: calyxUrl.searchParams.get('project') ?? '',
      uploadedFiles: [],
      routeSearch: calyxUrl.search,
    });

    expect(turnContext.project_id).toBe('naocc-phalaenopsis');
    expect(turnContext.route_context).toEqual({
      origin: 'research-station',
      featured_taxon: { rank: 'genus', accepted_name: 'Phalaenopsis' },
      taxon: 'Phalaenopsis amabilis',
      taxon_source: 'research-station',
      taxon_is_evidence: false,
    });
  });

  it('never promotes protected occurrence payload into Calyx route context', () => {
    const href = atlasOccurrenceEvidenceCalyxHref(DEMO_GENUS, 'What should we investigate next?');
    expect(href).not.toBeNull();

    const calyxUrl = new URL(href as string, 'https://orchidcontinuum.org');
    calyxUrl.searchParams.set('lat', '-0.12345');
    calyxUrl.searchParams.set('lon', '-78.54321');
    calyxUrl.searchParams.set('locality', 'Sensitive orchid locality');
    calyxUrl.searchParams.set('occurrence_id', 'occ-sensitive-123');
    calyxUrl.searchParams.set('record_id', 'record-sensitive-456');
    calyxUrl.searchParams.set('collector', 'Collector Name');

    const turnContext = buildCalyxTurnContext({
      projectId: 'naocc-demo',
      uploadedFiles: [],
      routeSearch: calyxUrl.search,
    });
    const routeContext = turnContext.route_context as Record<string, unknown>;

    expect(routeContext).toMatchObject({
      featured_taxon: { rank: 'genus', accepted_name: DEMO_GENUS },
      question_source: 'user',
      question_is_evidence: false,
    });
    expect(routeContext).not.toHaveProperty('lat');
    expect(routeContext).not.toHaveProperty('lon');
    expect(routeContext).not.toHaveProperty('locality');
    expect(routeContext).not.toHaveProperty('occurrence_id');
    expect(routeContext).not.toHaveProperty('record_id');
    expect(routeContext).not.toHaveProperty('collector');
  });
});
