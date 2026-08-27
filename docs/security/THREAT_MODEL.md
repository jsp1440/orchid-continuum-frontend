# Orchid Continuum — Security Threat Model

Scope: Continuum frontend, backend, Calyx and AI-assisted interfaces, Research
Station and literature ingestion, taxonomy/occurrence/trait/image/pollinator/
mycorrhizal/interaction pipelines, GitHub repos + Actions + deployments, Render
services/workers, Neon PostgreSQL, third-party scientific APIs, configured model
providers, admin auth/z events, ingestion/provenance systems, and autonomous
missions/agents.

Format per threat: **vector → impact → existing/added control → residual risk**.
"Added control" references modules under `src/lib/security/`.

## 1. Account takeover
- **Vector:** credential stuffing, phishing, session theft.
- **Impact:** unauthorized admin/scientific actions.
- **Control:** `auth.repeated_failures`, `authz.repeated_denials` signals;
  admin actions emit events; pseudonymous actor refs.
- **Residual:** MFA enrollment is out of scope for this subsystem; recommend
  existing IdP MFA. No automatic account lock (fail-open on remediation by
  policy — human confirms).

## 2. Repository compromise / 3. Malicious workflow changes
- **Vector:** pushed malicious workflow, deploy from non-governed branch.
- **Impact:** supply-chain code execution, exfiltration.
- **Control:** `ci.unexpected_deploy_branch`; CI/deploy/migration events;
  GitHub telemetry uses approved metadata only (workflow, PR, actor, result,
  SHA) — never private discussion bodies.
- **Residual:** requires the backend to emit CI events; branch allowlist must be
  configured.

## 4. Dependency compromise
- **Vector:** malicious transitive dependency or workflow-modifying PR.
- **Impact:** RCE / secret theft in CI.
- **Control:** suspicious-workflow-modification signal surface; PR metadata
  correlation. Complements (does not replace) existing `check-workflow-security`.
- **Residual:** SCA scanning is delegated to existing tooling.

## 5. Prompt injection / 6. Indirect prompt injection
- **Vector:** untrusted content (PDF, HTML, metadata, citation, API response,
  repo comment, DB text) instructing the agent.
- **Impact:** tool misuse, secret exfiltration, provenance bypass.
- **Control:** `detectPromptInjection` (deterministic, runs before/after model
  calls), `fenceUntrusted`, mission-scoped `toolPolicy`. Model is never the
  boundary. Adversarial corpus regression-tested.
- **Residual:** novel phrasings may evade patterns → defense-in-depth via tool
  policy + secret-deny-by-default limits blast radius.

## 7. Secret exfiltration
- **Vector:** agent or logging path leaks tokens/keys.
- **Impact:** full credential compromise.
- **Control:** schema has no secret fields; recursive sanitizer + final secret
  scan quarantine; `agent.secret_access_denied` by default; canary-string tests.
- **Residual:** secrets embedded in never-scanned free text are truncated/size-
  capped; high-entropy heuristic covers unknown formats.

## 8. Data poisoning / 9. Provenance manipulation
- **Vector:** malicious ingested claim, provenance bypass request.
- **Impact:** corrupted scientific record.
- **Control:** `ingestion.missing_provenance` signal; injection category
  `provenance_bypass`; security risk kept SEPARATE from scientific evidence.
- **Residual:** the subsystem flags integrity issues; it never modifies or
  vetoes science — existing evidence/owner-review gates remain authoritative.

## 10. Sensitive-locality disclosure
- **Vector:** agent/content attempts to publish precise coordinates.
- **Impact:** harm to endangered populations.
- **Control:** sanitizer redacts locality fields; injection category
  `sensitive_locality_publish`; existing redaction policy preserved.
- **Residual:** none added — existing sensitive-locality controls remain in force
  and are never weakened.

## 11. Privilege escalation / 12. Excessive agency
- **Vector:** role grant, agent scope expansion, unapproved tool.
- **Impact:** unauthorized capability.
- **Control:** `admin.privilege_escalation`; `toolPolicy` allowlist +
  capability checks (`agent.unapproved_tool`, `agent.scope_expansion`);
  consequential actions require governed approval.
- **Residual:** requires mission policies to be defined per mission type.

## 13. Denial-of-wallet / model-cost exhaustion
- **Vector:** runaway recursion/retries/fan-out, provider error storm.
- **Impact:** cost blowout, unsafe fallback.
- **Control:** `toolPolicy` caps (maxToolCalls/Retries/FanOut/RecursionDepth);
  `model.provider_error_storm` signal.
- **Residual:** caps are configurable; defaults conservative.

## 14. Forged webhooks
- **Vector:** attacker posts unsigned/invalid webhook.
- **Impact:** spoofed events / actions.
- **Control:** `webhook.verification_failure` signal; ingestion endpoint is
  authenticated (no public arbitrary-event endpoint).
- **Residual:** signature verification itself is the caller's responsibility;
  the subsystem records failures.

## 15. Bulk database extraction
- **Vector:** enumeration / mass export.
- **Impact:** data exfiltration.
- **Control:** `database.bulk_access` (absolute + baseline σ), `database.
  readonly_write`.
- **Residual:** legitimate exports look identical → baseline + mission context
  reduce false positives; disposition loop tunes thresholds.

## 16. Unsafe automated remediation
- **Vector:** the security system itself taking destructive action.
- **Impact:** self-inflicted outage.
- **Control:** **no automatic destructive remediation.** Default posture is
  observe/warn; enforcement flag-gated; consequential actions require governed
  approval; feedback loop proposes, never applies.
- **Residual:** by design, none — humans remain in the loop.
