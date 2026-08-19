import { afterEach, describe, expect, it, vi } from 'vitest';
import { universityApi } from './universityApi';
import {
  releaseBlockers,
  releaseMode,
  safeScienceContent,
  summarizeRelease,
  type UniversityReleaseReadiness,
} from './universityRelease';

afterEach(() => {
  vi.restoreAllMocks();
});

const readOnlyRelease: UniversityReleaseReadiness = {
  release_contract: 'OCU-RELEASE-003',
  content_contract: 'OCU-SCI-003',
  university_enabled: true,
  read_only_ready: true,
  session_writes_enabled: false,
  learner_auth_enabled: false,
  persistence: 'process_local_memory',
  durable_sessions_enabled: false,
  durable_gate: {
    session_writes_enabled: false,
    learner_auth_enabled: false,
    durable_flag_enabled: false,
    read_only_release_verified: false,
    release_evidence_present: false,
    release_evidence_valid: false,
    release_evidence_id: null,
    durable_sessions_enabled: false,
  },
  publication_enabled: false,
  candidate_knowledge_writes_enabled: false,
  calyx_model_calls_enabled: false,
  human_review_required: true,
  required_read_only_configuration: {
    OCU_UNIVERSITY_ENABLED: true,
    OCU_UNIVERSITY_SESSION_WRITES_ENABLED: false,
  },
  required_durable_identity_configuration: {
    OCU_UNIVERSITY_LEARNER_AUTH_ENABLED: true,
  },
};

const durableRelease: UniversityReleaseReadiness = {
  ...readOnlyRelease,
  read_only_ready: false,
  session_writes_enabled: true,
  learner_auth_enabled: true,
  persistence: 'postgres_durable',
  durable_sessions_enabled: true,
  durable_gate: {
    session_writes_enabled: true,
    learner_auth_enabled: true,
    durable_flag_enabled: true,
    read_only_release_verified: true,
    release_evidence_present: true,
    release_evidence_valid: true,
    release_evidence_id: `sha256:${'a'.repeat(64)}`,
    durable_sessions_enabled: true,
  },
};

describe('University release contract', () => {
  it('accepts the safe read-only contract without learner auth', () => {
    expect(releaseMode(readOnlyRelease)).toBe('read_only');
    expect(safeScienceContent(readOnlyRelease)).toBe(true);
    expect(releaseBlockers(readOnlyRelease)).toEqual([]);
    expect(summarizeRelease(readOnlyRelease)).toBe('Read-only University release ready');
  });

  it('recognizes only verified Postgres durable mode with learner auth', () => {
    expect(releaseMode(durableRelease)).toBe('durable');
    expect(safeScienceContent(durableRelease)).toBe(true);
    expect(summarizeRelease(durableRelease)).toBe('Verified durable University workspace ready');
  });

  it('blocks valid durable evidence when learner auth is not enabled', () => {
    const unsafe: UniversityReleaseReadiness = {
      ...durableRelease,
      learner_auth_enabled: false,
      durable_sessions_enabled: false,
      persistence: 'process_local_memory',
      durable_gate: {
        ...durableRelease.durable_gate,
        learner_auth_enabled: false,
        durable_sessions_enabled: false,
      },
    };
    expect(releaseMode(unsafe)).toBe('blocked');
    expect(safeScienceContent(unsafe)).toBe(false);
    expect(releaseBlockers(unsafe)).toContain(
      'Session writes are enabled without backend-verifiable learner authentication.',
    );
  });

  it('fails closed when top-level durable state is true but release evidence is invalid', () => {
    const unsafe: UniversityReleaseReadiness = {
      ...durableRelease,
      durable_gate: {
        ...durableRelease.durable_gate,
        release_evidence_valid: false,
      },
    };
    expect(releaseMode(unsafe)).toBe('blocked');
    expect(safeScienceContent(unsafe)).toBe(false);
    expect(releaseBlockers(unsafe)).toContain(
      'Durable activation does not have valid production release evidence.',
    );
  });
});

describe('universityApi', () => {
  it('loads capability metadata without inventing enabled state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: false,
        session_writes_enabled: false,
        learner_auth_enabled: false,
        persistence: 'process_local_memory',
        durable_sessions_enabled: false,
        publication_enabled: false,
        candidate_knowledge_writes_enabled: false,
        calyx_model_calls_enabled: false,
      }),
    }));
    const capability = await universityApi.capability();
    expect(capability.enabled).toBe(false);
    expect(capability.learner_auth_enabled).toBe(false);
    expect(capability.durable_sessions_enabled).toBe(false);
  });

  it('loads and summarizes the backend release-readiness payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => readOnlyRelease,
    }));
    const readiness = await universityApi.releaseReadiness();
    expect(readiness.read_only_ready).toBe(true);
    expect(readiness.learner_auth_enabled).toBe(false);
    expect(summarizeRelease(readiness)).toBe('Read-only University release ready');
  });

  it('forwards the Supabase bearer token on learner mutations', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: 's-1', revision: 5 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await universityApi.appendEvent(
      's-1',
      {
        event_type: 'analysis_recorded',
        stage: 'analyze',
        payload: { text: 'bounded analysis' },
        expected_revision: 4,
      },
      'supabase-access-token',
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer supabase-access-token');
    expect(JSON.parse(init.body)).toEqual({
      event_type: 'analysis_recorded',
      stage: 'analyze',
      payload: { text: 'bounded analysis' },
      expected_revision: 4,
    });
  });

  it('forwards learner identity when resuming a durable session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 's-1',
        revision: 9,
        events: [
          {
            event_id: 'e-1',
            event_type: 'session_submitted',
            stage: 'contribute',
            payload: {},
            actor: 'supabase:11111111-1111-1111-1111-111111111111',
            session_revision: 7,
            created_at: '2026-08-07T18:00:00Z',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const session = await universityApi.session('s-1', 'learner-token');
    expect(session.events[0].session_revision).toBe(7);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer learner-token');
  });

  it('does not attach learner bearer identity to public catalog requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await universityApi.catalog();
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('surfaces HTTP failures rather than substituting fixture data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: { code: 'INVALID_LEARNER_TOKEN', message: 'expired learner session' } }),
    }));
    await expect(universityApi.session('s-1', 'expired')).rejects.toThrow('expired learner session');
  });
});
