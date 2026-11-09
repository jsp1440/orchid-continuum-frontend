/**
 * Command Center client (#2354). Consumes the read-only backend registry.
 *
 * Honest-state rules, mirroring docs/AGENT-OPERATING-MEMORY.md:
 * - Authentication is the existing owner session. The Calyx fetch transport in
 *   backendConfig.ts attaches the session cookie/bearer; this module never
 *   reads, stores, or sends a credential or API key.
 * - The response is parsed fail-closed. A malformed registry is an error, never
 *   a partially rendered dashboard.
 * - A module without a reviewed evidence record is UNASSESSED. It is never
 *   shown as DONE, healthy, or "no problems".
 * - Maturity levels above BUILT arrive as null (unverified) and are rendered as
 *   "unverified", never as passing.
 * - An HTTP-level health answer is not scientific health.
 */

import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export const COMMAND_CENTER_REGISTRY_PATH = '/api/command-center/registry';
export const COMMAND_CENTER_HEALTH_PATH = '/api/command-center/health';
export const BACKEND_REPO = 'jsp1440/orchid-calyx-backend';

export const STATUSES = ['DONE', 'RUNNING', 'BLOCKED', 'NEXT', 'UNASSESSED'] as const;
export type ModuleStatus = (typeof STATUSES)[number];

export const MATURITY_LEVELS = [
  'BUILT',
  'TESTED',
  'REVIEWED',
  'INTEGRATED',
  'DEPLOYED',
  'LIVE_VERIFIED',
] as const;
export type MaturityLevel = (typeof MATURITY_LEVELS)[number];

export interface CommandCenterModule {
  name: string;
  path: string;
  python_files: number;
  has_router: boolean;
  depends_on: string[];
  depended_on_by: string[];
  test_files: string[];
  workflows: string[];
  maturity: Record<MaturityLevel, boolean | null>;
  status: ModuleStatus;
  status_reason: string;
  status_refs: string[];
  mounted_routes: number;
  unmounted_router_files: string[];
  router_defined_but_not_mounted: boolean;
}

export interface PullRequestEvidence {
  number: number;
  title: string;
  head: string;
  base: string;
  draft: boolean;
  lane: string | null;
  blocker: string | null;
  verification: { local: boolean; hosted: boolean; independent: boolean };
  ci?: { state: string; needs?: string[] } | null;
}

export interface CommandCenterRegistry {
  caveat: string;
  evidence_kind: string;
  evidence_retrieved_at: string;
  status_counts: Record<string, number>;
  modules: CommandCenterModule[];
  pull_requests: PullRequestEvidence[];
  integration_blockers: { pr: number; lane: string | null; head: string; blocker: string }[];
  unsuccessful_approaches: { approach: string; result: string; ref: string }[];
  memory: { path: string; role: string; exists_in_checkout: boolean }[];
  tracked_issues: { number: number; role: string }[];
}

export type ProbeTier = { state: string; reason?: string; reasons?: string[]; http_status?: number | null };

export interface CommandCenterHealth {
  kind: string;
  reachable: ProbeTier;
  application_ready: ProbeTier;
  scientific: ProbeTier;
  deployed_commit_sha: string | null;
}

export class RegistryContractError extends Error {
  constructor(message: string) {
    super(`Command Center contract violation: ${message}`);
    this.name = 'RegistryContractError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new RegistryContractError(`${field} must be a string`);
  return v;
}

function strList(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new RegistryContractError(`${field} must be a string array`);
  }
  return v as string[];
}

function parseModule(raw: unknown, index: number): CommandCenterModule {
  if (!isRecord(raw)) throw new RegistryContractError(`modules[${index}] must be an object`);
  const name = str(raw.name, `modules[${index}].name`);
  const status = raw.status;
  if (!STATUSES.includes(status as ModuleStatus)) {
    throw new RegistryContractError(`module ${name} has unknown status ${JSON.stringify(status)}`);
  }
  if (!isRecord(raw.maturity)) throw new RegistryContractError(`module ${name} maturity missing`);
  const maturity = {} as Record<MaturityLevel, boolean | null>;
  for (const level of MATURITY_LEVELS) {
    const value = raw.maturity[level];
    if (value !== true && value !== false && value !== null) {
      throw new RegistryContractError(`module ${name} maturity ${level} must be true, false or null`);
    }
    maturity[level] = value;
  }
  const refs = strList(raw.status_refs, `${name}.status_refs`);
  if (status !== 'UNASSESSED' && refs.length === 0) {
    // A status without evidence is a claim; refuse to display it.
    throw new RegistryContractError(`module ${name} has status ${String(status)} without evidence refs`);
  }
  return {
    name,
    path: str(raw.path, `${name}.path`),
    python_files: Number(raw.python_files),
    has_router: raw.has_router === true,
    depends_on: strList(raw.depends_on, `${name}.depends_on`),
    depended_on_by: strList(raw.depended_on_by, `${name}.depended_on_by`),
    test_files: strList(raw.test_files, `${name}.test_files`),
    workflows: strList(raw.workflows, `${name}.workflows`),
    maturity,
    status: status as ModuleStatus,
    status_reason: str(raw.status_reason, `${name}.status_reason`),
    status_refs: refs,
    mounted_routes: Number(raw.mounted_routes) || 0,
    unmounted_router_files: strList(raw.unmounted_router_files, `${name}.unmounted_router_files`),
    router_defined_but_not_mounted: raw.router_defined_but_not_mounted === true,
  };
}

function parsePr(raw: unknown, index: number): PullRequestEvidence {
  if (!isRecord(raw) || typeof raw.number !== 'number') {
    throw new RegistryContractError(`pull_requests[${index}] malformed`);
  }
  const v = raw.verification;
  if (!isRecord(v)) throw new RegistryContractError(`PR #${raw.number} verification missing`);
  const verification = {
    local: v.local === true,
    hosted: v.hosted === true,
    independent: v.independent === true,
  };
  // The backend validator enforces these; the client refuses to display a claim
  // that lacks its proof even if a bad payload arrives.
  if (verification.hosted && typeof raw.hosted_run_url !== 'string') {
    throw new RegistryContractError(`PR #${raw.number} claims hosted CI without a run URL`);
  }
  if (verification.independent && typeof raw.independent_checker !== 'string') {
    throw new RegistryContractError(`PR #${raw.number} claims independent review without a checker`);
  }
  const ci = isRecord(raw.ci) && typeof raw.ci.state === 'string'
    ? { state: raw.ci.state, needs: Array.isArray(raw.ci.needs) ? (raw.ci.needs as string[]) : undefined }
    : null;
  return {
    number: raw.number,
    title: str(raw.title, `PR #${raw.number}.title`),
    head: str(raw.head, `PR #${raw.number}.head`),
    base: str(raw.base, `PR #${raw.number}.base`),
    draft: raw.draft === true,
    lane: typeof raw.lane === 'string' ? raw.lane : null,
    blocker: typeof raw.blocker === 'string' ? raw.blocker : null,
    verification,
    ci,
  };
}

export function parseRegistry(raw: unknown): CommandCenterRegistry {
  if (!isRecord(raw)) throw new RegistryContractError('registry must be an object');
  if (raw.evidence_kind !== 'SNAPSHOT') {
    throw new RegistryContractError('evidence_kind must be SNAPSHOT');
  }
  for (const key of ['modules', 'pull_requests', 'memory', 'unsuccessful_approaches', 'tracked_issues', 'integration_blockers']) {
    if (!Array.isArray(raw[key])) throw new RegistryContractError(`${key} must be an array`);
  }
  const modules = (raw.modules as unknown[]).map(parseModule);
  const names = new Set(modules.map((m) => m.name));
  if (names.size !== modules.length) throw new RegistryContractError('duplicate module names');
  return {
    caveat: str(raw.caveat, 'caveat'),
    evidence_kind: 'SNAPSHOT',
    evidence_retrieved_at: str(raw.evidence_retrieved_at, 'evidence_retrieved_at'),
    status_counts: isRecord(raw.status_counts) ? (raw.status_counts as Record<string, number>) : {},
    modules,
    pull_requests: (raw.pull_requests as unknown[]).map(parsePr),
    integration_blockers: raw.integration_blockers as CommandCenterRegistry['integration_blockers'],
    unsuccessful_approaches: raw.unsuccessful_approaches as CommandCenterRegistry['unsuccessful_approaches'],
    memory: raw.memory as CommandCenterRegistry['memory'],
    tracked_issues: raw.tracked_issues as CommandCenterRegistry['tracked_issues'],
  };
}

export function parseHealth(raw: unknown): CommandCenterHealth {
  if (!isRecord(raw) || raw.kind !== 'LIVE_PROBE') {
    throw new RegistryContractError('health must be a LIVE_PROBE object');
  }
  const tier = (v: unknown, name: string): ProbeTier => {
    if (!isRecord(v) || typeof v.state !== 'string') {
      throw new RegistryContractError(`health.${name}.state missing`);
    }
    return v as unknown as ProbeTier;
  };
  const scientific = tier(raw.scientific, 'scientific');
  // HTTP health must never be presented as scientific health.
  if (scientific.state !== 'NOT_ASSESSED') {
    throw new RegistryContractError('scientific tier may only be NOT_ASSESSED from the HTTP probe');
  }
  return {
    kind: 'LIVE_PROBE',
    reachable: tier(raw.reachable, 'reachable'),
    application_ready: tier(raw.application_ready, 'application_ready'),
    scientific,
    deployed_commit_sha: typeof raw.deployed_commit_sha === 'string' ? raw.deployed_commit_sha : null,
  };
}

export type LoadResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'unauthorized'; status: number }
  | { kind: 'error'; message: string };

async function load<T>(path: string, parse: (raw: unknown) => T, signal?: AbortSignal): Promise<LoadResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'Network error' };
  }
  if (response.status === 401 || response.status === 403) {
    return { kind: 'unauthorized', status: response.status };
  }
  if (!response.ok) return { kind: 'error', message: `HTTP ${response.status} from ${path}` };
  const type = response.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json')) {
    return { kind: 'error', message: `Expected JSON from ${path} but received "${type || 'no content-type'}"` };
  }
  try {
    return { kind: 'ok', data: parse(await response.json()) };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'Malformed response' };
  }
}

export const fetchRegistry = (signal?: AbortSignal) => load(COMMAND_CENTER_REGISTRY_PATH, parseRegistry, signal);
export const fetchHealth = (signal?: AbortSignal) => load(COMMAND_CENTER_HEALTH_PATH, parseHealth, signal);

/** Case-insensitive search over name, path and status reason; optional status filter. */
export function searchModules(
  modules: CommandCenterModule[],
  query: string,
  status: ModuleStatus | 'ALL' = 'ALL',
): CommandCenterModule[] {
  const q = query.trim().toLowerCase();
  return modules.filter((m) => {
    if (status !== 'ALL' && m.status !== status) return false;
    if (!q) return true;
    return [m.name, m.path, m.status_reason].some((field) => field.toLowerCase().includes(q));
  });
}

export function statusCounts(modules: CommandCenterModule[]): Record<ModuleStatus, number> {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ModuleStatus, number>;
  for (const m of modules) counts[m.status] += 1;
  return counts;
}

/** Dependency neighbours restricted to modules that exist in the registry. */
export function dependencyNeighbours(modules: CommandCenterModule[], name: string) {
  const byName = new Map(modules.map((m) => [m.name, m]));
  const module = byName.get(name);
  if (!module) return null;
  const known = (names: string[]) => names.filter((n) => byName.has(n)).sort();
  return { module, dependsOn: known(module.depends_on), dependedOnBy: known(module.depended_on_by) };
}

/** Only `#<number>` refs become links; anything else stays plain text. */
export function evidenceLink(ref: string): string | null {
  const match = /^#(\d{1,7})$/.exec(ref.trim());
  return match ? `https://github.com/${BACKEND_REPO}/issues/${match[1]}` : null;
}

export function maturityLabel(value: boolean | null): 'yes' | 'no' | 'unverified' {
  return value === true ? 'yes' : value === false ? 'no' : 'unverified';
}
