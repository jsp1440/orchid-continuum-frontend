/**
 * Cross-repository completion receipt contract, frontend side.
 *
 * `contracts/oc-completion-receipt.v1.json` is mirrored byte-for-byte from
 * jsp1440/orchid-calyx-backend, whose "OC Completion Receipt Contract" workflow
 * checks this repository out and fails when the two copies or these sources
 * diverge. This test is the local half: the evidence contracts declared in the
 * control plane must stay within the shared contract, and a lease may only
 * carry a full 40-hex implementation SHA.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

type FieldSpec = { frontend_field: string; required: boolean; pattern?: string };
type Contract = {
  schema: string;
  receipt_fields: Record<string, FieldSpec>;
  bindings: {
    frontend: {
      supervisor_discovery: { file: string; required_fields: string[] };
      graph_issue_decision: { file: string; required_fields: string[] };
      lease_sha_pattern: { file: string; pattern: string };
    };
  };
};

const contract = JSON.parse(readFileSync('contracts/oc-completion-receipt.v1.json', 'utf8')) as Contract;
const frontendFields = new Set(Object.values(contract.receipt_fields).map((spec) => spec.frontend_field));

function requiredFieldSets(file: string): string[][] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/requiredFields:\s*\[([^\]]*)\]/g)].map((match) =>
    [...match[1].matchAll(/['"]([A-Za-z0-9_]+)['"]/g)].map((m) => m[1]),
  );
}

describe('completion receipt contract (frontend side)', () => {
  it('is the shared v1 contract', () => {
    expect(contract.schema).toBe('oc.completion-receipt.v1');
    expect(contract.receipt_fields.implementation_sha.pattern).toBe('^[a-f0-9]{40}$');
    expect(contract.receipt_fields.test_evidence_digest.pattern).toBe('^[a-f0-9]{64}$');
  });

  it.each(['supervisor_discovery', 'graph_issue_decision'] as const)(
    '%s declares exactly the pinned requiredFields, all inside the contract',
    (binding) => {
      const pinned = contract.bindings.frontend[binding];
      const found = requiredFieldSets(pinned.file);
      expect(found).toContainEqual(pinned.required_fields);
      expect(pinned.required_fields).toContain('implementationSha');
      for (const field of pinned.required_fields) expect(frontendFields.has(field)).toBe(true);
    },
  );

  it('validates lease implementation SHAs with the full 40-hex pattern', () => {
    const { file, pattern } = contract.bindings.frontend.lease_sha_pattern;
    const source = readFileSync(file, 'utf8');
    expect(pattern).toBe(contract.receipt_fields.implementation_sha.pattern);
    expect(source).toMatch(/\/\^\[a-f0-9\]\{40\}\$\//);
  });

  it('rejects abbreviated, uppercase and symbolic revisions', () => {
    const sha = new RegExp(contract.receipt_fields.implementation_sha.pattern);
    expect(sha.test('bcf6bcb1e873bc5fe05b7c339cb30a74bbc55fd3')).toBe(true);
    for (const bad of ['bcf6bcb1', 'BCF6BCB1E873BC5FE05B7C339CB30A74BBC55FD3', 'main', '', 'origin/main']) {
      expect(sha.test(bad)).toBe(false);
    }
  });
});
