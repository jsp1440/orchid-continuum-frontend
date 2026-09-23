#!/usr/bin/env npx tsx

/**
 * Backward-compatible entry point for graph admission.
 *
 * Continuous completion now calls the permanent supervisor lane directly. Keep
 * this wrapper for manual/operator invocations so they cannot bypass the same
 * cross-repository discovery, explicit capability allow-list, packet schema,
 * and no-provider materialization rules.
 */
import { runSupervisorDiscovery } from './oc-supervisor-discovery';

const result = runSupervisorDiscovery();
process.stdout.write(JSON.stringify({
  admissible: result.discovery.graphSelection !== null,
  selected: result.discovery.graphSelection?.nodeId ?? null,
  issueNumber: result.materialization.issueNumber ?? '',
  mode: result.materialization.action === 'created' || result.materialization.action === 'reused'
    ? 'issue'
    : 'blocked',
  materialized: result.materialization.action === 'created',
  decision: result.materialization.action,
  reason: result.materialization.reason,
  surfacedBlockers: [],
  suppressedDuplicates: [],
  reasons: result.discovery.reasons,
}) + '\\n');
