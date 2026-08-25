/**
 * orchestration — the budget-aware, resumable state machine that drives one
 * evidence-to-decision run through its ten stages:
 *
 *   FRAME → PLAN → RETRIEVE → SCREEN → EXTRACT → SYNTHESIZE → CHALLENGE →
 *   VERIFY → RENDER → REVIEW
 *
 * The design goals are the ones the mission makes non-negotiable: each stage has
 * explicit state; a completed stage is idempotent (re-running the pipeline does
 * not redo it); a failed stage yields a *truthful, resumable partial* rather than
 * a fabricated complete answer; and a cancelled run stops cleanly at a stage
 * boundary. The runner is pure with respect to I/O: it takes stage executors as
 * inputs, so tests drive it with deterministic fixtures and provider-failure
 * simulations without any network.
 */

import {
  DECISION_STAGES,
  DECISION_CONTRACT_VERSION,
  type DecisionStage,
  type RunStageStatus,
  type StageTelemetry,
} from "./contracts";

/** What a stage executor returns. `output` is opaque to the runner. */
export type StageResult = {
  /** `complete` or `degraded` continue the pipeline; `failed` halts it. */
  status: Extract<RunStageStatus, "complete" | "degraded" | "failed" | "skipped">;
  output: unknown;
  sourceCount?: number;
  recordCount?: number;
  latencyMs?: number | null;
  provider?: string | null;
  promptVersion?: string | null;
  tokensUsed?: number | null;
  costUsd?: number | null;
  /** Required when status is `degraded` or `failed`; explains what happened. */
  degradedReason?: string | null;
};

export type StageContext = {
  stage: DecisionStage;
  /** Outputs of all previously completed stages, keyed by stage. */
  outputs: Partial<Record<DecisionStage, unknown>>;
  /** Attempt number for this stage, starting at 1. */
  attempt: number;
  /** Remaining token budget for the run, if one is set. */
  budgetRemaining: number | null;
};

export type StageExecutor = (ctx: StageContext) => Promise<StageResult> | StageResult;

export type RunStageRecord = {
  stage: DecisionStage;
  status: RunStageStatus;
  telemetry: StageTelemetry;
  output: unknown;
};

export type RunState = {
  runId: string;
  contractVersion: typeof DECISION_CONTRACT_VERSION;
  stages: RunStageRecord[];
  /** The stage a resume should continue from; null when the run is finished. */
  resumeFrom: DecisionStage | null;
  /** True unless every stage reached a clean `complete`/`skipped`. */
  partial: boolean;
  cancelled: boolean;
};

export type RunOptions = {
  runId: string;
  executors: Partial<Record<DecisionStage, StageExecutor>>;
  /** Optional resume: skip stages already `complete` in this prior state. */
  priorState?: RunState | null;
  /** Max attempts per stage on `failed`. Default 1 (no retry). */
  maxAttemptsPerStage?: number;
  /** Total token budget; stages report usage and the runner stops if exhausted. */
  tokenBudget?: number | null;
  /** Checked between stages; return true to cancel at the next boundary. */
  isCancelled?: () => boolean;
  /** Schema version stamped into telemetry. Defaults to the contract version. */
  schemaVersion?: string;
};

function pendingTelemetry(stage: DecisionStage, schemaVersion: string): StageTelemetry {
  return {
    stage,
    status: "pending",
    sourceCount: 0,
    recordCount: 0,
    latencyMs: null,
    provider: null,
    promptVersion: null,
    schemaVersion,
    tokensUsed: null,
    costUsd: null,
    degradedReason: null,
  };
}

function freshState(runId: string, schemaVersion: string): RunState {
  return {
    runId,
    contractVersion: DECISION_CONTRACT_VERSION,
    stages: DECISION_STAGES.map((stage) => ({
      stage,
      status: "pending" as RunStageStatus,
      telemetry: pendingTelemetry(stage, schemaVersion),
      output: null,
    })),
    resumeFrom: DECISION_STAGES[0],
    partial: true,
    cancelled: false,
  };
}

/** Seed a run state from a prior one so completed stages are not redone. */
function seedFromPrior(runId: string, schemaVersion: string, prior: RunState | null | undefined): RunState {
  const state = freshState(runId, schemaVersion);
  if (!prior) return state;
  for (const record of state.stages) {
    const previous = prior.stages.find((s) => s.stage === record.stage);
    // Only `complete`/`skipped` stages are carried forward — a degraded or failed
    // stage is re-attempted on resume, which is the honest behaviour.
    if (previous && (previous.status === "complete" || previous.status === "skipped")) {
      record.status = previous.status;
      record.telemetry = previous.telemetry;
      record.output = previous.output;
    }
  }
  return state;
}

function firstIncompleteStage(state: RunState): DecisionStage | null {
  const next = state.stages.find((s) => s.status !== "complete" && s.status !== "skipped");
  return next ? next.stage : null;
}

/**
 * Run (or resume) the pipeline. Returns the final RunState. The function never
 * throws for a stage failure — a thrown executor is caught and recorded as a
 * `failed` stage, producing a resumable partial. It only rejects if given a
 * structurally invalid options object.
 */
export async function runDecisionPipeline(options: RunOptions): Promise<RunState> {
  const schemaVersion = options.schemaVersion ?? DECISION_CONTRACT_VERSION;
  const maxAttempts = Math.max(1, options.maxAttemptsPerStage ?? 1);
  const state = seedFromPrior(options.runId, schemaVersion, options.priorState);
  let budgetRemaining = options.tokenBudget ?? null;

  const outputs: Partial<Record<DecisionStage, unknown>> = {};
  for (const record of state.stages) {
    if (record.status === "complete" || record.status === "skipped") outputs[record.stage] = record.output;
  }

  for (const record of state.stages) {
    if (record.status === "complete" || record.status === "skipped") continue;

    // Cancellation is checked at each stage boundary, before doing any work.
    if (options.isCancelled?.()) {
      record.status = "cancelled";
      record.telemetry = { ...record.telemetry, status: "cancelled" };
      state.cancelled = true;
      state.resumeFrom = record.stage;
      state.partial = true;
      return state;
    }

    // Budget exhaustion is a truthful stop, not a silent skip.
    if (budgetRemaining !== null && budgetRemaining <= 0) {
      record.status = "failed";
      record.telemetry = { ...record.telemetry, status: "failed", degradedReason: "token budget exhausted" };
      state.resumeFrom = record.stage;
      state.partial = true;
      return state;
    }

    const executor = options.executors[record.stage];
    if (!executor) {
      // No executor supplied for this stage → explicitly skipped, recorded as such.
      record.status = "skipped";
      record.telemetry = { ...record.telemetry, status: "skipped" };
      outputs[record.stage] = null;
      continue;
    }

    let result: StageResult | null = null;
    let lastError: string | null = null;
    let attempts = 0;
    const startedAt = nowMs();
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attempts = attempt;
      try {
        record.status = "running";
        result = await executor({ stage: record.stage, outputs, attempt, budgetRemaining });
        if (result.status !== "failed") break;
        lastError = result.degradedReason ?? "stage reported failure";
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        result = null;
      }
    }

    const latency = result?.latencyMs ?? nowMs() - startedAt;

    if (!result || result.status === "failed") {
      record.status = "failed";
      record.telemetry = {
        ...record.telemetry,
        status: "failed",
        latencyMs: latency,
        degradedReason: lastError ?? "stage failed",
      };
      // Truthful partial: stop here, mark where to resume. No later stage runs,
      // so no synthesis is fabricated on top of missing evidence.
      state.resumeFrom = record.stage;
      state.partial = true;
      return state;
    }

    if (typeof result.tokensUsed === "number" && budgetRemaining !== null) {
      budgetRemaining = Math.max(0, budgetRemaining - result.tokensUsed);
    }

    record.status = result.status; // `complete` or `degraded`
    record.output = result.output;
    outputs[record.stage] = result.output;
    record.telemetry = {
      stage: record.stage,
      status: result.status,
      sourceCount: result.sourceCount ?? 0,
      recordCount: result.recordCount ?? 0,
      latencyMs: latency,
      provider: result.provider ?? null,
      promptVersion: result.promptVersion ?? null,
      schemaVersion,
      tokensUsed: result.tokensUsed ?? null,
      costUsd: result.costUsd ?? null,
      degradedReason: result.status === "degraded" ? result.degradedReason ?? "degraded" : null,
    };
    void attempts;
  }

  const remaining = firstIncompleteStage(state);
  state.resumeFrom = remaining;
  // A run is complete only if every stage is complete/skipped AND nothing degraded.
  const anyDegraded = state.stages.some((s) => s.status === "degraded");
  state.partial = remaining !== null || anyDegraded;
  return state;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** Convenience read: outputs of completed stages keyed by stage. */
export function collectOutputs(state: RunState): Partial<Record<DecisionStage, unknown>> {
  const outputs: Partial<Record<DecisionStage, unknown>> = {};
  for (const record of state.stages) {
    if (record.status === "complete" || record.status === "degraded") outputs[record.stage] = record.output;
  }
  return outputs;
}

/** True when the run reached REVIEW cleanly with no failed/degraded/cancelled stage. */
export function isCleanlyComplete(state: RunState): boolean {
  return !state.partial && !state.cancelled && state.resumeFrom === null;
}
