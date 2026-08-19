import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowedReviewerDecisions } from '@/components/university/UniversityReviewerPanel';
import {
  universityReviewerApi,
  type UniversityReviewerContext,
} from './universityReviewerApi';

const baseContext: UniversityReviewerContext = {
  principal_id: 'owner',
  authenticated: true,
  roles: ['ADMINISTRATOR', 'PUBLIC'],
  qualifications: [],
  specialties: [],
  effective_capabilities: [
    'mission_control.view.public',
    'mission_control.view.operations',
  ],
  science_review_allowed: false,
  expert_review_allowed: false,
  durable_sessions_enabled: true,
  governance: {
    administrator_role_does_not_imply_scientific_authority: true,
    learner_identity_does_not_imply_reviewer_authority: true,
    publication_performed: false,
    candidate_knowledge_promoted: false,
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('University reviewer decision gating', () => {
  it('gives an authenticated administrator no scientific decisions without qualification', () => {
    expect(allowedReviewerDecisions(baseContext)).toEqual([]);
  });

  it('allows learning review with science qualification but not Candidate Knowledge consideration', () => {
    const context: UniversityReviewerContext = {
      ...baseContext,
      qualifications: ['qualified.science-reviewer'],
      effective_capabilities: [...baseContext.effective_capabilities, 'review.science'],
      science_review_allowed: true,
    };
    expect(allowedReviewerDecisions(context)).toEqual([
      'changes_requested',
      'approved_for_learning',
    ]);
  });

  it('adds Candidate Knowledge consideration only for expert authority', () => {
    const context: UniversityReviewerContext = {
      ...baseContext,
      qualifications: ['qualified.expert-reviewer'],
      effective_capabilities: [...baseContext.effective_capabilities, 'review.science', 'review.expert'],
      science_review_allowed: true,
      expert_review_allowed: true,
    };
    expect(allowedReviewerDecisions(context)).toEqual([
      'changes_requested',
      'approved_for_learning',
      'approved_for_candidate_knowledge_consideration',
    ]);
  });
});

describe('universityReviewerApi', () => {
  it('requests governed reviewer context using the existing owner-session transport', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => baseContext,
    });
    vi.stubGlobal('fetch', fetchMock);
    const context = await universityReviewerApi.context();
    expect(context.science_review_allowed).toBe(false);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/learning/reviewer/context');
    expect(init.credentials).toBe('include');
  });

  it('posts the exact reviewed revision and bounded decision payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        review_id: 'r-1',
        session_id: 's-1',
        decision: 'approved_for_candidate_knowledge_consideration',
        reviewed_revision: 12,
        candidate_knowledge_promoted: false,
        publication_performed: false,
        created_at: '2026-08-07T19:50:00Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await universityReviewerApi.decide('s-1', {
      reviewed_revision: 12,
      decision: 'approved_for_candidate_knowledge_consideration',
      notes: 'Evidence is sufficient for separate expert consideration.',
    });
    expect(result.candidate_knowledge_promoted).toBe(false);
    expect(result.publication_performed).toBe(false);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      reviewed_revision: 12,
      decision: 'approved_for_candidate_knowledge_consideration',
      notes: 'Evidence is sufficient for separate expert consideration.',
    });
  });

  it('URL-encodes reviewer session identifiers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await universityReviewerApi.session('session/with space');
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/learning/reviewer/sessions/session%2Fwith%20space');
  });
});
