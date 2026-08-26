import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

type WorkflowJob = {
  needs?: string | string[];
  if?: string | boolean;
  uses?: string;
  outputs?: Record<string, string>;
  env?: Record<string, string | number>;
  with?: Record<string, string>;
};

type Workflow = { jobs: Record<string, WorkflowJob> };

const schedulerPath = resolve(
  __dirname,
  "../.github/workflows/orchid-continuous-completion.yml",
);
const lanePath = resolve(
  __dirname,
  "../.github/workflows/orchid-completion-lane.yml",
);
const schedulerText = readFileSync(schedulerPath, "utf8");
const laneText = readFileSync(lanePath, "utf8");
const workflow = yaml.load(schedulerText) as Workflow;
const LANES = ["lane1", "lane2", "lane3", "lane4", "lane5"] as const;

const conditionOf = (job: WorkflowJob): string =>
  typeof job.if === "string" ? job.if : "";

describe("frontend autonomous portfolio control plane", () => {
  it("uses the canonical queued portfolio instead of a fixed backlog", () => {
    expect(schedulerText).not.toContain("BACKLOG=(");
    expect(schedulerText).toContain("--label oc-queued");
    expect(schedulerText).toContain("oc-p0");
    expect(schedulerText).toContain("oc-p5");
    expect(schedulerText).toContain("for p in 0 1 2 3 4 5; do");
    expect(schedulerText).toContain("sort -t'|' -k1,1n -k2,2 -k3,3n");
  });

  it("declares five reusable lanes with a two-worker execution ceiling", () => {
    expect(schedulerText).toContain("MAX_ACTIVE_LANES: 2");
    for (const lane of LANES) {
      expect(workflow.jobs[lane]).toBeDefined();
      expect(workflow.jobs[lane].uses).toBe(
        "./.github/workflows/orchid-completion-lane.yml",
      );
    }
  });

  it("makes every lane survive a skipped refill planner safely", () => {
    LANES.forEach((lane, index) => {
      const condition = conditionOf(workflow.jobs[lane]);
      expect(condition).toContain("always()");
      expect(condition).toContain("needs.prepare.result == 'success'");
      expect(condition).toContain(
        `needs.prepare.outputs.issue${index + 1} != ''`,
      );
    });
  });

  it("calculates free capacity from actual running leases", () => {
    expect(schedulerText).toContain("capacity=$(( MAX_ACTIVE_LANES - running ))");
    expect(schedulerText).toContain("--label oc-running");
    expect(schedulerText).toContain("oc-validating");
    expect(schedulerText).toContain("oc-blocked");
    expect(schedulerText).toContain("oc-owner-gate");
  });

  it("prevents durable PR redispatch except for explicit repair", () => {
    expect(schedulerText).toContain(
      'if [[ -n "$durable" && "$repair" != true ]]; then',
    );
    expect(schedulerText).toContain("--add-label oc-repair");
    expect(schedulerText).toContain("Heal queue invariants");
  });

  it("has bounded aging protection against indefinite starvation", () => {
    expect(schedulerText).toContain("age >= 259200");
    expect(schedulerText).toContain("effective=$(( effective - 1 ))");
  });

  it("does not restrict CI lookup to workflow_dispatch", () => {
    expect(schedulerText).not.toContain(
      "--workflow frontend-ci.yml --branch \"$head\" --event workflow_dispatch",
    );
    expect(schedulerText).not.toContain(
      "--workflow calyx-matrix-005-validation.yml --branch \"$head\" --event workflow_dispatch",
    );
  });

  it("does not use head in pipefail-sensitive control paths", () => {
    expect(schedulerText).not.toContain("| head -1");
    expect(laneText).not.toContain("| head -1");
  });

  it("keeps main and protected operations outside worker authority", () => {
    expect(schedulerText).toContain("OC-AUTO-INTEGRATION-GATE");
    expect(laneText).toContain("Never merge to `main`, deploy production");
    expect(laneText).toContain("mutate production DB/KG/scientific state");
  });
});
