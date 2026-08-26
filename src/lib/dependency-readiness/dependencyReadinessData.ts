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
 *      `gh variable list` was also attempted (non-secret GitHub Actions
 *      variables) and required the same elevated approval; this repo
 *      currently has zero `vars.*` references in any workflow anyway, so no
 *      row's requirement depends on that command succeeding.
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
    id: 'vite-backend-origin-aliases',
    provider: 'Orchid Continuum internal (additional public backend-origin aliases)',
    owningCapability: 'Frontend -> public Orchid Continuum API / images / legacy / Ecuador-expedition origin resolution',
    classification: 'PUBLIC_CONFIG',
    notes:
      'Recursive-census follow-up to vite-calyx-api-url: every alias below resolves through a hardcoded public onrender.com fallback, so an unset var degrades to a working default rather than failing closed. None of these is a confidential model key.',
    requirements: [
      {
        environment: 'FRONTEND_RENDER',
        required: false,
        source:
          'src/lib/backendConfig.ts:8-12 (BACKEND_BASE_URL; VITE_BACKEND_BASE_URL/VITE_API_BASE_URL); src/lib/ocBackend.ts:11-15 (OC_BACKEND_BASE; VITE_ORCHID_CONTINUUM_API_BASE_URL/VITE_OC_API_BASE_URL); src/lib/api.ts:226-241 (IMAGES_BACKEND_BASE_URL, LEGACY_ONRENDER_BASE_URL, ECUADOR_EMBED_BASE_URL and their aliases) — all ship a working public onrender.com default.',
        readiness: 'CONFIGURED',
        validationMethod:
          'Read the resolved constant or probe the deployed origin over HTTP; every value here is a public origin, never a secret comparison.',
        lastEvidence: 'Each constant\'s hardcoded fallback is present in source and used whenever the alias env vars are unset.',
        blockerOrNextAction: 'Optional: set an explicit override in Render only if a given deploy must point at a non-default origin.',
      },
      {
        environment: 'FRONTEND_GITHUB_ACTIONS',
        required: false,
        source: 'grep -rn "VITE_BACKEND_BASE_URL|VITE_ORCHID_CONTINUUM_API_BASE_URL|VITE_OC_API_BASE_URL|VITE_IMAGES_BACKEND_BASE_URL|VITE_LEGACY_ONRENDER_BASE_URL|VITE_ECUADOR_EMBED_BASE_URL" across .github/workflows/*.yml found no reference.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not required unless a CI/preview build workflow needs a non-default origin.',
        blockerOrNextAction: 'None.',
      },
      {
        environment: 'BACKEND_RENDER',
        required: false,
        source: 'These are frontend-resolved origin constants; the backend does not read them.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not applicable to the backend runtime.',
        blockerOrNextAction: 'None.',
      },
      {
        environment: 'BACKEND_GITHUB_ACTIONS',
        required: false,
        source: 'These are frontend-resolved origin constants; not referenced by backend workflows visible from this repo.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not applicable.',
        blockerOrNextAction: 'None.',
      },
    ],
  },
  {
    id: 'vite-api-base-url-no-fallback',
    provider: 'Orchid Continuum internal (public API client, no hardcoded fallback)',
    owningCapability: 'src/lib/api.ts API_BASE_URL / API_CONFIGURED gate (genus-of-day widgets, biodiversity infrastructure panel); src/lib/zoo.ts',
    classification: 'PUBLIC_CONFIG',
    notes:
      'Unlike every other backend-origin alias in this census, this consumer has no hardcoded public-origin fallback — an unset value resolves to \'\' and API_CONFIGURED becomes false, which the UI surfaces as an explicit "not configured" / demo-fallback message rather than a silent default. That is a deliberate degrade-gracefully design, not a failure, but it is not measured as CONFIGURED here because this repo cannot see whether Render currently has it set.',
    requirements: [
      {
        environment: 'FRONTEND_RENDER',
        required: false,
        source:
          'src/lib/api.ts:10-11,42-44,103 (API_BASE_URL accepts VITE_API_BASE_URL or the Next.js-portability alias NEXT_PUBLIC_API_BASE_URL; API_CONFIGURED; "VITE_API_BASE_URL is not set for this deployment."); src/components/widgets/index.tsx:167,253; src/components/orchid/BiodiversityInfrastructure.tsx:132; src/lib/zoo.ts:108 (same VITE_API_BASE_URL / NEXT_PUBLIC_API_BASE_URL alias pair); src/lib/relationshipExplorer.ts:10 (this one file does carry its own onrender.com fallback, so it is not affected by this row\'s degraded path).',
        readiness: 'UNKNOWN',
        validationMethod:
          'Render dashboard env-var presence check for VITE_API_BASE_URL, or observe whether the affected widgets render live data vs. their labelled demo-fallback state — never a value comparison.',
        blockerOrNextAction: 'Confirm in Render whether VITE_API_BASE_URL is intentionally unset (demo mode by design) or missing (should be set for full live-data widgets).',
      },
      {
        environment: 'FRONTEND_GITHUB_ACTIONS',
        required: false,
        source: 'grep -rn VITE_API_BASE_URL across .github/workflows/*.yml in this repo found no reference.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not required in this environment.',
        blockerOrNextAction: 'None.',
      },
      {
        environment: 'BACKEND_RENDER',
        required: false,
        source: 'Frontend-only client-side env var; the backend does not read it.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not applicable.',
        blockerOrNextAction: 'None.',
      },
      {
        environment: 'BACKEND_GITHUB_ACTIONS',
        required: false,
        source: 'Frontend-only client-side env var; not referenced by backend workflows visible from this repo.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not applicable.',
        blockerOrNextAction: 'None.',
      },
    ],
  },
  {
    id: 'vite-feature-flags',
    provider: 'Orchid Continuum internal (module feature flags)',
    owningCapability: 'src/lib/api.ts FEATURES (demoMode, atlas, orchidZoo, oacs); src/lib/backendConfig.ts KNOWLEDGE_GRAPH_ENABLED',
    classification: 'PUBLIC_CONFIG',
    notes: 'Boolean toggles, not credentials. Each defaults to a working value (true for the four FEATURES flags, false for KNOWLEDGE_GRAPH_ENABLED) — never fails closed.',
    requirements: [
      {
        environment: 'FRONTEND_RENDER',
        required: false,
        source:
          'src/lib/api.ts:59-71 (VITE_ENABLE_DEMO_MODE/VITE_ENABLE_ATLAS/VITE_ENABLE_ORCHID_ZOO/VITE_ENABLE_OACS, default true); src/lib/backendConfig.ts:26-27 (VITE_ENABLE_KNOWLEDGE_GRAPH, default false).',
        readiness: 'CONFIGURED',
        validationMethod: 'Read the resolved boolean flag in a running deployment; no secret comparison involved.',
        lastEvidence: 'Default values are present in source and take effect whenever the corresponding env var is unset.',
        blockerOrNextAction: 'Optional: override per-deploy in Render only to intentionally disable/enable a module.',
      },
      ...(['BACKEND_RENDER', 'BACKEND_GITHUB_ACTIONS', 'FRONTEND_GITHUB_ACTIONS'] as const).map((environment) => ({
        environment,
        required: false,
        source: 'grep -rn "VITE_ENABLE_" across .github/workflows/*.yml found no reference; these flags are frontend-runtime-only.',
        readiness: 'NOT_REQUIRED' as const,
        validationMethod: 'N/A — not applicable to this environment.',
        blockerOrNextAction: 'None.',
      })),
    ],
  },
  {
    id: 'vite-mapbox-style-url',
    provider: 'Mapbox',
    owningCapability: 'Living Atlas regional map layers style override (src/features/atlas-next/mapboxConfig.ts:60)',
    classification: 'PUBLIC_CONFIG',
    notes: 'A style URL, not a credential. Falls back to the public mapbox://styles/mapbox/dark-v11 style when unset.',
    requirements: [
      {
        environment: 'FRONTEND_RENDER',
        required: false,
        source: 'src/features/atlas-next/mapboxConfig.ts:60 (VITE_MAPBOX_STYLE_URL, falls back to \'mapbox://styles/mapbox/dark-v11\')',
        readiness: 'CONFIGURED',
        validationMethod: 'Read the resolved style URL constant; not a secret.',
        lastEvidence: 'Hardcoded fallback style is present in source.',
        blockerOrNextAction: 'Optional: set a custom style override in Render if a non-default Atlas style is desired.',
      },
      ...(['BACKEND_RENDER', 'BACKEND_GITHUB_ACTIONS', 'FRONTEND_GITHUB_ACTIONS'] as const).map((environment) => ({
        environment,
        required: false,
        source: 'Frontend-only client-side style override; not referenced by any workflow or the backend.',
        readiness: 'NOT_REQUIRED' as const,
        validationMethod: 'N/A — not applicable.',
        blockerOrNextAction: 'None.',
      })),
    ],
  },
  {
    id: 'vite-build-metadata',
    provider: 'Orchid Continuum internal (build/version metadata)',
    owningCapability: 'Mission Control provenance display (src/lib/mission-control/MissionControlService.ts, MissionControlProvider.tsx)',
    classification: 'PUBLIC_CONFIG',
    notes:
      'Diagnostic labels only, not credentials. Each falls back to an explicit \'unknown\'/\'dev\' placeholder rather than a fabricated value when unset. VITE_RELEASE_SHA is a distinct build-time mechanism (Node process.env read inside vite.config.ts, not a runtime import.meta.env read like these two) and is tracked separately as "vite-release-sha-build-stamp".',
    requirements: [
      {
        environment: 'FRONTEND_RENDER',
        required: false,
        source:
          'src/lib/mission-control/MissionControlService.ts:44-47 (VITE_API_VERSION -> \'unknown\' fallback); src/lib/mission-control/MissionControlProvider.tsx:16-18 (VITE_BUILD_NUMBER -> \'dev\' fallback).',
        readiness: 'CONFIGURED',
        validationMethod: 'Read the displayed version/build label in Mission Control; not a secret.',
        lastEvidence: 'Explicit non-fabricated placeholder fallbacks (\'unknown\', \'dev\') are present in source.',
        blockerOrNextAction: 'Optional: wire these from the actual CI build metadata so Mission Control shows real provenance instead of the placeholder.',
      },
      ...(['BACKEND_RENDER', 'BACKEND_GITHUB_ACTIONS', 'FRONTEND_GITHUB_ACTIONS'] as const).map((environment) => ({
        environment,
        required: false,
        source: 'Frontend-only build-time labels; not referenced by any workflow or the backend.',
        readiness: 'NOT_REQUIRED' as const,
        validationMethod: 'N/A — not applicable.',
        blockerOrNextAction: 'None.',
      })),
    ],
  },
  {
    id: 'vite-release-sha-build-stamp',
    provider: 'Orchid Continuum internal (build-time release identity)',
    owningCapability: 'Production release provenance stamped into built HTML (vite.config.ts resolveReleaseSha -> %OCU_RELEASE_SHA%)',
    classification: 'PUBLIC_CONFIG',
    notes:
      'A git SHA, not a credential. Distinct from vite-build-metadata: resolved at build time via Node process.env inside vite.config.ts rather than at runtime via import.meta.env, and it fails closed to the explicit literal \'unattested\' — never a fabricated SHA — when no source resolves.',
    requirements: [
      {
        environment: 'FRONTEND_RENDER',
        required: false,
        source:
          'vite.config.ts:8-27 (resolveReleaseSha): tries process.env.VITE_RELEASE_SHA, then process.env.RENDER_GIT_COMMIT, then process.env.GITHUB_SHA, then `git rev-parse HEAD`, else the literal string \'unattested\'.',
        readiness: 'UNKNOWN',
        validationMethod:
          'Inspect the deployed page\'s %OCU_RELEASE_SHA% stamp for a 40-character git SHA vs. the literal \'unattested\' string — a plain-text provenance read, never a secret comparison.',
        blockerOrNextAction:
          'Render is documented to auto-populate RENDER_GIT_COMMIT during builds, but this repo cannot confirm the deployed frontend service actually receives it; owner to confirm the live stamp resolves to a real SHA rather than \'unattested\'.',
      },
      {
        environment: 'FRONTEND_GITHUB_ACTIONS',
        required: false,
        source:
          '.github/workflows/frontend-ci.yml:39 and deployment-contract.yml:36 both run `npm run build`, which invokes vite.config.ts:resolveReleaseSha() while GITHUB_SHA is already present in every GitHub Actions job.',
        readiness: 'CONFIGURED',
        validationMethod:
          'Structural: GITHUB_SHA is supplied by GitHub Actions for every workflow run and requires no repository secret/variable configuration (same guarantee as github-token-builtin).',
        lastEvidence: 'Both listed workflows run `npm run build` before this repo\'s CI can pass; GitHub Actions cannot execute that job without GITHUB_SHA present.',
        blockerOrNextAction: 'None.',
      },
      {
        environment: 'BACKEND_RENDER',
        required: false,
        source: 'Frontend-only build step; the backend does not run vite.config.ts.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not applicable.',
        blockerOrNextAction: 'None.',
      },
      {
        environment: 'BACKEND_GITHUB_ACTIONS',
        required: false,
        source: 'Frontend-only build step; not referenced by backend workflows visible from this repo.',
        readiness: 'NOT_REQUIRED',
        validationMethod: 'N/A — not applicable.',
        blockerOrNextAction: 'None.',
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
