/**
 * The oc-done guard must never mutate labels on a schedule. Withdrawing
 * `oc-done` re-admits work into the lanes, which the owner has not authorized
 * to happen unattended; transitions are applied only on an explicit dispatch
 * with apply=true or the repository variable OC_DONE_GUARD_APPLY=true.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/oc-done-guard.yml', 'utf8');
const auditStep = workflow.split('name: Audit oc-done claims')[1] ?? '';

describe('oc-done guard workflow', () => {
  it('has an audit step', () => {
    expect(auditStep).toContain('scripts/oc-done-guard.ts');
  });

  it('is report-only on a schedule', () => {
    expect(auditStep).not.toMatch(/event_name\s*==\s*'schedule'/);
    expect(workflow).toMatch(/default:\s*false/);
    expect(workflow).not.toMatch(/apply:[\s\S]*?default:\s*true/);
  });

  it('applies transitions only on explicit dispatch or the owner variable', () => {
    expect(auditStep).toMatch(/github\.event_name == 'workflow_dispatch' && inputs\.apply == true/);
    expect(auditStep).toMatch(/vars\.OC_DONE_GUARD_APPLY == 'true'/);
    expect(auditStep).toContain("'--apply' || ''");
  });

  it('bounds the transitions per run', () => {
    expect(auditStep).toMatch(/--limit 25/);
  });
});
