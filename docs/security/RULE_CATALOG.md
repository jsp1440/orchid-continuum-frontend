# Security Rule Catalog

Deterministic signals in the first release. Each is a pure, independently tested
function in `src/lib/security/signals.ts` (infrastructure) or the AI-safeguard
modules (`toolPolicy.ts`, `promptInjection.ts`). Thresholds live in
`DEFAULT_RULE_CONFIG` and are configuration-controlled.

**Security risk ≠ scientific evidence quality.** Scientific novelty (rare taxa,
unusual localities, novel hypotheses) is never a security signal.

| Signal ID | Trigger | Severity | Default confidence | Known false positives |
|-----------|---------|----------|--------------------|-----------------------|
| `auth.repeated_failures` | ≥ N auth failures per actor in window | medium/high | scales with count | password mistype, refresh loop, misconfigured client |
| `authz.repeated_denials` | ≥ 3 authorization denials in window | medium/high | 0.6 | client with stale scopes |
| `admin.privilege_escalation` | role/privilege grant | high | 0.5 | onboarding, scheduled rotation |
| `database.readonly_write` | write by declared read-only service | high | 0.8 | service metadata lagging a re-scope |
| `database.bulk_access` | rows ≥ threshold OR ≥ Nσ over baseline | medium | 0.5–0.9 | scheduled export, legitimate research pull |
| `ci.unexpected_deploy_branch` | deploy from non-governed branch | high | 0.7 | sanctioned hotfix branch not yet allowlisted |
| `webhook.verification_failure` | signature/verification failure | medium/high | 0.75 | sender mid secret-rotation |
| `model.provider_error_storm` | ≥ 5 provider errors in window | medium | 0.6 | provider outage (operational) |
| `ingestion.missing_provenance` | ingested claim lacks provenance | medium | 0.7 | delayed second-pass provenance |
| `agent.unapproved_tool` | tool not in mission allowlist | high | 0.9 | new tool not yet added to policy |
| `agent.scope_expansion` | tool needs ungranted capability | high | 0.9 | capability not yet granted |
| `agent.secret_access_denied` | secret access without permission | high | 0.9 | mission legitimately needs secret (grant via policy) |
| `agent.consequential_gated` | consequential action without approval | medium | 0.9 | expected — action pauses for approval |
| `ai.prompt_injection` | untrusted content override attempt | high | ≤ content confidence | quoted policy discussion, benign meta-text |

## Risk scoring (`risk.ts`)

- Bounded [0,100] via a saturating curve — piling on low-confidence signals
  cannot reach "critical".
- Every contribution (`severity_weight × confidence`) is returned and shown.
- `deterministicPolicyViolation` is a **separate** flag: certain signals
  (`agent.*`, `ai.prompt_injection`, `locality.sensitive_disclosure`,
  `database.readonly_write`) gate consequential actions regardless of score.

## Rule health & change control (`disposition.ts`)

- Precision = confirmed / (confirmed + false_positive) from verified
  dispositions.
- A rule at/below `noisyPrecision` (default 30%) over ≥ `minVerdicts` (default 5)
  is flagged for review.
- Proposals are emitted with `auto_apply: false`. **No silent retraining.** Any
  threshold/rule change is versioned (`security_rule_versions`), reviewed, and
  promoted through the normal repository process.

## Adding a rule

1. Add a pure `Rule` function to `signals.ts` (or an AI-safeguard module).
2. Give it a stable `signal_id`, reason, evidence, confidence, severity,
   recommended response, and false-positive notes.
3. Register it in `RULES`.
4. Add focused tests, including a benign negative that must NOT fire.
5. Document it here.
