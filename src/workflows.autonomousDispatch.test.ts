import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * Guards the continuous-completion control plane against the defect that kept the
 * autonomous worker from ever dispatching.
 *
 * `planner` is skipped on almost every cycle (it only runs when the backlog needs a
 * refill). GitHub propagates a skipped job's state *transitively* to dependents: a job
 * that survives the skip via `always()` does not stop the propagation for jobs that
 * depend on it in turn. `prepare` used `always()` and ran, but `lane1..3` gated on a
 * bare `needs.prepare.outputs.issueN != ''` and were therefore skipped on every run —
 * selecting an issue, marking it `oc-running`, and dispatching nothing.
 *
 * These tests read the real workflow file, so they fail if that gating regresses.
 */

type WorkflowJob = {
  needs?: string | string[];
  if?: string | boolean;
  uses?: string;
  outputs?: Record<string, string>;
};

type Workflow = { jobs: Record<string, WorkflowJob> };

const WORKFLOW_PATH = resolve(
  __dirname,
  "../.github/workflows/orchid-continuous-completion.yml",
);

const workflow = yaml.load(readFileSync(WORKFLOW_PATH, "utf8")) as Workflow;

const LANES = ["lane1", "lane2", "lane3"] as const;

const needsOf = (job: WorkflowJob): string[] => {
  if (!job.needs) return [];
  return Array.isArray(job.needs) ? job.needs : [job.needs];
};

const conditionOf = (job: WorkflowJob): string =>
  typeof job.if === "string" ? job.if : "";

/** Every job reachable through `needs`, including indirect dependencies. */
const transitiveNeeds = (name: string, seen = new Set<string>()): Set<string> => {
  for (const dependency of needsOf(workflow.jobs[name] ?? {})) {
    if (seen.has(dependency)) continue;
    seen.add(dependency);
    transitiveNeeds(dependency, seen);
  }
  return seen;
};

const defeatsSkipPropagation = (condition: string): boolean =>
  /\balways\s*\(\s*\)/.test(condition) || /!\s*cancelled\s*\(\s*\)/.test(condition);

describe("autonomous completion lane dispatch", () => {
  it("parses the continuous-completion workflow", () => {
    expect(workflow.jobs).toBeTypeOf("object");
    for (const lane of LANES) {
      expect(workflow.jobs[lane]).toBeDefined();
    }
  });

  it("keeps planner in every lane's transitive dependency chain", () => {
    // If this stops being true the always() requirement below may no longer be
    // needed - but the guard must be re-derived deliberately, not silently lost.
    for (const lane of LANES) {
      expect(transitiveNeeds(lane).has("planner")).toBe(true);
    }
  });

  it("gates each lane with always() so a skipped planner cannot skip the worker", () => {
    for (const lane of LANES) {
      expect(defeatsSkipPropagation(conditionOf(workflow.jobs[lane]))).toBe(true);
    }
  });

  it("still requires prepare to have succeeded", () => {
    // always() alone would dispatch a worker even when prepare failed, against a
    // stale or empty selection. The result check has to survive alongside it.
    for (const lane of LANES) {
      expect(conditionOf(workflow.jobs[lane])).toContain(
        "needs.prepare.result == 'success'",
      );
    }
  });

  it("still dispatches only when prepare selected an issue for that lane", () => {
    LANES.forEach((lane, index) => {
      expect(conditionOf(workflow.jobs[lane])).toContain(
        `needs.prepare.outputs.issue${index + 1} != ''`,
      );
    });
  });

  it("passes the selected issue through to the lane workflow", () => {
    LANES.forEach((lane, index) => {
      const job = workflow.jobs[lane] as WorkflowJob & { with?: Record<string, string> };
      expect(job.uses).toBe("./.github/workflows/orchid-completion-lane.yml");
      expect(job.with?.issue_number).toBe(
        `\${{ needs.prepare.outputs.issue${index + 1} }}`,
      );
    });
  });

  it("declares the prepare outputs the lanes read", () => {
    const outputs = workflow.jobs.prepare?.outputs ?? {};
    for (const key of ["issue1", "issue2", "issue3"]) {
      expect(outputs[key]).toBe(`\${{ steps.queue.outputs.${key} }}`);
    }
  });

  it("binds the queue to the graph admission output before it falls back to the portfolio queue", () => {
    const prepare = workflow.jobs.prepare as WorkflowJob & { steps?: Array<{ name?: string; run?: string }> };
    const stepNames = prepare.steps?.map((step) => step.name ?? "") ?? [];
    expect(stepNames).toContain("Bind queue to graph admission");
    expect(prepare.steps?.some((step) => step.run?.includes("npx tsx scripts/graphAdmission.ts"))).toBe(true);
    expect(prepare.steps?.some((step) => step.run?.includes("graph_issue"))).toBe(true);
  });

  it("requires always() on every job downstream of an always() job", () => {
    // The general form of the defect: any job whose dependency chain contains a job
    // that is routinely skipped must defeat skip propagation itself.
    const alwaysJobs = Object.entries(workflow.jobs)
      .filter(([, job]) => defeatsSkipPropagation(conditionOf(job)))
      .map(([name]) => name);

    for (const [name, job] of Object.entries(workflow.jobs)) {
      const dependsOnAlwaysJob = needsOf(job).some((dependency) =>
        alwaysJobs.includes(dependency),
      );
      if (!dependsOnAlwaysJob) continue;
      expect(
        defeatsSkipPropagation(conditionOf(job)),
        `job "${name}" depends on a job gated with always() and must use always() itself`,
      ).toBe(true);
    }
  });
});
