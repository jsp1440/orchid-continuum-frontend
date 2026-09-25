import { selectAdmissibleLeaf } from './scheduler';
import { DETERMINISTIC_GRAPH_TASKS, decideGraphIssueAction, fingerprintFor } from './graphIssueDecision';
import { resolveExecutableIssue, type OpenIssueRef } from './executableIssue';
import type { CompletionNode } from './types';

/**
 * The bounded loop from "choose the next unmet gate" to "a filed, queued,
 * declared issue", mirroring orchid-calyx-backend#1591:
 *
 *   * identity is the CONDITION, not the run. Every filed issue carries an
 *     `OC-DISCOVERY-FINGERPRINT:` line, and a candidate whose fingerprint is
 *     already on an issue -- open OR closed -- is skipped, so a gap that was
 *     filed and closed as won't-fix is not filed again on the next pulse;
 *   * at most MAX_DISCOVERED_ISSUES_PER_PASS per pass, however many leaves are
 *     admissible;
 *   * the lookup that feeds the dedupe is a fact the caller obtained (a label
 *     query), never a text search. When it is unavailable the loop files
 *     nothing at all, because "we could not check" and "nothing was filed" must
 *     not look alike on the way out;
 *   * the capability declaration comes from the leaf, never from reading prose:
 *     a leaf with an explicit deterministic binding in DETERMINISTIC_GRAPH_TASKS
 *     declares that capability; every other leaf's nextAction is a prose
 *     specification, which is exactly what the shared registry calls
 *     `open-ended-code-authoring`, a provider-required capability. The budget
 *     governor and owner authorization decide whether that lane may run; this
 *     loop only declares honestly what the work is.
 */
export const MAX_DISCOVERED_ISSUES_PER_PASS = 3;
export const DISCOVERY_LABEL = 'oc-discovered';
export const DISCOVERY_FINGERPRINT_MARKER = 'OC-DISCOVERY-FINGERPRINT';
export const OPEN_ENDED_AUTHORING_CAPABILITY = 'open-ended-code-authoring';
export const DISCOVERY_TARGET_REPO = 'jsp1440/orchid-continuum-frontend';

const FINGERPRINT_LINE = /^OC-DISCOVERY-FINGERPRINT:\s*(ocfp1-[0-9a-f]{8})\s*$/im;

export type DiscoveredIssueRef = {
  number: number;
  state: 'open' | 'closed';
  body?: string | null;
};

/** What the caller learned about already-filed discovery issues, or that it could not. */
export type FingerprintIndex =
  | { available: true; fingerprints: ReadonlySet<string> }
  | { available: false; reason: string };

export type GraphDiscoveryCandidate = {
  nodeId: string;
  title: string;
  body: string;
  labels: string[];
  fingerprint: string;
  capability: string;
  providerRequired: boolean;
};

export type GraphDiscoveryResult = {
  schema: 'oc.graph-discovery.v1';
  candidates: GraphDiscoveryCandidate[];
  skipped: Array<{ nodeId: string; reason: string }>;
  /** True when nothing was proposed because the dedupe index could not be read. */
  failedClosed: boolean;
  reason: string;
};

export function leafCapability(node: CompletionNode): { capability: string; providerRequired: boolean } {
  const bound = DETERMINISTIC_GRAPH_TASKS[node.id];
  if (bound) return { capability: bound.capability, providerRequired: false };
  return { capability: OPEN_ENDED_AUTHORING_CAPABILITY, providerRequired: true };
}

/**
 * The condition being filed: this leaf, this capability, this status, this
 * next action. A re-worded nextAction is a different condition and may be
 * filed again; the same condition on a later pulse may not.
 */
export function discoveryFingerprint(node: CompletionNode, capability: string): string {
  return fingerprintFor([DISCOVERY_TARGET_REPO, node.id, capability, node.status, node.nextAction.trim()]);
}

export function readDiscoveryFingerprint(body: string | null | undefined): string | null {
  return FINGERPRINT_LINE.exec(body ?? '')?.[1]?.toLowerCase() ?? null;
}

/** Every fingerprint already on an issue, whatever its state. */
export function indexDiscoveryFingerprints(issues: DiscoveredIssueRef[]): Set<string> {
  const found = new Set<string>();
  for (const issue of issues) {
    const fingerprint = readDiscoveryFingerprint(issue.body);
    if (fingerprint) found.add(fingerprint);
  }
  return found;
}

function withStatus(root: CompletionNode, nodeId: string, status: CompletionNode['status']): CompletionNode {
  const copy = structuredClone(root);
  const walk = (node: CompletionNode) => {
    if (node.id === nodeId) node.status = status;
    node.children.forEach(walk);
  };
  walk(copy);
  return copy;
}

export function discoverGraphIssues(
  root: CompletionNode,
  options: {
    now: string;
    openIssues: OpenIssueRef[];
    fingerprintIndex: FingerprintIndex;
    max?: number;
  },
): GraphDiscoveryResult {
  const max = Math.min(Math.max(0, options.max ?? MAX_DISCOVERED_ISSUES_PER_PASS), MAX_DISCOVERED_ISSUES_PER_PASS);
  const skipped: GraphDiscoveryResult['skipped'] = [];
  const candidates: GraphDiscoveryCandidate[] = [];

  const index = options.fingerprintIndex;
  // `=== false`, not `!`: the app tsconfig does not enable strictNullChecks,
  // and truthiness alone does not narrow a discriminated union there.
  if (index.available === false) {
    return {
      schema: 'oc.graph-discovery.v1',
      candidates,
      skipped,
      failedClosed: true,
      reason: 'Discovery fingerprint index unavailable; filing nothing rather than risking a duplicate: ' + index.reason,
    };
  }
  const filed = index.fingerprints;
  const openWorkRefs = new Set(options.openIssues.map((issue) => '#' + issue.number));

  // Walk the ranking one leaf at a time. Taking a leaf out of contention as
  // OWNER_ACTION (not DONE) keeps every dependency relationship exactly as the
  // committed graph states it, so the next pick is the one the scheduler would
  // make if this pass had not happened.
  let working = root;
  const seen = new Set<string>();
  const ceiling = 200;
  for (let step = 0; step < ceiling && candidates.length < max; step++) {
    const selection = selectAdmissibleLeaf(working, { now: options.now, openWorkRefs }).selected;
    if (!selection || seen.has(selection.node.id)) break;
    const node = selection.node;
    seen.add(node.id);
    working = withStatus(working, node.id, 'OWNER_ACTION');

    const tracked = resolveExecutableIssue(node, options.openIssues);
    if (tracked !== null) {
      skipped.push({ nodeId: node.id, reason: `already tracked by open issue #${tracked}` });
      continue;
    }
    const { capability, providerRequired } = leafCapability(node);
    const fingerprint = discoveryFingerprint(node, capability);
    if (filed.has(fingerprint)) {
      skipped.push({ nodeId: node.id, reason: `condition ${fingerprint} was already filed (open or closed)` });
      continue;
    }
    const decision = decideGraphIssueAction(node, options.openIssues, options.now);
    if (decision.action !== 'create') {
      skipped.push({ nodeId: node.id, reason: decision.reason });
      continue;
    }
    const body = [
      decision.body,
      '',
      `OC-SUPERVISOR-SOURCE: completion-graph`,
      `OC-SWARM-CAPABILITY: ${capability}`,
      `OC-SWARM-PROVIDER-REQUIRED: ${providerRequired ? 'true' : 'false'}`,
      `${DISCOVERY_FINGERPRINT_MARKER}: ${fingerprint}`,
    ].join('\n');
    candidates.push({
      nodeId: node.id,
      title: decision.title,
      body,
      labels: [...new Set([...decision.labels, DISCOVERY_LABEL, `oc-cap:${capability}`, `oc-node:${node.id}`])],
      fingerprint,
      capability,
      providerRequired,
    });
  }

  return {
    schema: 'oc.graph-discovery.v1',
    candidates,
    skipped,
    failedClosed: false,
    reason: candidates.length === 0
      ? 'No admissible graph leaf is unfiled and untracked this pass.'
      : `${candidates.length} bounded graph issue(s) proposed; ceiling ${max} per pass.`,
  };
}
