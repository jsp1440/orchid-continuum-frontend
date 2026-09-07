# Routing evidence policy

## Purpose

The Orchid Continuum control plane must not spend provider capacity based on an unverified worker guess about which model is required.

This policy applies specifically to **non-default provider restriction or escalation**. Deterministic repository policy may still choose among providers that are already declared adequate. A worker may not narrow that adequate set unless it can attach verifiable evidence.

## NO-GUESS invariant

When a work unit declares that only a subset of configured providers is adequate, it MUST carry at least one non-empty routing-evidence reference. Accepted evidence classes are:

- `repository-policy` — an explicit rule already committed to the repository;
- `verified-tool-result` — an observed result from a reproducible tool/run;
- `authoritative-documentation` — a documented capability or constraint from an authoritative source;
- `tested-precedent` — a repository test/eval demonstrating the routing requirement.

If the restriction has no evidence, dispatch fails closed with `routing-evidence-required`. The governor must not infer a stronger-model requirement from importance, elapsed time, worker confidence, or an unsupported natural-language claim.

Evidence participates in the work fingerprint. Changing the evidence is therefore a material routing change and cannot silently reuse a previous dispatch decision.

## Why this shape

This is deliberately a guardrail before provider selection rather than a recommendation embedded only in an agent prompt. OpenAI's Agents SDK guidance distinguishes guardrails from model behavior and supports running blocking checks before tool/model execution when cost or safety matters. Anthropic's agent-engineering guidance recommends using the simplest workflow that works and adding agentic complexity only where it demonstrably improves outcomes.

Authoritative references:

- Anthropic, *Building Effective Agents*: https://www.anthropic.com/engineering/building-effective-agents
- OpenAI Agents SDK, *Guardrails*: https://openai.github.io/openai-agents-python/guardrails/
- OpenAI Agents SDK, *Tracing*: https://openai.github.io/openai-agents-python/tracing/

## Deliberately not specified yet

This policy does **not** invent model-specific complexity thresholds, time cutoffs, token budgets, or claims that one provider is intrinsically "better" for a category of work. Those values require measured Orchid Continuum eval evidence before they are encoded.

Until such evals exist, the control plane may use existing deterministic provider priority/budget rules, but it may not manufacture an escalation requirement.
