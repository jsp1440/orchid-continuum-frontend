/**
 * Secret & external-dependency readiness census (OC-OBSERVATORY-003 / issue #299).
 *
 * Grounding rules this file follows:
 *   1. Every `source` on a frontend-owned requirement was confirmed by grep
 *      against this repo's current `oc-autonomous-integration` tree at
 *      CENSUS_DATE — never assumed true "for symmetry" with another
 *      environment.
 *   2. Findings about the *backend* repo (orchid-calyx-backend) cannot be
 *      independently re-verified from here — this repo has no visibility
 *      into that repo's tree. Those rows cite issue #299's own "current
 *      code-grounded findings to preserve" section as their source and are
 *      explicitly labeled "not independently re-verified from this repo",
 *      per the mission's instruction to preserve rather than re-derive them.
 *   3. No row ever claims CONFIGURED for a GitHub Actions secret this run
 *      could not itself verify. `gh secret list` (names only, never values)
 *      required elevated approval this autonomous run did not have, so
 *      those rows are UNKNOWN with the exact command recorded as the next
 *      action — never fabricated as measured zero or measured healthy.
 */

import type { DependencyRecord } from './types';

export const DEPENDENCY_READINESS_CENSUS_DATE = '2026-08-22T00:00:00.000Z';

const GH_SECRET_LIST_FRONTEND =
  'gh secret list --repo jsp1440/orchid-continuum-frontend (lists secret NAMES only; never fetches or prints a value)';
const GH_SECRET_LIST_BACKEND =
  'gh secret list --repo jsp1440/orchid-calyx-backend (lists secret NAMES only; never fetches or prints a value)';
const RENDER_ENV_PRESENCE_CHECK =
  'Render dashboard -> service -> Environment tab: confirm the variable is present (value not read by this check)';

export const DEPENDENCY_READINESS_CENSUS: DependencyRecord[] = [
  {
    id: 'anthropic-api-key',
    provider: 'Anthropic (Claude API)',
    owningCapability: 'Autonomous completion lane execution provider (anthropics/claude-code-action)',
    classification: 'SECRET',
    requirements: [
      {
        environment: 'FRONTEND_GITHUB_ACTIONS',
        required: true,
        source:
          '.github/workflows/orchid-completion-lane.yml:56,93; orchid-continuous-completion.yml:208,234; orchid-claude-runtime-recovery.yml:44,55 (secrets.ANTHROPIC_API_KEY)',
        readiness: 'UNKNOWN',
        validationMethod: GH_SECRET_LIST_FRONTEND,
        lastEvidence:
          'This exact autonomous lane is currently executing under a claude-code-action run, which could not have started without ANTHROPIC_API_KEY resolving — behavioral evidence of recent use, not a stored presence check.',
        blockerOrNextAction:
          '`gh secret list` required elevated approval this run did not have (sandboxed autonomous execution); owner or an admin-scoped run should execute the presence check above.',
      },
      {
        environment: 'BACKEND_GITHUB_ACTIONS',
        required: true,
        source:
          'Per issue #299 ("both backend and frontend autonomous completion workflows currently reference secrets.ANTHROPIC_API_KEY") — not independently re-verified from this repo; this repo cannot read orchid-calyx-backend workflow files.',
        readiness: 'UNKNOWN',
        validationMethod: GH_SECRET_LIST_BACKEND,
        blockerOrNextAction: 'Run the equivalent presence check against jsp1440/orchid-calyx-backend directly.',
      },
      {
        environment: 'FRONTEND_RENDER',
        required: false,
        source: 'grep -rn ANTHROPIC_API_KEY across src/ found no runtime/build reference — workflow-only usage confirmed.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not required in this environment.',
        blockerOrNextAction: 'None.',
      },
      {
        environment: 'BACKEND_RENDER',
        required: false,
        source:
          'No evidence found of Claude/Anthropic being called from backend runtime (as opposed to GitHub Actions execution) in issue #299\'s findings.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not required unless backend runtime code independently calls Anthropic.',
        blockerOrNextAction: 'Re-derive from backend code if a runtime (non-Actions) Anthropic call path is added.',
      },
    ],
  },
  {
    id: 'gemini-api-key',
    provider: 'Google (Gemini API)',
    owningCapability: 'Planned governed fallback provider for Calyx synthesis (owned by backend issue #1114, not yet implemented)',
    classification: 'SECRET',
    requirements: (['BACKEND_RENDER', 'FRONTEND_RENDER', 'BACKEND_GITHUB_ACTIONS', 'FRONTEND_GITHUB_ACTIONS'] as const).map(
      (environment) => ({
        environment,
        required: false,
        source:
          'grep -rn GEMINI_API_KEY across this repo (code + workflows) found zero references on current main; per issue #299, backend #1114 owns adding governed fallback support and has not landed it yet.',
        readiness: 'NOT_REQUIRED' as const,
        validationMethod: 'N/A — no code path requires it yet.',
        blockerOrNextAction:
          'Do not add a GEMINI_API_KEY secret in either repo until orchid-calyx-backend#1114 lands; then re-derive per-environment requirement from its actual workflow/runtime path, not from symmetry with ANTHROPIC_API_KEY.',
      }),
    ),
  },
  {
    id: 'openai-api-key',
    provider: 'OpenAI',
    owningCapability: 'Backend governed Calyx provider synthesis (backend runtime)',
    classification: 'SECRET',
    requirements: [
      {
        environment: 'BACKEND_RENDER',
        required: true,
        source:
          'Per issue #299 ("Backend code currently supports OPENAI_API_KEY for governed Calyx provider synthesis") — not independently re-verified from this repo.',
        readiness: 'UNKNOWN',
        validationMethod: RENDER_ENV_PRESENCE_CHECK,
        blockerOrNextAction: 'Confirm directly against orchid-calyx-backend / its Render service; this frontend repo cannot inspect Render env vars.',
      },
      {
        environment: 'FRONTEND_RENDER',
        required: false,
        source: 'grep -rn OPENAI_API_KEY across src/ found no reference.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not required in this environment.',
        blockerOrNextAction: 'None unless a frontend code path is added that calls OpenAI directly (would also then need browser-exposure review).',
      },
      {
        environment: 'BACKEND_GITHUB_ACTIONS',
        required: false,
        source: 'No workflow visible from this repo runs OpenAI-dependent backend code in CI; treated as runtime-only until such a workflow exists.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not required unless a backend CI workflow is added that exercises the OpenAI path.',
        blockerOrNextAction: 'Re-derive if such a workflow is added.',
      },
      {
        environment: 'FRONTEND_GITHUB_ACTIONS',
        required: false,
        source: 'grep -rn OPENAI_API_KEY across .github/workflows/*.yml in this repo found no reference.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not required in this environment.',
        blockerOrNextAction: 'None.',
      },
    ],
  },
  {
    id: 'database-url',
    provider: 'Backend database connection string',
    owningCapability: 'Backend persistence layer',
    classification: 'CONNECTION_STRING',
    requirements: [
      {
        environment: 'BACKEND_RENDER',
        required: true,
        source: 'Per issue #299 ("DATABASE_URL is broadly backend/runtime-facing") — not independently re-verified from this repo.',
        readiness: 'UNKNOWN',
        validationMethod:
          'Render dashboard env-var presence check, or a backend /health-style endpoint that reports DB connectivity as a boolean/status — never read the connection string itself.',
        blockerOrNextAction: 'Confirm directly against orchid-calyx-backend / its Render service.',
      },
      ...(['FRONTEND_RENDER', 'BACKEND_GITHUB_ACTIONS', 'FRONTEND_GITHUB_ACTIONS'] as const).map((environment) => ({
        environment,
        required: false,
        source:
          'grep -rn DATABASE_URL across this repo (code + workflows) found no reference; per issue #299 it "should not be duplicated into the frontend repo merely for symmetry".',
        readiness: 'NOT_REQUIRED' as const,
        validationMethod: 'N/A — not required in this environment.',
        blockerOrNextAction: 'None — do not add for symmetry.',
      })),
    ],
  },
  {
    id: 'calyx-api-key',
    provider: 'Orchid Continuum internal (Calyx backend authentication)',
    owningCapability: 'Backend authentication / workflow-to-backend calls',
    classification: 'SECRET',
    requirements: [
      {
        environment: 'BACKEND_RENDER',
        required: true,
        source: 'Per issue #299 ("CALYX_API_KEY is a backend authentication/runtime concern") — not independently re-verified from this repo.',
        readiness: 'UNKNOWN',
        validationMethod: RENDER_ENV_PRESENCE_CHECK,
        blockerOrNextAction: 'Confirm directly against orchid-calyx-backend / its Render service.',
      },
      {
        environment: 'FRONTEND_RENDER',
        required: false,
        source: 'grep -rn CALYX_API_KEY across src/ found no reference; frontend/browser exposure of this credential is forbidden by mission security rules.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — must never be required here.',
        blockerOrNextAction: 'None. Reject any change that introduces this as a VITE_* variable or otherwise ships it to the browser.',
      },
      {
        environment: 'BACKEND_GITHUB_ACTIONS',
        required: false,
        source: 'No backend workflow visible from this repo intentionally authenticates to Calyx in CI.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — required only if a workflow is added that intentionally authenticates to the backend.',
        blockerOrNextAction: 'Re-derive if such a workflow is added.',
      },
      {
        environment: 'FRONTEND_GITHUB_ACTIONS',
        required: false,
        source: 'grep -rn CALYX_API_KEY across .github/workflows/*.yml in this repo found no reference.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — required only if a workflow is added that intentionally authenticates to the backend.',
        blockerOrNextAction: 'Re-derive if such a workflow is added.',
      },
    ],
  },
  {
    id: 'vite-calyx-api-url',
    provider: 'Orchid Continuum internal build/runtime configuration',
    owningCapability: 'Frontend -> Calyx backend origin resolution',
    classification: 'PUBLIC_CONFIG',
    notes: 'Public build/runtime configuration, not a confidential model key — must never be classified SECRET (issue #299 security rule).',
    requirements: [
      {
        environment: 'FRONTEND_RENDER',
        required: false,
        source: 'src/lib/backendConfig.ts:19-24 — falls back to a hardcoded public origin (https://orchid-calyx-backend.onrender.com) when unset.',
        readiness: 'CONFIGURED',
        validationMethod: 'Read the resolved CALYX_BACKEND_BASE_URL constant or the deployed origin\'s response; this is a public origin, safe to read directly (not a secret comparison).',
        lastEvidence: 'src/lib/backendConfig.ts ships a working default; the build does not fail closed when this var is absent.',
        blockerOrNextAction: 'Optional: set an explicit override in Render if a non-default backend origin is required for a given deploy.',
      },
      {
        environment: 'FRONTEND_GITHUB_ACTIONS',
        required: false,
        source: 'grep -rn VITE_CALYX_API_URL across .github/workflows/*.yml in this repo found no reference — no CI/preview build currently overrides it.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not required unless a CI/preview build workflow needs a non-default backend origin.',
        blockerOrNextAction: 'Add as a GitHub Actions variable (not secret) only if such a workflow is introduced.',
      },
    ],
  },
  {
    id: 'vite-mapbox-token',
    provider: 'Mapbox',
    owningCapability: 'Living Atlas regional map layers (src/features/atlas-next/mapboxConfig.ts)',
    classification: 'PUBLIC_CONFIG',
    notes: 'Must be a public pk.* token; a secret sk.* token must never be set here (.env.example:16-18). Atlas degrades gracefully to the globe view when unset — absence is not a failure.',
    requirements: [
      {
        environment: 'FRONTEND_RENDER',
        required: false,
        source: 'src/features/atlas-next/mapboxConfig.ts:17 (MAPBOX_TOKEN_ENV_VAR); src/vite-env.d.ts:18; .env.example:13-22',
        readiness: 'UNKNOWN',
        validationMethod:
          'Confirm the Render build environment has VITE_MAPBOX_TOKEN set and that it is a pk.* token by prefix only — never compare or log the full value.',
        blockerOrNextAction: 'Owner to confirm in Render dashboard whether the regional Atlas map layers are intended to be live in production.',
      },
    ],
  },
  {
    id: 'github-token-builtin',
    provider: 'GitHub (built-in Actions token)',
    owningCapability: 'Autonomous lane issue/PR read-write and workflow orchestration (gh CLI GH_TOKEN)',
    classification: 'BUILT_IN_TOKEN',
    notes: 'GitHub provisions this automatically for every workflow run. Must never be reported as a missing user-configured secret.',
    requirements: [
      {
        environment: 'FRONTEND_GITHUB_ACTIONS',
        required: true,
        source:
          '.github/workflows/orchid-completion-lane.yml:27; orchid-continuous-completion.yml:29,196,247,364; orchid-claude-runtime-recovery.yml:22,63; orchid-continuation-trigger.yml:21; orchid-integration-revalidation.yml:22; featured-genus-render-sentinel.yml:48 (all `${{ github.token }}`)',
        readiness: 'CONFIGURED',
        validationMethod: 'Structural: `${{ github.token }}` is supplied by GitHub Actions for every workflow run and requires no repository secret configuration.',
        lastEvidence: 'Every listed workflow file references it directly; GitHub Actions cannot execute a job that reads `github.token` without providing it.',
        blockerOrNextAction: 'None.',
      },
    ],
  },
  {
    id: 'azure-credentials',
    provider: 'Microsoft Azure',
    owningCapability: 'None currently active — no provisioning/deployment workflow in this repo references Azure',
    classification: 'SECRET',
    requirements: (['BACKEND_RENDER', 'FRONTEND_RENDER', 'BACKEND_GITHUB_ACTIONS', 'FRONTEND_GITHUB_ACTIONS'] as const).map(
      (environment) => ({
        environment,
        required: false,
        source:
          'grep -rli azure across .github/workflows/*.yml and src/ in this repo found zero workflow or runtime references as of the census date; only two docs files mention Azure conceptually.',
        readiness: 'NOT_REQUIRED' as const,
        validationMethod: 'N/A — no code path requires it.',
        blockerOrNextAction: 'Do not add Azure secrets in either repo until a provisioning/deployment workflow actually references them.',
      }),
    ),
  },
  {
    id: 'render-vercel-deploy-credentials',
    provider: 'Render / Vercel deployment API',
    owningCapability: 'Deployment automation (none active)',
    classification: 'PARTNER_CREDENTIAL',
    requirements: (['BACKEND_GITHUB_ACTIONS', 'FRONTEND_GITHUB_ACTIONS'] as const).map((environment) => ({
      environment,
      required: false,
      source:
        '.github/workflows/render-release-probe.yml only curls public HTTP endpoints (frontend_url, calyx_url inputs) with no auth header; grep -rn "RENDER_API_KEY|VERCEL_TOKEN|RENDER_DEPLOY" across .github/workflows/*.yml found no reference.',
      readiness: 'NOT_REQUIRED' as const,
      validationMethod: 'N/A — no workflow triggers a deploy via API.',
      blockerOrNextAction: 'Add only if a workflow is introduced that actually triggers a Render/Vercel deploy via API rather than probing public HTTP endpoints.',
    })),
  },
];
