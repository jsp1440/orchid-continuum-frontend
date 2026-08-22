/**
 * Canonical completion graph — evidence-credit and anti-gaming rules.
 *
 * Operationalizes the OC-OBSERVATORY truthfulness rules that a gate score
 * alone cannot establish: skipped/cancelled CI is not success, a stale or
 * superseded PR is not active evidence, an unevidenced gate score of 1 is
 * not credit, and a capability cannot be PRODUCT_COMPLETE on code alone.
 */

import type { CompletionNode, Evidence } from './types';

/**
 * Whether a single piece of evidence currently counts as *active* support for
 * a gate score of 1. Presence-based evidence (file/route/test/doc/commit/issue)
 * counts as active by citation alone. Lifecycle evidence (ci/pr) must declare
 * an active lifecycle state — a non-active declared state fails closed.
 */
export function evidenceCountsAsActive(evidence: Evidence): boolean {
  if (evidence.kind === 'ci') {
    return evidence.ciState === 'success';
  }
  if (evidence.kind === 'pr') {
    if (evidence.prState === undefined) return true; // legacy citation with no declared lifecycle state
    return evidence.prState === 'merged' || evidence.prState === 'open';
  }
  return true;
}

export function hasActiveEvidence(node: CompletionNode): boolean {
  return node.evidence.some(evidenceCountsAsActive);
}

export type CreditViolation = {
  nodeId: string;
  nodeName: string;
  reason: string;
};

/**
 * A leaf claiming any gate score of 1 must cite at least one piece of
 * evidence, and that evidence must not be exclusively inactive (skipped/
 * cancelled/failed/pending CI, or a stale/superseded/closed PR). Returns
 * every violation found anywhere in the (sub)tree.
 */
export function findCreditViolations(root: CompletionNode): CreditViolation[] {
  const violations: CreditViolation[] = [];

  function visit(node: CompletionNode) {
    if (node.gateScores) {
      const claimsCredit = Object.values(node.gateScores).some((v) => v === 1);
      if (claimsCredit) {
        if (node.evidence.length === 0) {
          violations.push({ nodeId: node.id, nodeName: node.name, reason: 'claims a gate score of 1 with zero evidence citations' });
        } else if (!hasActiveEvidence(node)) {
          violations.push({
            nodeId: node.id,
            nodeName: node.name,
            reason: 'claims a gate score of 1 but every citation is inactive (skipped/cancelled/failed/pending CI or a stale/superseded/closed PR)',
          });
        }
      }
    }
    for (const child of node.children) visit(child);
  }

  visit(root);
  return violations;
}

/**
 * "CODE_COMPLETE without deployment does not become PRODUCT_COMPLETE": a leaf
 * cannot declare productComplete MET unless its own deployedOperational gate
 * is confirmed (1). Branches are exempt — their productComplete is a rollup
 * governed by rollupThreeLevels, not a direct claim about this node.
 */
export function findThreeLevelsViolations(root: CompletionNode): CreditViolation[] {
  const violations: CreditViolation[] = [];

  function visit(node: CompletionNode) {
    if (node.children.length === 0 && node.threeLevels.productComplete === 'MET' && node.gateScores?.deployedOperational !== 1) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        reason: 'declares productComplete=MET without a confirmed (1) deployedOperational gate',
      });
    }
    for (const child of node.children) visit(child);
  }

  visit(root);
  return violations;
}
