#!/usr/bin/env node

export const MAX_ACTIVE_LANES = 8;
export const BLOCKED_LABELS = new Set([
  'oc-running', 'oc-validating', 'oc-blocked', 'oc-owner-gate',
  'oc-runtime-backoff', 'oc-done', 'oc-publication-hold',
]);

export function selectLanes({ issues = [], runningCount = 0, maxActiveLanes = MAX_ACTIVE_LANES } = {}) {
  if (!Number.isSafeInteger(runningCount) || runningCount < 0 ||
      !Number.isSafeInteger(maxActiveLanes) || maxActiveLanes < 0 || maxActiveLanes > MAX_ACTIVE_LANES) {
    throw new Error('Unknown or invalid lane capacity');
  }
  const capacity = Math.max(0, maxActiveLanes - runningCount);
  const selected = [];
  const seen = new Set();
  for (const issue of issues) {
    if (selected.length >= capacity) break;
    if (!Number.isSafeInteger(issue.number) || issue.number <= 0) throw new Error('Invalid issue identity');
    const labels = new Set((issue.labels || []).map(label => typeof label === 'string' ? label : label.name));
    if (seen.has(issue.number) || issue.state === 'closed' || issue.state === 'CLOSED') continue;
    seen.add(issue.number);
    if (!labels.has('oc-queued') && !labels.has('oc-prepared')) continue;
    if (labels.has('oc-portfolio-steward') || issue.portfolioSteward) continue;
    if ([...BLOCKED_LABELS].some(label => labels.has(label))) continue;
    if (/^OC-AUTO-HOLD:\s*true\s*$/m.test(issue.body || '')) continue;
    // A failed deterministic revision is not retryable just because a stale
    // queue label survived. It needs one concrete open repair lineage; the
    // absence of a PR is a durable hold, not permission to repeat the run.
    if (labels.has('oc-repair') && issue.repairablePr !== true) continue;
    // Repair must retain one existing OPEN PR and its branch; ambiguous/closed lineages stay held.
    if (issue.hasDurablePr && !(labels.has('oc-repair') && issue.repairablePr === true)) continue;
    selected.push(issue.number);
  }
  return { capacity, selected };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  process.stdout.write(`${JSON.stringify(selectLanes(JSON.parse(raw)))}\n`);
}
