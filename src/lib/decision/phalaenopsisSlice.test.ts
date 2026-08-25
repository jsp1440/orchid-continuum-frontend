import { describe, expect, it } from "vitest";

import {
  runPhalaenopsisJourney,
  buildPhalaenopsisFixture,
  PHALAENOPSIS_TAXONOMY_RELEASE,
  PHALAENOPSIS_FRAME,
} from "./phalaenopsisSlice";
import { validateClaim } from "./contracts";
import { isCleanlyComplete } from "./orchestration";

/**
 * The end-to-end vertical slice. This is the "mounted, testable journey" the
 * epic asks for, exercised deterministically over the documented
 * production-equivalent fixture: FRAME → … → REVIEW producing a reproducible
 * manifest, a cited artifact, preserved counterevidence and gaps, and a
 * proposal-only KG contribution.
 */

describe("Phalaenopsis cool-vs-warm journey", () => {
  it("runs all ten stages cleanly over the fixture", async () => {
    const journey = await runPhalaenopsisJourney();
    expect(journey.runState.stages).toHaveLength(10);
    expect(isCleanlyComplete(journey.runState)).toBe(true);
    expect(journey.runState.stages.every((s) => s.status === "complete")).toBe(true);
  });

  it("uses the pinned taxonomy release and frames an explicit decision", () => {
    const journey = buildPhalaenopsisFixture();
    expect(PHALAENOPSIS_TAXONOMY_RELEASE).toContain("world-plants-hassler");
    expect(PHALAENOPSIS_FRAME.stoppingRule).toBeTruthy();
    expect(PHALAENOPSIS_FRAME.inclusionCriteria.length).toBeGreaterThan(0);
    // Every fixture claim is contract-valid.
    for (const claim of journey.claims) expect(validateClaim(claim)).toHaveLength(0);
  });

  it("every fixture anchor is honestly labelled as a fixture, not a live source", () => {
    const { anchors } = buildPhalaenopsisFixture();
    for (const anc of anchors) {
      expect(anc.attribution).toMatch(/fixture/i);
      // Fixtures carry no content hash — nothing pretends to be hash-anchored evidence.
      expect(anc.contentHash).toBeNull();
    }
    // Substantive claims are sourced_assertion at draft review, never direct_observation.
    const { claims } = buildPhalaenopsisFixture();
    expect(claims.some((c) => c.kind === "direct_observation")).toBe(false);
    expect(claims.every((c) => c.review.state === "draft")).toBe(true);
  });

  it("preserves counterevidence and open conflict, does not net it away", async () => {
    const journey = await runPhalaenopsisJourney();
    expect(journey.uncertainty.conflicts.length).toBeGreaterThan(0);
    // The plasticity counter-claim contradicts the cool-elevation support.
    const conflict = journey.uncertainty.conflicts.find((c) => c.counterClaimId === "cl_counter_plasticity");
    expect(conflict).toBeTruthy();
  });

  it("records genuine gaps as missing claims and a visible empty comparison cell", async () => {
    const journey = await runPhalaenopsisJourney();
    expect(journey.uncertainty.gaps.length).toBeGreaterThanOrEqual(2);
    // The cool/night cell was intentionally left unpopulated → a visible gap.
    const coolNight = journey.artifact.comparison.cells.find(
      (c) => c.alternativeId === "alt_cool" && c.criterionId === "crit_nighttemp",
    )!;
    expect(coolNight.isGap).toBe(true);
  });

  it("produces a reproducible manifest: identical inputs, identical fingerprint", async () => {
    const a = await runPhalaenopsisJourney({ runId: "x", createdAt: "2026-01-01T00:00:00Z" });
    const b = await runPhalaenopsisJourney({ runId: "y", createdAt: "2026-12-31T23:59:59Z" });
    expect(a.manifest.inputFingerprint).toBe(b.manifest.inputFingerprint);
    expect(a.manifest.partial).toBe(false);
    expect(a.manifest.outputFingerprint).not.toBeNull();
  });

  it("produces a cited, draft decision artifact bound to the run", async () => {
    const journey = await runPhalaenopsisJourney();
    expect(journey.artifact.publicationStatus).toBe("draft_decision_ready");
    expect(journey.artifact.review.state).toBe("draft");
    expect(journey.artifact.citations.length).toBeGreaterThan(0);
    expect(journey.artifact.runId).toBe(journey.manifest.runId);
    // The conclusion is explicitly provisional and carries limitations.
    expect(journey.artifact.synthesis.limitations.length).toBeGreaterThan(0);
  });

  it("emits a proposal-only KG contribution from the interpretation claim", async () => {
    const journey = await runPhalaenopsisJourney();
    expect(journey.proposal.status).toBe("proposed");
    expect(journey.proposal.proposedNodeKind).toBe("interpretation");
    expect(journey.proposal.review.state).toBe("draft");
  });

  it("a provider failure yields a truthful, resumable partial — no fabricated answer", async () => {
    const journey = await runPhalaenopsisJourney({ failAtStage: "RETRIEVE" });
    expect(journey.runState.partial).toBe(true);
    expect(journey.runState.resumeFrom).toBe("RETRIEVE");
    // Downstream stages never ran.
    expect(journey.runState.stages.find((s) => s.stage === "SYNTHESIZE")!.status).toBe("pending");
    // The manifest is honest about being partial: no output fingerprint.
    expect(journey.manifest.partial).toBe(true);
    expect(journey.manifest.outputFingerprint).toBeNull();
    expect(journey.manifest.resumeFrom).toBe("RETRIEVE");
  });
});
