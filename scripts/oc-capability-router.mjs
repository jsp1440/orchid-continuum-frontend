/**
 * Decide which lane an issue belongs in, from what it declares it needs.
 *
 * The dispatch runtime asked one question — `process.env.PROVIDER_AUTHORIZED === 'true'`
 * — a single global boolean, hard-wired false one level up in
 * orchid-deterministic-dispatch.yml. It is not a per-task test of any kind, so a
 * task that needs no model at all is refused with exactly the same
 * `provider_not_authorized` receipt as one that does, and dropped. With 24
 * issues queued, the controller has planned and refused the same work every five
 * minutes while reporting success.
 *
 * This module is the per-task question that was missing. It answers it in two
 * steps, because they are two different questions and conflating them
 * reintroduced the original bug one level down:
 *
 *   1. *Does this capability need a provider?* That is a property of the
 *      capability and is the same in every repository. The answer lives in the
 *      shared registry — `contracts/oc-shared-capabilities.v1.json` here, mirrored
 *      from `contracts/cognitive_integration_capabilities_v1.json` in the Brain
 *      and `app/provider_reservoir/capabilities.py` in orchid-calyx-backend.
 *      `capabilityRouter.test.ts` pins this file against the Brain's copy.
 *
 *   2. *Can THIS repository execute it, and with what command?* That is local.
 *      The frontend can run its own tests, linter, typechecker, build and route
 *      sweep; it cannot resolve taxonomy or assemble a reasoning map, which are
 *      backend capabilities.
 *
 * Before the split, every shared deterministic capability the frontend could not
 * itself run — 11 of the 14, including `fixture-execution` and `reconcile` —
 * raised `CapabilityUnknown` and was routed `provider_free=false`, refusing
 * deterministic work for want of a provider it never needed. A capability this
 * repository cannot execute is now reported as exactly that: deterministic, with
 * no executor here. It never becomes a provider requirement, and it never
 * suppresses the deterministic work in the same issue that this repository *can*
 * run.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const contractPath = fileURLToPath(
  new URL('../contracts/oc-shared-capabilities.v1.json', import.meta.url),
);

/** The cross-repository registry: what each capability is, and whether it needs a model. */
export const SHARED_CONTRACT = Object.freeze(JSON.parse(readFileSync(contractPath, 'utf8')));

/** Shared capability name -> provider_required. The classification, not the execution. */
export const SHARED_CAPABILITIES = Object.freeze(
  Object.fromEntries(SHARED_CONTRACT.capabilities.map(c => [c.name, Boolean(c.provider_required)])),
);

/**
 * Capabilities this repository can execute with no provider, and how.
 *
 * A name here that the shared registry marks `provider_required` would be this
 * repository claiming to do locally what the Continuum has agreed needs a model;
 * the test rejects that, and so does `assertLocalExecutorsAreDeterministic`.
 *
 * `typecheck-execution`, `route-verification`, `featured-genus-verification`
 * and `build-verification` are
 * frontend-local: they have no backend or Brain counterpart because no other
 * repository has a TypeScript project, a router or a Vite build to check. They
 * are deterministic by construction — each is an npm script in this repository.
 */
export const LOCAL_EXECUTORS = Object.freeze({
  'test-execution': 'npm run test',
  'lint-execution': 'npm run lint',
  'typecheck-execution': 'npm run typecheck',
  'schema-validation': 'npm run validate:deployment',
  'route-verification': 'npm run verify:routes',
  'render-route-verification': 'npm run verify:render-routes',
  'featured-genus-verification': 'npm run verify:featured-genus',
  'build-verification': 'npm run build',
});

/** Deterministic capabilities, whether or not this repository can run them. */
export const DETERMINISTIC_CAPABILITIES = Object.freeze(
  Object.fromEntries(
    Object.entries(SHARED_CAPABILITIES)
      .filter(([, providerRequired]) => !providerRequired)
      .map(([name]) => [name, LOCAL_EXECUTORS[name] ?? null])
      .concat(
        Object.entries(LOCAL_EXECUTORS).filter(([name]) => !Object.hasOwn(SHARED_CAPABILITIES, name)),
      ),
  ),
);

/** Capabilities that genuinely need a language model. */
export const PROVIDER_CAPABILITIES = Object.freeze(
  Object.entries(SHARED_CAPABILITIES)
    .filter(([, providerRequired]) => providerRequired)
    .map(([name]) => name)
    .sort(),
);

const CAPABILITY_MARKER = /^OC-SWARM-CAPABILITY:\s*([a-z0-9][a-z0-9-]*)\s*$/gim;
const OPTIONAL_MARKER = /^OC-SWARM-PROVIDER-OPTIONAL:\s*([a-z0-9][a-z0-9-]*)\s*$/gim;

/**
 * A declaration can also be carried by a label, which is why the lane had no
 * input at all.
 *
 * Every one of the 24 queued issues routed `undeclared`, and nothing in this
 * repository writes an `OC-SWARM-CAPABILITY:` line — the marker had a reader and
 * no producer, so the provider-free lane could never fire for any real issue.
 * Editing an owner's issue body to add one is not triage, so the declaration is
 * accepted from a label as well: `oc-cap:test-execution`, and
 * `oc-cap-optional:` for a provider capability the task can proceed without.
 *
 * A label is still an explicit declaration, applied deliberately and visible on
 * the issue. It is emphatically not inference from prose: reading intent out of
 * the description is the "does the body contain a hard word" heuristic this
 * module exists to replace, and it stays gone.
 */
const CAPABILITY_LABEL = /^oc-cap:\s*([a-z0-9][a-z0-9-]*)$/i;
const OPTIONAL_LABEL = /^oc-cap-optional:\s*([a-z0-9][a-z0-9-]*)$/i;

function labelNames(issue) {
  const labels = Array.isArray(issue?.labels) ? issue.labels : [];
  return labels.map(l => String(typeof l === 'string' ? l : l?.name || '').trim());
}

function fromLabels(issue, pattern) {
  const found = [];
  for (const label of labelNames(issue)) {
    const match = pattern.exec(label);
    if (match) found.push(match[1].toLowerCase());
  }
  return found;
}

export class CapabilityUnknown extends Error {}

/** Guard the one inconsistency a local binding could introduce. */
export function assertLocalExecutorsAreDeterministic() {
  for (const name of Object.keys(LOCAL_EXECUTORS)) {
    if (SHARED_CAPABILITIES[name] === true) {
      throw new Error(
        `capability '${name}' is provider-required in the shared registry, so this ` +
          'repository must not bind a deterministic command to it',
      );
    }
  }
}

function collect(body, pattern) {
  const found = [];
  const re = new RegExp(pattern.source, pattern.flags);
  let match;
  while ((match = re.exec(String(body || ''))) !== null) found.push(match[1].toLowerCase());
  return found;
}

/**
 * Classify one issue.
 *
 * Throws on a capability no registry classifies, rather than guessing a lane:
 * guessing toward the provider spends money on work that may not need it, and
 * guessing the other way hands work to an executor that cannot do it and then
 * reports success it did not earn.
 */
export function routeIssue(issue) {
  assertLocalExecutorsAreDeterministic();

  const body = String(issue?.body || '');
  const declared = [
    ...new Set([...collect(body, CAPABILITY_MARKER), ...fromLabels(issue, CAPABILITY_LABEL)]),
  ];
  const optional = new Set([
    ...collect(body, OPTIONAL_MARKER),
    ...fromLabels(issue, OPTIONAL_LABEL),
  ]);

  const executable = [];
  const notExecutableHere = [];
  const providerRequired = [];
  for (const name of declared) {
    if (Object.hasOwn(LOCAL_EXECUTORS, name)) executable.push(name);
    else if (SHARED_CAPABILITIES[name] === false) notExecutableHere.push(name);
    else if (SHARED_CAPABILITIES[name] === true) providerRequired.push(name);
    else
      throw new CapabilityUnknown(
        `capability '${name}' is not classified; add it to the registry rather than letting routing guess`,
      );
  }

  for (const name of optional) {
    if (SHARED_CAPABILITIES[name] === false || Object.hasOwn(LOCAL_EXECUTORS, name)) {
      throw new Error(
        `capability '${name}' is deterministic, so marking it optional is meaningless; it runs either way`,
      );
    }
  }

  const blocking = providerRequired.filter(name => !optional.has(name));
  const parked = providerRequired.filter(name => optional.has(name));

  return {
    issue: Number(issue?.number) || 0,
    /** Deterministic and runnable here. */
    deterministic: executable.sort(),
    /** Deterministic, but belonging to another repository's executor. */
    deterministicElsewhere: notExecutableHere.sort(),
    blockingProvider: blocking.sort(),
    optionalProvider: parked.sort(),
    /** Deterministic work can run now, whatever the provider budget says. */
    providerFree: executable.length > 0 && blocking.length === 0,
    /** Nothing here can run without a provider. */
    fullyBlocked:
      executable.length === 0 && notExecutableHere.length === 0 && blocking.length > 0,
    /** Nothing declared: no lane is inferred, and difficulty is not a signal. */
    undeclared: declared.length === 0,
  };
}

/** The commands a provider-free lane should run for this issue, in order. */
export function commandsFor(routing) {
  return routing.deterministic.map(name => LOCAL_EXECUTORS[name]);
}

/**
 * Why this issue was refused, in a form that survives the refusal.
 *
 * The existing denied-lane receipt records only `provider_not_authorized`. That
 * is true and useless: it does not say what the task wanted, whether it needed a
 * provider at all, or what could have run without one.
 */
export function refusalRecord(issue, routing) {
  return {
    schema: 'oc.lane-refusal.v1',
    issue: routing.issue,
    provider_free: routing.providerFree,
    deterministic_capabilities: routing.deterministic,
    deterministic_capabilities_without_local_executor: routing.deterministicElsewhere,
    blocking_provider_capabilities: routing.blockingProvider,
    optional_provider_capabilities: routing.optionalProvider,
    reason: routing.undeclared
      ? 'no capability declared; the lane will not infer one from the task description'
      : routing.providerFree
        ? 'deterministic work is available and should not have been refused'
        : routing.deterministic.length === 0 && routing.blockingProvider.length === 0
          ? 'every declared capability is deterministic but has no executor in this repository; this is not a provider blocker'
          : 'every declared capability requires a provider, and none is authorized',
    would_run: commandsFor(routing),
  };
}
