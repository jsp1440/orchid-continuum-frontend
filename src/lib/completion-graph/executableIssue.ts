import type { CompletionNode } from './types';

export type OpenIssueRef = {
  number: number;
  body?: string | null;
  labels?: Array<{ name: string }>;
};

const NON_EXECUTABLE_LABELS = new Set([
  'oc-running',
  'oc-validating',
  'oc-runtime-backoff',
  'oc-repair-backoff',
  'oc-blocked',
  'oc-owner-gate',
  'oc-done',
]);

export function graphNodeMarker(nodeId: string): string {
  return `OC-GRAPH-NODE: ${nodeId}`;
}

function normalizeRef(ref: string): string {
  return ref.replace(/^.*#/, '');
}

export function isExecutableIssue(issue: OpenIssueRef): boolean {
  const labels = new Set((issue.labels ?? []).map((label) => label.name));
  if (!labels.has('oc-queued')) return false;
  return ![...NON_EXECUTABLE_LABELS].some((label) => labels.has(label));
}

/** Return every live issue currently representing this graph node. */
export function liveIssuesForNode(
  node: CompletionNode,
  openIssues: OpenIssueRef[],
): OpenIssueRef[] {
  const declaredIssues = new Set(
    (node.issues ?? [])
      .map(normalizeRef)
      .filter((value) => /^\d+$/.test(value))
      .map(Number),
  );
  const marker = graphNodeMarker(node.id);

  return openIssues.filter(
    (issue) => declaredIssues.has(issue.number) || (issue.body ?? '').includes(marker),
  );
}

/**
 * Resolve only a live, currently queue-eligible issue as executable work for a
 * graph leaf.
 *
 * Historical PR evidence is deliberately ignored. A merged PR can prove that
 * code once landed, but it can never be coerced into an issue lease. A live
 * issue is executable only while it carries `oc-queued` and none of the
 * running/validating/backoff/block/governance/terminal labels. This keeps graph
 * priority authoritative without allowing a parked issue to consume dispatch.
 */
export function resolveExecutableIssue(
  node: CompletionNode,
  openIssues: OpenIssueRef[],
): number | null {
  return liveIssuesForNode(node, openIssues).find(isExecutableIssue)?.number ?? null;
}
