import { describe, expect, it } from 'vitest';
import { DEPENDENCY_READINESS_CENSUS } from './dependencyReadinessData';
import { assertNoValueLikeKeys } from './types';
import { flattenRequirements, listBackendOnlySecrets } from './readinessOps';

function findRecord(id: string) {
  const record = DEPENDENCY_READINESS_CENSUS.find((r) => r.id === id);
  if (!record) throw new Error(`Expected census record "${id}" to exist`);
  return record;
}

describe('DEPENDENCY_READINESS_CENSUS structural safety', () => {
  it('never carries a value-like key on any record', () => {
    for (const record of DEPENDENCY_READINESS_CENSUS) {
      expect(() => assertNoValueLikeKeys(record)).not.toThrow();
    }
  });

  it('never serializes anything resembling a live secret value', () => {
    const serialized = JSON.stringify(DEPENDENCY_READINESS_CENSUS);
    // Anthropic/OpenAI-style key prefixes must never appear, even as an example.
    expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(serialized).not.toMatch(/sk-ant-[a-zA-Z0-9-]{10,}/);
  });

  it('has at least one requirement row per record', () => {
    for (const record of DEPENDENCY_READINESS_CENSUS) {
      expect(record.requirements.length).toBeGreaterThan(0);
    }
  });
});

describe('requirement derivation is code-grounded, not symmetric', () => {
  it('requires ANTHROPIC_API_KEY in GitHub Actions for both repos but not in Render runtime', () => {
    const record = findRecord('anthropic-api-key');
    const byEnv = Object.fromEntries(record.requirements.map((r) => [r.environment, r]));
    expect(byEnv.FRONTEND_GITHUB_ACTIONS.required).toBe(true);
    expect(byEnv.BACKEND_GITHUB_ACTIONS.required).toBe(true);
    expect(byEnv.FRONTEND_RENDER.required).toBe(false);
    expect(byEnv.BACKEND_RENDER.required).toBe(false);
  });

  it('does not require GEMINI_API_KEY anywhere yet, pending backend #1114', () => {
    const record = findRecord('gemini-api-key');
    for (const requirement of record.requirements) {
      expect(requirement.required).toBe(false);
      expect(requirement.readiness).toBe('NOT_REQUIRED');
    }
  });

  it('treats OPENAI_API_KEY as backend-runtime-owned, not frontend-required', () => {
    const record = findRecord('openai-api-key');
    const byEnv = Object.fromEntries(record.requirements.map((r) => [r.environment, r]));
    expect(byEnv.BACKEND_RENDER.required).toBe(true);
    expect(byEnv.FRONTEND_RENDER.required).toBe(false);
    expect(byEnv.FRONTEND_GITHUB_ACTIONS.required).toBe(false);
  });

  it('does not duplicate DATABASE_URL into the frontend repo for symmetry', () => {
    const record = findRecord('database-url');
    const byEnv = Object.fromEntries(record.requirements.map((r) => [r.environment, r]));
    expect(byEnv.BACKEND_RENDER.required).toBe(true);
    expect(byEnv.FRONTEND_RENDER.required).toBe(false);
    expect(byEnv.FRONTEND_GITHUB_ACTIONS.required).toBe(false);
  });

  it('does not require Azure credentials anywhere, since no active workflow references them', () => {
    const record = findRecord('azure-credentials');
    for (const requirement of record.requirements) {
      expect(requirement.required).toBe(false);
      expect(requirement.readiness).toBe('NOT_REQUIRED');
    }
  });

  it('does not require Render/Vercel deploy credentials, since only public probes exist', () => {
    const record = findRecord('render-vercel-deploy-credentials');
    for (const requirement of record.requirements) {
      expect(requirement.required).toBe(false);
    }
  });
});

describe('public config is never mislabeled as a secret', () => {
  it('classifies VITE_CALYX_API_URL as PUBLIC_CONFIG', () => {
    expect(findRecord('vite-calyx-api-url').classification).toBe('PUBLIC_CONFIG');
  });

  it('classifies VITE_MAPBOX_TOKEN as PUBLIC_CONFIG', () => {
    expect(findRecord('vite-mapbox-token').classification).toBe('PUBLIC_CONFIG');
  });

  it('has no PUBLIC_CONFIG record among the backend-only-secret list', () => {
    const backendOnly = listBackendOnlySecrets(DEPENDENCY_READINESS_CENSUS);
    expect(backendOnly.some((r) => r.classification === 'PUBLIC_CONFIG')).toBe(false);
  });
});

describe('backend-only secrets are never recommended for browser exposure', () => {
  it('flags CALYX_API_KEY and DATABASE_URL as backend-only, and explicitly forbids frontend exposure for CALYX_API_KEY', () => {
    const backendOnly = listBackendOnlySecrets(DEPENDENCY_READINESS_CENSUS);
    const ids = backendOnly.map((r) => r.id);
    expect(ids).toContain('calyx-api-key');
    expect(ids).toContain('database-url');

    const calyxKey = findRecord('calyx-api-key');
    const frontendRow = calyxKey.requirements.find((r) => r.environment === 'FRONTEND_RENDER');
    expect(frontendRow?.required).toBe(false);
    expect(frontendRow?.source.toLowerCase()).toContain('forbidden');
  });
});

describe('built-in GitHub token is never reported as a missing user secret', () => {
  it('classifies github-token-builtin as BUILT_IN_TOKEN and CONFIGURED, not MISSING/UNKNOWN', () => {
    const record = findRecord('github-token-builtin');
    expect(record.classification).toBe('BUILT_IN_TOKEN');
    for (const requirement of record.requirements) {
      if (requirement.required) {
        expect(requirement.readiness).toBe('CONFIGURED');
      }
    }
  });
});

describe('Render-runtime readiness is distinguishable from GitHub-Actions readiness', () => {
  it('flattens requirements with their environment intact so the two lanes never collapse into one', () => {
    const rows = flattenRequirements(DEPENDENCY_READINESS_CENSUS);
    const renderRows = rows.filter((r) => r.environment === 'BACKEND_RENDER' || r.environment === 'FRONTEND_RENDER');
    const actionsRows = rows.filter((r) => r.environment === 'BACKEND_GITHUB_ACTIONS' || r.environment === 'FRONTEND_GITHUB_ACTIONS');
    expect(renderRows.length).toBeGreaterThan(0);
    expect(actionsRows.length).toBeGreaterThan(0);

    // ANTHROPIC_API_KEY specifically: required in Actions, not required in Render — the two
    // lanes must disagree here, proving they are not merged into a single readiness signal.
    const anthropicRows = rows.filter((r) => r.dependencyId === 'anthropic-api-key');
    const anthropicActions = anthropicRows.filter((r) => r.environment.endsWith('GITHUB_ACTIONS'));
    const anthropicRender = anthropicRows.filter((r) => r.environment.endsWith('RENDER'));
    expect(anthropicActions.every((r) => r.required)).toBe(true);
    expect(anthropicRender.every((r) => !r.required)).toBe(true);
  });
});

describe('missing readiness is never represented as measured zero', () => {
  it('uses UNKNOWN (not a fabricated MISSING/CONFIGURED) for rows this run could not verify', () => {
    const anthropicActions = findRecord('anthropic-api-key').requirements.filter((r) => r.environment.endsWith('GITHUB_ACTIONS'));
    for (const requirement of anthropicActions) {
      expect(requirement.readiness).toBe('UNKNOWN');
      expect(requirement.blockerOrNextAction.length).toBeGreaterThan(0);
    }
  });
});
