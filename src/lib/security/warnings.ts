/**
 * Just-in-time warnings for high-risk but non-destructive situations.
 *
 * A warning is a structured, specific message shown BEFORE a consequential
 * action. It never uses vague language like "suspicious behavior detected".
 * Each warning states: what is about to happen, why it looks risky, the
 * affected system/data, the evidence, whether the action is blocked/paused/
 * flagged, the safest next action, and what authorization would be required.
 *
 * The default posture (per the directive) is observation + explanation +
 * warning — not automatic blocking — gated behind a feature flag.
 */

import type { PolicyDecision } from './toolPolicy';
import type { InjectionDetection } from './promptInjection';

export type WarningPosture = 'flagged' | 'paused' | 'blocked';

export interface JitWarning {
  /** Stable warning id. */
  id: string;
  what: string;
  why: string;
  affected: string;
  evidence: string[];
  posture: WarningPosture;
  safest_next_action: string;
  authorization_required: string;
}

function postureFor(decision: PolicyDecision['decision'], enforcing: boolean): WarningPosture {
  if (decision === 'require_approval') return 'paused';
  if (decision === 'deny') return enforcing ? 'blocked' : 'flagged';
  return 'flagged';
}

/**
 * Derive a just-in-time warning from a policy decision. `enforcing` reflects the
 * feature flag: when false (first release default), denials are surfaced as
 * FLAGGED warnings rather than hard blocks.
 */
export function warningFromDecision(
  decision: PolicyDecision,
  ctx: { tool: string; mission: string; evidence?: string[]; enforcing: boolean },
): JitWarning | null {
  if (decision.decision === 'allow') return null;

  const posture = postureFor(decision.decision, ctx.enforcing);
  const authMap: Record<string, string> = {
    'secret.access_denied': 'A governed policy change granting this mission secret access.',
    'tool.not_allowed': "Adding the tool to the mission's allowlist via review.",
    'capability.missing': 'Granting the required capability through governed approval.',
    'action.requires_approval': 'A human/governed approver authorizing the consequential action.',
    'injection.block': 'Reviewer clearance after the untrusted source is quarantined.',
  };

  return {
    id: `warn.${decision.code}`,
    what: `Mission ${ctx.mission} attempted tool "${ctx.tool}".`,
    why: decision.reason,
    affected: `mission:${ctx.mission} / tool:${ctx.tool}`,
    evidence: ctx.evidence ?? [],
    posture,
    safest_next_action:
      decision.decision === 'require_approval'
        ? 'Leave the action paused and route it to a governed approver.'
        : 'Keep the action denied and investigate the mission context before retrying.',
    authorization_required:
      authMap[decision.code] ?? 'Governed approval appropriate to the flagged action.',
  };
}

/** A warning specifically for suspected injection in retrieved material. */
export function warningFromInjection(
  detection: InjectionDetection,
  ctx: { source: string; enforcing: boolean },
): JitWarning | null {
  if (!detection.detected) return null;
  const posture: WarningPosture =
    detection.recommendation === 'block_and_alert'
      ? ctx.enforcing
        ? 'blocked'
        : 'flagged'
      : 'flagged';
  return {
    id: 'warn.prompt_injection',
    what: `Retrieved content from "${ctx.source}" appears to contain instructions aimed at the agent.`,
    why: `Detected ${detection.categories.join(', ')} (max confidence ${detection.confidence.toFixed(
      2,
    )}). This content is treated as data, not instructions.`,
    affected: `source:${ctx.source}`,
    evidence: detection.matches.map((m) => m.snippet),
    posture,
    safest_next_action:
      'Continue using the content only as evidence; do not let it direct tools or reveal secrets.',
    authorization_required:
      'No action proceeds from this content without the normal mission + governed approval path.',
  };
}
