/**
 * Mission-scoped tool policy — the deterministic enforcement boundary for AI
 * agents (Calyx, Research Station, autonomous missions, future agents).
 *
 * Principles (see docs/security/AI_AGENT_SECURITY_POLICY.md):
 *  - Tools are constrained by mission + capability. An agent may only call
 *    tools its mission allows.
 *  - Tool arguments are validated before a call proceeds.
 *  - Secret access is DENIED by default.
 *  - Consequential (destructive / privilege-changing / publishing) actions
 *    fail closed and require governed approval — the model can never
 *    self-authorize them.
 *  - Recursion, retries, and fan-out are capped (denial-of-wallet defense).
 *  - Every decision produces a sanitized audit event (via ./index emit helper).
 *  - The model is never the enforcement boundary; this module is deterministic.
 */

import type { Signal } from './signals';
import type { InjectionDetection } from './promptInjection';

export interface ToolDefinition {
  name: string;
  /** Capabilities this tool requires to run, e.g. ["network:egress"]. */
  requires: string[];
  /** True when calling this tool is consequential (needs governed approval). */
  consequential?: boolean;
  /** Simple argument schema: key → validator. */
  validateArgs?: (args: Record<string, unknown>) => string[]; // returns issues
}

export interface MissionPolicy {
  mission_id: string;
  mission_type: string;
  /** Allowlisted tool names for this mission. */
  allowedTools: string[];
  /** Capabilities granted to this mission. */
  grantedCapabilities: string[];
  /** Whether this mission may ever access secrets (default false). */
  allowSecrets?: boolean;
  /** Caps for denial-of-wallet / excessive-agency defense. */
  limits: {
    maxToolCalls: number;
    maxRetries: number;
    maxFanOut: number;
    maxRecursionDepth: number;
  };
}

export const DEFAULT_MISSION_LIMITS: MissionPolicy['limits'] = {
  maxToolCalls: 50,
  maxRetries: 3,
  maxFanOut: 10,
  maxRecursionDepth: 5,
};

/** Mutable per-mission counters the caller threads through a run. */
export interface MissionRuntimeState {
  toolCalls: number;
  retries: number;
  fanOut: number;
  recursionDepth: number;
}

export function freshRuntimeState(): MissionRuntimeState {
  return { toolCalls: 0, retries: 0, fanOut: 0, recursionDepth: 0 };
}

export interface ToolCallRequest {
  tool: ToolDefinition;
  args: Record<string, unknown>;
  /** Untrusted content detections in scope for this step, if any. */
  injection?: InjectionDetection;
  /** Whether a governed approval has already been granted for this action. */
  approvalGranted?: boolean;
  /** Whether this call requests access to a secret-bearing resource. */
  requestsSecretAccess?: boolean;
}

export type Decision = 'allow' | 'deny' | 'require_approval';

export interface PolicyDecision {
  decision: Decision;
  /** Stable reason code. */
  code: string;
  reason: string;
  /** Signals to feed the correlation/incident engine. */
  signals: Signal[];
}

function signal(
  signal_id: string,
  reason: string,
  severity: Signal['severity'],
  recommended: string,
): Signal {
  return {
    signal_id,
    reason,
    evidence: [],
    confidence: 0.9,
    severity,
    recommended_response: recommended,
    false_positive_notes:
      'A newly-approved tool/capability whose mission policy has not yet been updated.',
  };
}

/**
 * Evaluate a single tool call against the mission policy + runtime state.
 * Deterministic and pure (state is not mutated; caller applies increments on
 * an allow). Fails closed: unknown conditions deny.
 */
export function evaluateToolCall(
  policy: MissionPolicy,
  state: MissionRuntimeState,
  request: ToolCallRequest,
): PolicyDecision {
  const limits = policy.limits;

  // 1. Denial-of-wallet / excessive-agency caps (fail closed).
  if (state.toolCalls >= limits.maxToolCalls) {
    return deny('limit.tool_calls', `mission exceeded maxToolCalls (${limits.maxToolCalls})`, 'high');
  }
  if (state.retries > limits.maxRetries) {
    return deny('limit.retries', `mission exceeded maxRetries (${limits.maxRetries})`, 'medium');
  }
  if (state.fanOut > limits.maxFanOut) {
    return deny('limit.fan_out', `mission exceeded maxFanOut (${limits.maxFanOut})`, 'medium');
  }
  if (state.recursionDepth > limits.maxRecursionDepth) {
    return deny('limit.recursion', `mission exceeded maxRecursionDepth (${limits.maxRecursionDepth})`, 'medium');
  }

  // 2. Secret access denied by default.
  if (request.requestsSecretAccess && !policy.allowSecrets) {
    return {
      decision: 'deny',
      code: 'secret.access_denied',
      reason: 'access to secret-bearing resource denied by default for this mission',
      signals: [
        signal(
          'agent.secret_access_denied',
          'agent attempted to access a secret; denied by default',
          'high',
          'Confirm the mission legitimately needs the secret; grant via governed policy only.',
        ),
      ],
    };
  }

  // 3. Tool must be in the mission allowlist (scope enforcement).
  if (!policy.allowedTools.includes(request.tool.name)) {
    return {
      decision: 'deny',
      code: 'tool.not_allowed',
      reason: `tool "${request.tool.name}" is not in mission ${policy.mission_id} allowlist`,
      signals: [
        signal(
          'agent.unapproved_tool',
          `agent attempted unapproved tool "${request.tool.name}"`,
          'high',
          'Verify whether the tool should be added to the mission policy through review.',
        ),
      ],
    };
  }

  // 4. Capability check (scope expansion).
  const missing = request.tool.requires.filter(
    (c) => !policy.grantedCapabilities.includes(c),
  );
  if (missing.length > 0) {
    return {
      decision: 'deny',
      code: 'capability.missing',
      reason: `tool requires ungranted capabilities: ${missing.join(', ')}`,
      signals: [
        signal(
          'agent.scope_expansion',
          `agent attempted to exceed mission scope (needs ${missing.join(', ')})`,
          'high',
          'Do not widen the mission automatically; escalate for governed approval.',
        ),
      ],
    };
  }

  // 5. Argument validation.
  const argIssues = request.tool.validateArgs?.(request.args) ?? [];
  if (argIssues.length > 0) {
    return deny(
      'args.invalid',
      `tool argument validation failed: ${argIssues.join('; ')}`,
      'medium',
    );
  }

  // 6. If untrusted content is trying to redirect this call, block + alert.
  if (request.injection?.detected && request.injection.recommendation === 'block_and_alert') {
    return {
      decision: 'deny',
      code: 'injection.block',
      reason: `untrusted content flagged (${request.injection.categories.join(', ')}) — call blocked`,
      signals: [
        signal(
          'ai.prompt_injection',
          `retrieved content attempted ${request.injection.categories.join(', ')}`,
          'high',
          'Quarantine the source content and review the mission.',
        ),
      ],
    };
  }

  // 7. Consequential actions fail closed without governed approval.
  if (request.tool.consequential && !request.approvalGranted) {
    return {
      decision: 'require_approval',
      code: 'action.requires_approval',
      reason: `consequential tool "${request.tool.name}" requires governed approval`,
      signals: [
        signal(
          'agent.consequential_gated',
          `consequential action "${request.tool.name}" paused for governed approval`,
          'medium',
          'A human/governed approver must authorize this action before it proceeds.',
        ),
      ],
    };
  }

  return { decision: 'allow', code: 'ok', reason: 'permitted by mission policy', signals: [] };
}

function deny(code: string, reason: string, severity: Signal['severity']): PolicyDecision {
  return {
    decision: 'deny',
    code,
    reason,
    signals: [signal(`agent.${code.replace(/\./g, '_')}`, reason, severity, 'Review the mission run.')],
  };
}

/** Apply the side effects of an allowed call to the runtime counters. */
export function recordToolCall(state: MissionRuntimeState, opts: { retry?: boolean; fanOut?: number; recursed?: boolean } = {}): MissionRuntimeState {
  return {
    toolCalls: state.toolCalls + 1,
    retries: state.retries + (opts.retry ? 1 : 0),
    fanOut: state.fanOut + (opts.fanOut ?? 0),
    recursionDepth: state.recursionDepth + (opts.recursed ? 1 : 0),
  };
}
