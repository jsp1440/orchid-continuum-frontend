#!/usr/bin/env node

export function selectLanes({ issues = [], runningCount = 0, maxActiveLanes = 8 } = {}) {
  const capacity = Math.max(0, Number(maxActiveLanes) - Number(runningCount));
  const blockedLabels = new Set([
    "oc-running",
    "oc-validating",
    "oc-blocked",
    "oc-owner-gate",
    "oc-runtime-backoff",
    "oc-done",
  ]);
  const selected = [];
  for (const issue of issues) {
    if (selected.length >= capacity) break;
    const labels = new Set(issue.labels || []);
    if (![...blockedLabels].some((label) => labels.has(label)) && !issue.hasDurablePr) {
      selected.push(issue.number);
    }
  }
  return { capacity, selected };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input = raw.trim() ? JSON.parse(raw) : {};
  process.stdout.write(`${JSON.stringify(selectLanes(input), null, 2)}\n`);
}
