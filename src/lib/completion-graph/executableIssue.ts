import type { CompletionNode } from './types';

export type OpenIssueRef = {
  number: number;
  body?: string | null;
};

export function graphNodeMarker(nodeId: string): string {
  return `OC-GRAPH-NODE: ${nodeId}`;
}

function normalizeRef(ref: string): string {
  return ref.replace(/^.*#/, '');
}

/**
 * Resolve only a live issue as executable work for a graph leaf.
 *
 * Historical PR evidence is deliberately ignored. A merged PR can prove that
 * code once landed, but it can never be coerced into an issue lease. A
 * materialized graph issue is recognized by its stable graph-node marker so
 * the runtime does not create duplicate work while the graph census is being
 * reconciled.
 */
export function resolveExecutableIssue(
  node: CompletionNode,
  openIssues: OpenIssueRef[],
): number | null {
  const declaredIssues = new Set(
    (node.issues ?? [])
      .map(normalizeRef)
      .filter((value) => /^\d+$/.test(value))
      .map(Number),
  );

  const declared = openIssues.find((issue) => declaredIssues.has(issue.number));
  if (declared) return declared.number;

  const marker = graphNodeMarker(node.id);
  const materialized = openIssues.find((issue) => (issue.body ?? '').includes(marker));
  return materialized?.number ?? null;
}
