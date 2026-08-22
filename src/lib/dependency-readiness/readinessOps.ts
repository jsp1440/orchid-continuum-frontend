/**
 * Secret & external-dependency readiness matrix — query helpers (issue #299).
 */

import type {
  DependencyClassification,
  DependencyEnvironment,
  DependencyReadinessState,
  DependencyRecord,
  DependencyRequirement,
} from './types';

export type FlatRequirementRow = DependencyRequirement & {
  dependencyId: string;
  provider: string;
  owningCapability: string;
  classification: DependencyClassification;
};

export function flattenRequirements(records: DependencyRecord[]): FlatRequirementRow[] {
  return records.flatMap((record) =>
    record.requirements.map((requirement) => ({
      ...requirement,
      dependencyId: record.id,
      provider: record.provider,
      owningCapability: record.owningCapability,
      classification: record.classification,
    })),
  );
}

export function groupByEnvironment(records: DependencyRecord[]): Record<DependencyEnvironment, FlatRequirementRow[]> {
  const groups: Record<DependencyEnvironment, FlatRequirementRow[]> = {
    BACKEND_RENDER: [],
    FRONTEND_RENDER: [],
    BACKEND_GITHUB_ACTIONS: [],
    FRONTEND_GITHUB_ACTIONS: [],
    OTHER: [],
  };
  for (const row of flattenRequirements(records)) {
    groups[row.environment].push(row);
  }
  return groups;
}

export function countByReadiness(records: DependencyRecord[]): Record<DependencyReadinessState, number> {
  const counts: Record<DependencyReadinessState, number> = {
    CONFIGURED: 0,
    NOT_REQUIRED: 0,
    MISSING: 0,
    INVALID: 0,
    EXTERNAL_BLOCKER: 0,
    UNKNOWN: 0,
  };
  for (const row of flattenRequirements(records)) {
    counts[row.readiness] += 1;
  }
  return counts;
}

/** Required rows whose readiness is not settled (i.e. not CONFIGURED/NOT_REQUIRED) — the matrix's actionable worklist. */
export function listUnresolvedRequiredRows(records: DependencyRecord[]): FlatRequirementRow[] {
  return flattenRequirements(records).filter(
    (row) => row.required && row.readiness !== 'CONFIGURED' && row.readiness !== 'NOT_REQUIRED',
  );
}

export function listByClassification(records: DependencyRecord[], classification: DependencyClassification): DependencyRecord[] {
  return records.filter((record) => record.classification === classification);
}

/**
 * Rows classified SECRET/PARTNER_CREDENTIAL/CONNECTION_STRING that are required
 * only in a backend environment. Used to guard against ever recommending one
 * for frontend/browser (VITE_*) exposure — see mission security rules.
 */
export function listBackendOnlySecrets(records: DependencyRecord[]): DependencyRecord[] {
  const browserUnsafeClassifications: DependencyClassification[] = ['SECRET', 'PARTNER_CREDENTIAL', 'CONNECTION_STRING'];
  return records.filter((record) => {
    if (!browserUnsafeClassifications.includes(record.classification)) return false;
    const requiredEnvironments = record.requirements.filter((r) => r.required).map((r) => r.environment);
    if (requiredEnvironments.length === 0) return false;
    const hasBackendRequirement = requiredEnvironments.some((e) => e === 'BACKEND_RENDER' || e === 'BACKEND_GITHUB_ACTIONS');
    const hasFrontendRequirement = requiredEnvironments.some((e) => e === 'FRONTEND_RENDER' || e === 'FRONTEND_GITHUB_ACTIONS');
    return hasBackendRequirement && !hasFrontendRequirement;
  });
}

/**
 * Result of a provider canary probe — a live call that proves the credential
 * actually authenticates, never a value comparison. `NOT_RUN` is the default
 * and must never be conflated with `SUCCESS`.
 */
export type CanaryOutcome = 'SUCCESS' | 'AUTH_REJECTED' | 'PROVIDER_UNAVAILABLE' | 'NOT_RUN';

/**
 * Folds a canary probe result into a readiness state. A credential that is
 * present but fails its canary is never reported as healthy CONFIGURED:
 * an auth rejection (e.g. 401/403 from the provider) means the credential
 * itself is bad -> INVALID; a provider-side failure (5xx, timeout, rate
 * limit) is not the credential's fault -> EXTERNAL_BLOCKER.
 */
export function applyCanaryOutcome(current: DependencyReadinessState, outcome: CanaryOutcome): DependencyReadinessState {
  switch (outcome) {
    case 'NOT_RUN':
      return current;
    case 'SUCCESS':
      return current === 'UNKNOWN' ? 'CONFIGURED' : current;
    case 'AUTH_REJECTED':
      return 'INVALID';
    case 'PROVIDER_UNAVAILABLE':
      return 'EXTERNAL_BLOCKER';
    default:
      return current;
  }
}
