/**
 * Secret & external-dependency readiness matrix — shared types (OC-OBSERVATORY-003 / issue #299).
 *
 * This module answers, per credential/config value, per execution environment:
 * "is it actually required here, and is it ready?" — without ever storing,
 * printing, or transmitting the value itself. There is deliberately no
 * `value` field anywhere in this type: a record can describe a dependency's
 * requirement and readiness in full without ever holding what it's worth.
 */

export type DependencyClassification =
  | 'SECRET'
  | 'PUBLIC_CONFIG'
  | 'BUILT_IN_TOKEN'
  | 'CONNECTION_STRING'
  | 'PARTNER_CREDENTIAL';

/** Execution environments the mission requires the matrix to distinguish. */
export type DependencyEnvironment =
  | 'BACKEND_RENDER'
  | 'FRONTEND_RENDER'
  | 'BACKEND_GITHUB_ACTIONS'
  | 'FRONTEND_GITHUB_ACTIONS'
  | 'OTHER';

export type DependencyReadinessState =
  | 'CONFIGURED'
  | 'NOT_REQUIRED'
  | 'MISSING'
  | 'INVALID'
  | 'EXTERNAL_BLOCKER'
  | 'UNKNOWN';

/**
 * One environment's requirement/readiness row for a dependency.
 *
 * `required` and `source` must be derived from an actual code/workflow
 * reference (or an explicit absence-of-reference finding) — never assumed
 * true "for symmetry" with another environment that happens to need it.
 */
export type DependencyRequirement = {
  environment: DependencyEnvironment;
  required: boolean;
  /** Exact file/workflow reference (or explicit grep-absence finding) this requirement was derived from. */
  source: string;
  readiness: DependencyReadinessState;
  /** How readiness is/would be confirmed. Must never describe reading, hashing, or comparing the value. */
  validationMethod: string;
  /** Most recent successful canary/use evidence, if any. Absent (not empty-string-as-zero) when there is none yet. */
  lastEvidence?: string;
  /** Current blocker or the next concrete action, phrased so "unknown" is never conflated with "measured zero". */
  blockerOrNextAction: string;
};

export type DependencyRecord = {
  id: string;
  provider: string;
  owningCapability: string;
  classification: DependencyClassification;
  requirements: DependencyRequirement[];
  notes?: string;
};

const FORBIDDEN_VALUE_KEYS = ['value', 'secretValue', 'rawValue', 'apiKey', 'token'] as const;

/**
 * Structural guard used by tests: fails if any record/requirement carries a
 * key that could hold an actual credential value rather than metadata about
 * it. `token` is intentionally included since a field literally named
 * `token` inside a readiness record would invite pasting one in.
 */
export function assertNoValueLikeKeys(record: DependencyRecord): void {
  const keys = [...Object.keys(record), ...record.requirements.flatMap((r) => Object.keys(r))];
  for (const key of keys) {
    if ((FORBIDDEN_VALUE_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Dependency record "${record.id}" carries a value-like key: "${key}"`);
    }
  }
}
