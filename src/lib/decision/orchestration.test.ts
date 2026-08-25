import { describe, expect, it } from "vitest";

import {
  runDecisionPipeline,
  collectOutputs,
  isCleanlyComplete,
  type StageExecutor,
} from "./orchestration";
import { DECISION_STAGES, type DecisionStage } from "./contracts";

/** An executor that records `output` for its stage and reports one token used. */
function ok(output: unknown): StageExecutor {
  return () => ({ status: "complete", output, tokensUsed: 1, provider: "test" });
}

function allOk(): Partial<Record<DecisionStage, StageExecutor>> {
  const map: Partial<Record<DecisionStage, StageExecutor>> = {};
  for (const stage of DECISION_STAGES) map[stage] = ok({ stage });
  return map;
}

describe("clean full run", () => {
  it("completes every stage in order and is cleanly complete", async () => {
    const state = await runDecisionPipeline({ runId: "r1", executors: allOk() });
    expect(state.stages.map((s) => s.status)).toEqual(DECISION_STAGES.map(() => "complete"));
    expect(state.partial).toBe(false);
    expect(state.resumeFrom).toBeNull();
    expect(isCleanlyComplete(state)).toBe(true);
    expect(Object.keys(collectOutputs(state))).toHaveLength(DECISION_STAGES.length);
  });
});

describe("provider failure yields a truthful, resumable partial", () => {
  it("halts at the failing stage; no later stage runs", async () => {
    const executors = allOk();
    let extractRan = false;
    executors.RETRIEVE = () => {
      throw new Error("provider down");
    };
    executors.EXTRACT = () => {
      extractRan = true;
      return { status: "complete", output: null };
    };

    const state = await runDecisionPipeline({ runId: "r2", executors });
    const retrieve = state.stages.find((s) => s.stage === "RETRIEVE")!;
    expect(retrieve.status).toBe("failed");
    expect(retrieve.telemetry.degradedReason).toContain("provider down");
    expect(state.partial).toBe(true);
    expect(state.resumeFrom).toBe("RETRIEVE");
    // Crucially: nothing downstream fabricated a result on top of missing evidence.
    expect(extractRan).toBe(false);
    const synth = state.stages.find((s) => s.stage === "SYNTHESIZE")!;
    expect(synth.status).toBe("pending");
  });

  it("a stage reporting status:failed halts identically", async () => {
    const executors = allOk();
    executors.SCREEN = () => ({ status: "failed", output: null, degradedReason: "index unavailable" });
    const state = await runDecisionPipeline({ runId: "r2b", executors });
    expect(state.resumeFrom).toBe("SCREEN");
    expect(state.partial).toBe(true);
  });
});

describe("idempotent resume", () => {
  it("does not re-run stages that already completed", async () => {
    const executors = allOk();
    let retrieveCalls = 0;
    executors.RETRIEVE = () => {
      retrieveCalls += 1;
      if (retrieveCalls === 1) throw new Error("transient");
      return { status: "complete", output: { ok: true } };
    };

    const first = await runDecisionPipeline({ runId: "r3", executors });
    expect(first.resumeFrom).toBe("RETRIEVE");

    // FRAME and PLAN completed; they must not run again on resume.
    let frameCalls = 0;
    executors.FRAME = () => {
      frameCalls += 1;
      return { status: "complete", output: { stage: "FRAME" } };
    };

    const second = await runDecisionPipeline({ runId: "r3", executors, priorState: first });
    expect(frameCalls).toBe(0); // already complete, not re-run
    expect(retrieveCalls).toBe(2); // retried on resume
    expect(second.partial).toBe(false);
    expect(isCleanlyComplete(second)).toBe(true);
  });
});

describe("retry within a single run", () => {
  it("retries a failed stage up to maxAttemptsPerStage before giving up", async () => {
    const executors = allOk();
    let calls = 0;
    executors.EXTRACT = () => {
      calls += 1;
      if (calls < 3) throw new Error("flaky");
      return { status: "complete", output: { ok: true } };
    };
    const state = await runDecisionPipeline({ runId: "r4", executors, maxAttemptsPerStage: 3 });
    expect(calls).toBe(3);
    expect(state.stages.find((s) => s.stage === "EXTRACT")!.status).toBe("complete");
    expect(state.partial).toBe(false);
  });
});

describe("cancellation stops at a stage boundary", () => {
  it("marks the next stage cancelled and records where to resume", async () => {
    const executors = allOk();
    let cancelAfter = false;
    executors.PLAN = () => {
      cancelAfter = true; // request cancellation after PLAN completes
      return { status: "complete", output: { stage: "PLAN" } };
    };
    const state = await runDecisionPipeline({
      runId: "r5",
      executors,
      isCancelled: () => cancelAfter,
    });
    expect(state.cancelled).toBe(true);
    expect(state.resumeFrom).toBe("RETRIEVE");
    expect(state.stages.find((s) => s.stage === "RETRIEVE")!.status).toBe("cancelled");
  });
});

describe("budget exhaustion is a truthful stop", () => {
  it("halts when the token budget runs out rather than skipping silently", async () => {
    const executors = allOk(); // each stage reports 1 token
    const state = await runDecisionPipeline({ runId: "r6", executors, tokenBudget: 3 });
    // 3 stages consume the budget; the 4th cannot start.
    const failed = state.stages.find((s) => s.status === "failed");
    expect(failed?.telemetry.degradedReason).toContain("budget");
    expect(state.partial).toBe(true);
  });
});

describe("degraded stage keeps the run partial and telemetry honest", () => {
  it("continues but does not report a clean completion", async () => {
    const executors = allOk();
    executors.VERIFY = () => ({ status: "degraded", output: { partial: true }, degradedReason: "verification service slow; partial coverage" });
    const state = await runDecisionPipeline({ runId: "r7", executors });
    const verify = state.stages.find((s) => s.stage === "VERIFY")!;
    expect(verify.status).toBe("degraded");
    expect(verify.telemetry.degradedReason).toContain("partial coverage");
    expect(state.partial).toBe(true);
    expect(isCleanlyComplete(state)).toBe(false);
  });
});

describe("missing executor is recorded as skipped, not invented", () => {
  it("skips a stage with no executor and records it", async () => {
    const executors = allOk();
    delete executors.RENDER;
    const state = await runDecisionPipeline({ runId: "r8", executors });
    expect(state.stages.find((s) => s.stage === "RENDER")!.status).toBe("skipped");
    // A skipped stage still lets the pipeline finish.
    expect(state.resumeFrom).toBeNull();
  });
});
