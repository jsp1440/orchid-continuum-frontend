import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ANTI-ROBOT FRONTEND CONTRACT.
 *
 * The backend now returns one integrated conversational answer plus a separate
 * `synthesis_structure` carrying the machinery the answer deliberately does not
 * narrate. These tests fail if the workspace re-fragments that into a
 * source-inventory primary surface, or hides the states a scientific reader
 * must be able to see.
 */

const ROOT = resolve(process.cwd(), 'src');

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('Calyx answer rendering keeps synthesis primary', () => {
  const workspace = source('pages/CalyxWorkspace.tsx');

  it('renders the answer prose itself as the primary surface', () => {
    // The conversational answer is rendered directly, not decomposed into
    // per-subsystem panels by the client.
    expect(workspace).toContain('<CalyxMessageContent content={turn.content} />');
  });

  it('puts the synthesis detail behind progressive disclosure, not inline', () => {
    const detail = workspace.slice(workspace.indexOf('function SynthesisDetail'));
    expect(detail).toContain('<details');
    expect(detail).toContain('How this answer was reached');
  });

  it('never renders a per-source-family block as the primary answer', () => {
    for (const inventoryHeading of [
      'Evidence summary',
      'Supporting evidence count',
      'External literature context',
      'Climate context',
      'Evidence vs inference',
    ]) {
      expect(workspace).not.toContain(inventoryHeading);
    }
  });
});

describe('Calyx synthesis detail surfaces the states a reader must see', () => {
  const workspace = source('pages/CalyxWorkspace.tsx');
  const detail = workspace.slice(workspace.indexOf('const COVERAGE_STYLE'));

  it('distinguishes supported, contested, contradicted and unresolved claims', () => {
    for (const coverage of ['supported', 'contested', 'contradicted', 'unresolved']) {
      expect(detail).toContain(coverage);
    }
  });

  it('never presents a contradiction as agreement', () => {
    expect(detail).toContain('Evidence disagrees');
    expect(detail).toContain('Contradicted');
  });

  it('states that missing evidence is not evidence of absence', () => {
    expect(detail).toContain('Missing evidence, not evidence of absence');
  });

  it('shows an unresolved claim as unlinked rather than as a zero', () => {
    expect(detail).toContain('No linked evidence');
    expect(detail).not.toContain('0 evidence');
  });

  it('discloses when the answer was composed rather than reasoned generatively', () => {
    expect(detail).toContain('degraded_composition');
    expect(detail).toContain('generative reasoning path was not');
  });

  it('shows the resolved subject so a follow-up visibly continues the thread', () => {
    expect(detail).toContain('follow_up_turn');
    expect(detail).toContain('Continuing:');
  });

  it('keeps governed provenance inspectable', () => {
    expect(detail).toContain('governed_provenance');
    expect(detail).toContain('evidence packet');
  });

  it('names when evidence was combined across more than one kind of source', () => {
    expect(detail).toContain('Combined across');
    expect(detail).toContain('source_families.length > 1');
  });
});

describe('Calyx synthesis contract types', () => {
  const contract = source('lib/calyxWorkspace.ts');

  it('treats the synthesis structure as optional so older backends still render', () => {
    expect(contract).toContain('synthesis_structure?: CalyxSynthesisStructure | null');
  });

  it('models coverage states rather than raw counts alone', () => {
    expect(contract).toContain('CalyxClaimCoverage');
    expect(contract).toContain('"supported" | "contested" | "contradicted" | "unresolved"');
  });

  it('carries the degraded-composition flag through to the client', () => {
    expect(contract).toContain('degraded_composition');
    expect(contract).toContain('resolved_subject');
  });
});
