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
  steps?: Array<{ name?: string; uses?: string; with?: Record<string, string>; run?: string }>;
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

  it("checks out the integration branch before graph admission executes", () => {
    const steps = workflow.jobs.prepare?.steps ?? [];
    const checkout = steps.findIndex((step) => step.name === "Checkout integration branch for graph admission");
    const graph = steps.findIndex((step) => step.name === "Bind queue to graph admission");

    expect(checkout).toBe(0);
    expect(graph).toBeGreaterThan(checkout);
    expect(steps[checkout].uses).toBe("actions/checkout@11d5960a326750d5838078e36cf38b85af677262");
    expect(steps[checkout].with?.ref).toBe("oc-autonomous-integration");
    expect(steps[graph].run).toContain("npx tsx scripts/graphAdmission.ts");
  });

  it("leases a graph-selected issue before emitting it to a lane", () => {
    const prepare = workflow.jobs.prepare as WorkflowJob & { steps?: Array<{ name?: string; run?: string }> };
    const queue = prepare.steps?.find((step) => step.name === "Fill available execution slots from priority portfolio");
    const run = queue?.run ?? "";
    const graphStart = run.indexOf('graph_issue="${{ steps.graph.outputs.graph_issue }}"');
    const helper = run.indexOf("try_lease ()");
    const capacityCheck = run.indexOf("capacity=$(( MAX_ACTIVE_LANES - running ))", helper);
    const lease = run.indexOf('gh issue edit "$issue" --repo "$REPO" --remove-label oc-queued --remove-label oc-validating --remove-label oc-runtime-backoff --add-label oc-running', helper);
    const leaseVerify = run.indexOf('lease=$(gh issue view "$issue"', helper);
    const helperSuccess = run.indexOf('leased_issue="$issue"', leaseVerify);
    const claim = run.indexOf('if try_lease "$graph_issue"', graphStart);
    const emit = run.indexOf('echo "issue1=$leased_issue"', claim);

    expect(graphStart).toBeGreaterThanOrEqual(0);
    expect(helper).toBeGreaterThanOrEqual(0);
    expect(capacityCheck).toBeGreaterThan(helper);
    expect(lease).toBeGreaterThan(capacityCheck);
    expect(leaseVerify).toBeGreaterThan(lease);
    expect(helperSuccess).toBeGreaterThan(leaseVerify);
    expect(claim).toBeGreaterThan(graphStart);
    expect(emit).toBeGreaterThan(claim);
    expect(run).toContain('[[ "$lease" == *oc-running* && "$lease" != *oc-queued* ]]');
  });

  it("suppresses unchanged durable PR lineages before provider dispatch", () => {
    const prepare = workflow.jobs.prepare as WorkflowJob & { steps?: Array<{ name?: string; run?: string }> };
    const queue = prepare.steps?.find((step) => step.name === "Fill available execution slots from priority portfolio");
    const run = queue?.run ?? "";

    expect(run).toContain('marker="OC-AUTO-ISSUE: #${issue}"');
    expect(run).toContain('headRefOid');
    expect(run).toContain('[OC-AUTO-FINGERPRINT]');
    expect(run).toContain('fingerprint="issue=${issue};pr=${durable_pr};head=${durable_sha};mode=repair"');
    expect(run).toContain('Unchanged durable repair lineage suppressed');
    expect(run).toContain('--add-label oc-runtime-backoff');
  });

  it("serializes selectors and leases every portfolio output through the verified helper", () => {
    expect(workflow.jobs).toBeDefined();
    const prepare = workflow.jobs.prepare;
    const queue = prepare.steps?.find((step) => step.name === "Fill available execution slots from priority portfolio");
    const run = queue?.run ?? "";
    const portfolio = run.indexOf('for value in "${selected[@]:-}"');
    const claim = run.indexOf('if try_lease "$value"', portfolio);
    const emit = run.indexOf('echo "issue${output}=$leased_issue"', claim);

    expect(workflow).toHaveProperty("concurrency.group", "orchid-continuous-completion-${{ github.repository }}");
    expect(portfolio).toBeGreaterThanOrEqual(0);
    expect(claim).toBeGreaterThan(portfolio);
    expect(emit).toBeGreaterThan(claim);
    expect(run.slice(portfolio)).not.toContain('echo "issue$((idx+1))=$value"');
  });

  it("does not fall through to legacy queue selection after a valid graph selection", () => {
    const prepare = workflow.jobs.prepare as WorkflowJob & { steps?: Array<{ name?: string; run?: string }> };
    const queue = prepare.steps?.find((step) => step.name === "Fill available execution slots from priority portfolio");
    const run = queue?.run ?? "";
    const graphStart = run.indexOf('graph_issue="${{ steps.graph.outputs.graph_issue }}"');
    const legacyStart = run.indexOf("priority_of ()", graphStart);
    const graphBranch = run.slice(graphStart, legacyStart);

    expect(graphBranch).toContain('if [[ -n "$graph_issue" ]]; then');
    expect(run.slice(0, graphStart)).toContain('echo "issue${idx}=" >> "$GITHUB_OUTPUT"');
    expect(graphBranch).toContain('if try_lease "$graph_issue"; then');
    expect(graphBranch).toContain('echo "issue1=$leased_issue" >> "$GITHUB_OUTPUT"');
    expect(graphBranch).toContain("exit 0");
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
