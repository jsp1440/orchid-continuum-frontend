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
 * This module is the per-task question that was missing. It mirrors the registry
 * in orchid-calyx-backend (app/provider_reservoir/capabilities.py) and the Brain
 * (contracts/cognitive_integration_capabilities_v1.json); all three must agree,
 * and a test pins that they do.
 */

/** Capabilities this repository can execute with no provider, and how. */
export const DETERMINISTIC_CAPABILITIES = Object.freeze({
  'test-execution': 'npm run test',
  'lint-execution': 'npm run lint',
  'typecheck-execution': 'npm run typecheck',
  'schema-validation': 'npm run validate:deployment',
  'route-verification': 'npm run verify:routes',
  'build-verification': 'npm run build',
});

/** Capabilities that genuinely need a language model. */
export const PROVIDER_CAPABILITIES = Object.freeze([
  'natural-language-explanation',
  'free-text-intent-parsing',
  'open-ended-code-authoring',
  'literature-summarisation',
]);

const CAPABILITY_MARKER = /^OC-SWARM-CAPABILITY:\s*([a-z0-9][a-z0-9-]*)\s*$/gim;
const OPTIONAL_MARKER = /^OC-SWARM-PROVIDER-OPTIONAL:\s*([a-z0-9][a-z0-9-]*)\s*$/gim;

export class CapabilityUnknown extends Error {}

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
 * Throws on an unclassified capability rather than guessing a lane: guessing
 * toward the provider spends money on work that may not need it, and guessing
 * the other way hands work to an executor that cannot do it and then reports
 * success it did not earn.
 */
export function routeIssue(issue) {
  const body = String(issue?.body || '');
  const declared = [...new Set(collect(body, CAPABILITY_MARKER))];
  const optional = new Set(collect(body, OPTIONAL_MARKER));

  const deterministic = [];
  const providerRequired = [];
  for (const name of declared) {
    if (Object.hasOwn(DETERMINISTIC_CAPABILITIES, name)) deterministic.push(name);
    else if (PROVIDER_CAPABILITIES.includes(name)) providerRequired.push(name);
    else throw new CapabilityUnknown(
      `capability '${name}' is not classified; add it to the registry rather than letting routing guess`,
    );
  }

  for (const name of optional) {
    if (Object.hasOwn(DETERMINISTIC_CAPABILITIES, name)) {
      throw new Error(`capability '${name}' is deterministic, so marking it optional is meaningless; it runs either way`);
    }
  }

  const blocking = providerRequired.filter(name => !optional.has(name));
  const parked = providerRequired.filter(name => optional.has(name));

  return {
    issue: Number(issue?.number) || 0,
    deterministic: deterministic.sort(),
    blockingProvider: blocking.sort(),
    optionalProvider: parked.sort(),
    /** Deterministic work can run now, whatever the provider budget says. */
    providerFree: deterministic.length > 0 && blocking.length === 0,
    /** Nothing here can run without a provider. */
    fullyBlocked: deterministic.length === 0 && blocking.length > 0,
    /** Nothing declared: no lane is inferred, and difficulty is not a signal. */
    undeclared: declared.length === 0,
  };
}

/** The commands a provider-free lane should run for this issue, in order. */
export function commandsFor(routing) {
  return routing.deterministic.map(name => DETERMINISTIC_CAPABILITIES[name]);
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
    blocking_provider_capabilities: routing.blockingProvider,
    optional_provider_capabilities: routing.optionalProvider,
    reason: routing.undeclared
      ? 'no capability declared; the lane will not infer one from the task description'
      : routing.providerFree
        ? 'deterministic work is available and should not have been refused'
        : 'every declared capability requires a provider, and none is authorized',
    would_run: commandsFor(routing),
  };
}
