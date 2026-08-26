import { describe, expect, it } from 'vitest';

import { atlasOccurrenceEvidenceCalyxHref } from '@/features/atlas-next/calyxHandoff';
import { buildCalyxTurnContext, parseCalyxRouteContext } from '@/lib/calyxConversation';
import { calyxQuestionContextFields } from '@/lib/calyxService';
import type { BrainMission, MissionConclusion } from '@/lib/calyxWorkspace';
import { checkCalyxMissionClaim } from '@/lib/calyxVerification';
import {
  ATLAS_WORKSPACE_ORIGIN,
  FEATURED_TAXON_ORIGIN,
  atlasWorkspaceCalyxHref,
  featuredTaxonAtlasHref,
  featuredTaxonCalyxHref,
} from '@/lib/featuredTaxonNavigation';
import { researchStationCalyxHref } from '@/lib/researchStationNavigation';

const DEMO_GENUS = 'Phalaenopsis';

describe('Partner-neutral Orchid Continuum demo journey continuity', () => {
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
      projectId: 'oc-demo',
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
      projectId: 'oc-demo-phalaenopsis',
      conversationId: 'conversation-phalaenopsis',
    });
    const calyxUrl = new URL(href, 'https://orchidcontinuum.org');

    expect(calyxUrl.pathname).toBe('/calyx');
    expect(calyxUrl.searchParams.get('genus')).toBe('Phalaenopsis');
    expect(calyxUrl.searchParams.get('taxon')).toBe('Phalaenopsis amabilis');
    expect(calyxUrl.searchParams.get('project')).toBe('oc-demo-phalaenopsis');
    expect(calyxUrl.searchParams.get('conversation')).toBe('conversation-phalaenopsis');
    expect(calyxUrl.searchParams.get('origin')).toBe('research-station');

    const turnContext = buildCalyxTurnContext({
      projectId: calyxUrl.searchParams.get('project') ?? '',
      uploadedFiles: [],
      routeSearch: calyxUrl.search,
    });

    expect(turnContext.project_id).toBe('oc-demo-phalaenopsis');
    expect(turnContext.route_context).toEqual({
      origin: 'research-station',
      featured_taxon: { rank: 'genus', accepted_name: 'Phalaenopsis' },
      taxon: 'Phalaenopsis amabilis',
      taxon_source: 'research-station',
      taxon_is_evidence: false,
    });
  });

  it('keeps Research taxon and Lexicon current-question context jointly non-evidentiary', () => {
    const href = researchStationCalyxHref({
      taxon: 'Phalaenopsis amabilis',
      projectId: 'oc-demo-phalaenopsis',
      conversationId: 'conversation-phalaenopsis',
    });
    const calyxUrl = new URL(href, 'https://orchidcontinuum.org');
    const turnContext = buildCalyxTurnContext({
      projectId: 'oc-demo-phalaenopsis',
      uploadedFiles: [],
      routeSearch: calyxUrl.search,
    });
    const questionContext = calyxQuestionContextFields(
      '  What evidence supports its native habitat and pollination ecology?  ',
    );

    expect(turnContext.route_context).toMatchObject({
      origin: 'research-station',
      featured_taxon: { rank: 'genus', accepted_name: 'Phalaenopsis' },
      taxon: 'Phalaenopsis amabilis',
      taxon_source: 'research-station',
      taxon_is_evidence: false,
    });
    expect(questionContext).toEqual({
      current_question: 'What evidence supports its native habitat and pollination ecology?',
      current_question_source: 'user',
      current_question_is_evidence: false,
    });
    expect((turnContext.route_context as Record<string, unknown>).taxon_is_evidence).toBe(false);
    expect(questionContext.current_question_is_evidence).toBe(false);
  });

  it('keeps context out of Check Calyx evidence while preserving source-bound provenance', () => {
    const href = researchStationCalyxHref({
      taxon: 'Phalaenopsis amabilis',
      projectId: 'oc-demo-phalaenopsis',
      conversationId: 'conversation-phalaenopsis',
    });
    const calyxUrl = new URL(href, 'https://orchidcontinuum.org');
    const turnContext = buildCalyxTurnContext({
      projectId: 'oc-demo-phalaenopsis',
      uploadedFiles: [],
      routeSearch: calyxUrl.search,
    });
    const questionContext = calyxQuestionContextFields(
      'What evidence supports its native habitat and pollination ecology?',
    );

    const mission = {
      mission_id: 'mission-oc-demo-phalaenopsis',
      project_id: 'oc-demo-phalaenopsis',
      question: questionContext.current_question,
      state: 'AWAITING_HUMAN_REVIEW',
      current_stage: 'eligible_for_publication_state',
      steps_executed: 10,
      sources: [
        {
          result_id: 'source-phalaenopsis-1',
          title: 'Phalaenopsis habitat evidence',
          object_type: 'literature',
          authorized_excerpt: 'The reviewed source reports the species in humid lowland forest habitat.',
          citation: {
            revision_id: 4101,
            source_anchor_ids: [40101],
            locator: { page: 4, section: 'Habitat', char_start: 420, char_end: 500 },
          },
        },
      ],
      supporting_evidence: [
        {
          candidate_id: 1701,
          subject: 'Phalaenopsis amabilis',
          predicate: 'reported_habitat',
          value: 'humid lowland forest',
          source_revision_id: 4101,
          source_anchor_ids: [40101],
        },
      ],
      contradicting_evidence: [],
      missing_evidence: [],
      confidence: 0.8,
      conclusions: [],
      reasoning_ledger: { ledger_id: 'ledger-oc-demo-phalaenopsis', version: 1 },
      validation: { valid: true, blockers: [] },
      review_status: 'HUMAN_REVIEW_REQUIRED',
      publication_eligibility: {
        eligible: false,
        automatic_publication: false,
        blockers: ['HUMAN_REVIEW_REQUIRED'],
      },
      blockers: [],
      partial: false,
      created_at: '2026-08-21T00:00:00Z',
      updated_at: '2026-08-21T00:00:01Z',
      artifacts: {
        canonical_evidence: [
          {
            revision_id: 4101,
            text: 'The reviewed source reports the species in humid lowland forest habitat.',
            display_policy: 'AUTHORIZED_EXCERPT',
            source_anchors: [
              {
                anchor_id: 40101,
                ordered_span: 0,
                locator: { page: 4, section: 'Habitat', char_start: 420, char_end: 500 },
              },
            ],
            metadata: { content_hash: 'b'.repeat(64) },
          },
        ],
      },
    } as BrainMission;
    const conclusion: MissionConclusion = {
      type: 'synthesis',
      text: 'The current reviewed evidence supports humid lowland forest as habitat for Phalaenopsis amabilis.',
      claim_ids: [1701],
    };

    const verification = checkCalyxMissionClaim(mission, conclusion);
    const route = turnContext.route_context as Record<string, unknown>;

    expect(route.taxon_is_evidence).toBe(false);
    expect(questionContext.current_question_is_evidence).toBe(false);
    expect(verification.operation).toBe('CHECK_CALYX');
    expect(verification.verificationStatus).toBe('verified');
    expect(verification.evidence).toHaveLength(1);
    expect(verification.evidence[0]).toMatchObject({
      candidateId: '1701',
      role: 'support',
      sourceRevisionId: '4101',
      anchorIds: ['40101'],
      contentHash: 'b'.repeat(64),
    });
    expect(verification.evidence[0].statement).not.toContain(questionContext.current_question as string);
    expect(verification.provenance).toMatchObject({
      missionId: 'mission-oc-demo-phalaenopsis',
      reasoningLedgerId: 'ledger-oc-demo-phalaenopsis',
      reasoningLedgerVersion: 1,
      sourceRevisionIds: ['4101'],
      automaticPublication: false,
    });
    expect(verification.provenance.sourceRevisionIds).not.toContain('Phalaenopsis amabilis');
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
      projectId: 'oc-demo',
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
