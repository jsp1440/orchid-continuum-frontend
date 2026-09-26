import { describe, expect, it } from 'vitest';

import { decide, parseReceiptComment, transitions, type Observation, type Receipt } from './ocDoneGuard';

const SHA_ON_MAIN = '31c5dcd21296619ee7b9ccdd7583c33dc9743caf';
const SHA_ELSEWHERE = '4ea032b7cacab6e1a9312e2d5b2111212c40b843';
const onMain = (sha: string) => sha === SHA_ON_MAIN;

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return { sha: SHA_ON_MAIN, changedFileCount: 0, disposition: 'done', mode: 'validate', schema: 'oc.swarm-provider-free-result.v1', ...overrides };
}

function observe(overrides: Partial<Observation> = {}): Observation {
  return { number: 47, state: 'closed', labels: ['oc-done'], receipts: [], mergedPullRequestShas: [], ...overrides };
}

describe('oc-done guard', () => {
  it('never admits an open issue, whatever its receipts say', () => {
    const decision = decide(observe({ state: 'open', receipts: [receipt({ changedFileCount: 5 })], mergedPullRequestShas: [SHA_ON_MAIN] }), onMain);
    expect(decision).toEqual({ number: 47, allowed: false, reason: 'issue_open', evidence: {} });
  });

  it('leaves issues without the claim alone', () => {
    expect(decide(observe({ labels: ['oc-queued'] }), onMain).reason).toBe('not_claimed');
  });

  it('fails closed without a receipt carrying a full SHA', () => {
    expect(decide(observe(), onMain).reason).toBe('no_receipt_with_full_sha');
    expect(decide(observe({ receipts: [receipt({ sha: null, changedFileCount: 3 })] }), onMain).reason).toBe('no_receipt_with_full_sha');
    expect(decide(observe({ receipts: [receipt({ disposition: 'blocked', changedFileCount: 3 })] }), onMain).reason).toBe('no_receipt_with_full_sha');
  });

  it('fails closed when the receipt SHA is not on the target branch', () => {
    const decision = decide(observe({ receipts: [receipt({ sha: SHA_ELSEWHERE, changedFileCount: 3 })] }), onMain);
    expect(decision.reason).toBe('receipt_sha_not_on_target_branch');
    expect(decision.evidence).toEqual({ shas: [SHA_ELSEWHERE] });
  });

  it('treats a validate-only receipt with zero changed files as no evidence of change', () => {
    const decision = decide(observe({ receipts: [receipt()] }), onMain);
    expect(decision.reason).toBe('no_change_evidence');
    expect(decision.evidence).toEqual({ sha: SHA_ON_MAIN, changed_file_count: 0 });
  });

  it('admits changed files on the target branch, a merged PR, or a validation-only issue', () => {
    expect(decide(observe({ receipts: [receipt({ changedFileCount: 4, mode: 'implement' })] }), onMain).reason).toBe('changed_files_receipt');
    expect(decide(observe({ receipts: [receipt()], mergedPullRequestShas: [SHA_ON_MAIN] }), onMain).reason).toBe('merged_pull_request');
    expect(decide(observe({ labels: ['oc-done', 'oc-validation-only'], receipts: [receipt()] }), onMain).reason).toBe('validation_only_issue');
  });

  it('only transitions refused claims', () => {
    const decisions = [decide(observe({ state: 'open' }), onMain), decide(observe({ receipts: [receipt({ changedFileCount: 4 })] }), onMain)];
    expect(transitions(decisions)).toEqual([
      { number: 47, remove: ['oc-done'], add: ['oc-validating'], reason: 'issue_open', evidence: {} },
    ]);
  });

  it('parses the real swarm receipt comment and ignores claims and malformed JSON', () => {
    const payload = {
      schema: 'oc.swarm-provider-free-result.v1',
      disposition: 'done',
      integration_sha: SHA_ELSEWHERE,
      issue_number: 1592,
      mode: 'validate',
      write_set: { changed_file_count: 0, schema: 'oc.swarm-write-set-verification.v2' },
    };
    const body = `[OC-SWARM-V4] Provider-free worker completed, actual write set validated, and lease released: \`${JSON.stringify(payload)}\`. Run: https://example.invalid/runs/1`;
    expect(parseReceiptComment(body)).toEqual({ sha: SHA_ELSEWHERE, changedFileCount: 0, disposition: 'done', mode: 'validate', schema: 'oc.swarm-provider-free-result.v1' });
    expect(parseReceiptComment('[OC-SWARM-V4] Dependency/resource lease claimed: `{"schema":"oc.swarm-claim.v1","issue_number":1592}`.')).toBeNull();
    expect(parseReceiptComment('[OC-SWARM-V4] completed: `{not json}`')).toBeNull();
    expect(parseReceiptComment('plain comment')).toBeNull();
    expect(parseReceiptComment('x: `{"schema":"oc.swarm-provider-free-result.v1","disposition":"done","integration_sha":"4ea032b7"}`')?.sha).toBeNull();
  });
});
