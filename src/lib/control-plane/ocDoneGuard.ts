/**
 * The `oc-done` false-completion rule.
 *
 * `oc-done` is a claim that governed work is finished. The claim is admissible
 * only when (1) the issue is closed, (2) a completion receipt on the issue
 * names a full 40-hex implementation SHA reachable from the target branch and
 * (3) when the issue asks for a change, that receipt reports
 * `changed_file_count > 0` or a merged pull request references the issue. An
 * issue labelled `oc-validation-only` is exempt from (3). Everything else
 * fails closed to `oc-validating`.
 *
 * Mirrors `runtime/oc_done_guard.py` in jsp1440/orchid-calyx-backend.
 */

export const DONE_LABEL = 'oc-done';
export const VALIDATING_LABEL = 'oc-validating';
export const VALIDATION_ONLY_LABEL = 'oc-validation-only';

export const FULL_SHA = /^[a-f0-9]{40}$/;
const RECEIPT_JSON = /`(\{[\s\S]*\})`/;
const RECEIPT_SCHEMAS = new Set(['oc.swarm-provider-free-result.v1', 'oc.completion-receipt.v1']);

export type Receipt = {
  sha: string | null;
  changedFileCount: number | null;
  disposition: string | null;
  mode: string | null;
  schema: string | null;
};

export type Observation = {
  number: number;
  state: 'open' | 'closed';
  labels: string[];
  receipts: Receipt[];
  mergedPullRequestShas: string[];
};

export type Decision = {
  number: number;
  allowed: boolean;
  reason: string;
  evidence: Record<string, unknown>;
};

export type Transition = {
  number: number;
  remove: string[];
  add: string[];
  reason: string;
  evidence: Record<string, unknown>;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Extract a completion receipt from an `[OC-SWARM-V4] ... \`{json}\`` comment. */
export function parseReceiptComment(body: string): Receipt | null {
  const match = RECEIPT_JSON.exec(body ?? '');
  if (!match) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const schema = asString(record.schema);
  if (!schema || !RECEIPT_SCHEMAS.has(schema)) return null;
  const rawSha = asString(record.implementation_sha) ?? asString(record.integration_sha);
  const sha = rawSha ? rawSha.trim().toLowerCase() : null;
  const writeSet = (record.write_set ?? {}) as Record<string, unknown>;
  const count = record.changed_file_count ?? writeSet.changed_file_count;
  return {
    sha: sha && FULL_SHA.test(sha) ? sha : null,
    changedFileCount: typeof count === 'number' && Number.isInteger(count) ? count : null,
    disposition: asString(record.disposition) ?? asString(record.terminal_state),
    mode: asString(record.mode),
    schema,
  };
}

/** Apply the rule. `shaOnTarget` answers whether a SHA is reachable from the target branch. */
export function decide(observation: Observation, shaOnTarget: (sha: string) => boolean): Decision {
  const { number } = observation;
  if (!observation.labels.includes(DONE_LABEL)) return { number, allowed: true, reason: 'not_claimed', evidence: {} };
  if (observation.state !== 'closed') return { number, allowed: false, reason: 'issue_open', evidence: {} };

  const done = observation.receipts.filter(
    (r): r is Receipt & { sha: string } => (r.disposition === 'done' || r.disposition === 'completed') && r.sha !== null,
  );
  if (done.length === 0) return { number, allowed: false, reason: 'no_receipt_with_full_sha', evidence: {} };

  const anchored = done.filter((r) => shaOnTarget(r.sha));
  if (anchored.length === 0) {
    return {
      number,
      allowed: false,
      reason: 'receipt_sha_not_on_target_branch',
      evidence: { shas: [...new Set(done.map((r) => r.sha))].sort() },
    };
  }

  const last = anchored[anchored.length - 1];
  if (observation.labels.includes(VALIDATION_ONLY_LABEL)) {
    return { number, allowed: true, reason: 'validation_only_issue', evidence: { sha: last.sha } };
  }
  if (observation.mergedPullRequestShas.length > 0) {
    return { number, allowed: true, reason: 'merged_pull_request', evidence: { merged: [...observation.mergedPullRequestShas] } };
  }
  const changed = anchored.filter((r) => (r.changedFileCount ?? 0) > 0);
  if (changed.length > 0) {
    return { number, allowed: true, reason: 'changed_files_receipt', evidence: { sha: changed[changed.length - 1].sha } };
  }
  return {
    number,
    allowed: false,
    reason: 'no_change_evidence',
    evidence: { sha: last.sha, changed_file_count: last.changedFileCount },
  };
}

/** Label transitions for every refused claim: remove oc-done, add oc-validating. */
export function transitions(decisions: Decision[]): Transition[] {
  return decisions
    .filter((d) => !d.allowed)
    .map((d) => ({ number: d.number, remove: [DONE_LABEL], add: [VALIDATING_LABEL], reason: d.reason, evidence: d.evidence }));
}
