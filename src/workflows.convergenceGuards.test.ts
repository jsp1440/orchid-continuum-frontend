import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const scheduler = readFileSync(
  resolve(__dirname, "../.github/workflows/orchid-continuous-completion.yml"),
  "utf8",
);
const lane = readFileSync(
  resolve(__dirname, "../.github/workflows/orchid-completion-lane.yml"),
  "utf8",
);

describe("continuous completion convergence guards", () => {
  it("acquires and verifies the issue lease before dispatch output", () => {
    const acquire = scheduler.indexOf("--remove-label oc-queued");
    const verify = scheduler.indexOf('lease=$(gh issue view "$issue"');
    const emit = scheduler.indexOf('echo "issue${output}=$issue"');

    expect(acquire).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(acquire);
    expect(emit).toBeGreaterThan(verify);
    expect(scheduler).toContain('[[ "$lease" == *oc-running* && "$lease" != *oc-queued* ]] || continue');
  });

  it("suppresses unchanged durable issue/PR heads using a material fingerprint", () => {
    expect(scheduler).toContain("--json number,body,headRefOid");
    expect(scheduler).toContain('fingerprint="issue=${issue};pr=${durable_pr};head=${durable_sha};mode=repair"');
    expect(scheduler).toContain("[OC-AUTO-FINGERPRINT]");
    expect(scheduler).toContain("--add-label oc-runtime-backoff");
  });

  it("routes an ordinary durable PR directly to validation", () => {
    expect(scheduler).toContain('if [[ "$repair" != true ]]');
    expect(scheduler).toContain("--remove-label oc-queued --remove-label oc-running --add-label oc-validating");
  });

  it("defensively refuses provider execution for an unchanged durable non-repair lineage", () => {
    expect(lane).toContain('if [[ "$running" == true && "$durable" == true && "$repair" != true ]]');
    expect(lane).toContain('echo "execute=false" >> "$GITHUB_OUTPUT"');
    expect(lane).toContain("--remove-label oc-running --remove-label oc-queued --add-label oc-validating");
    expect(lane).toContain('if [[ "$running" == true && "$runtime_backoff" != true ]]');
  });
});
