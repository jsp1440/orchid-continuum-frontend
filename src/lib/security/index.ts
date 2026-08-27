/**
 * Orchid Continuum security control plane — public surface.
 *
 * A compact, provider-neutral, privacy-preserving defensive control plane for
 * the Continuum's applications, scientific data pipelines, infrastructure, and
 * AI agents. See docs/security/ for the threat model, privacy/retention policy,
 * rule catalog, AI-agent policy, and incident-response runbook.
 *
 * This barrel re-exports the tested building blocks so consumers import from a
 * single path: `import { ingestSecurityEvent, evaluateSignals } from '@/lib/security'`.
 */

export * from './envelope';
export * from './sanitize';
export * from './ingest';
export * from './signals';
export * from './baselines';
export * from './risk';
export * from './incident';
export * from './disposition';
export * from './promptInjection';
export * from './promptInjectionCorpus';
export * from './toolPolicy';
export * from './warnings';
export * from './domainPosture';
export * from './metrics';
export * from './featureFlags';
