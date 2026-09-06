import { describe, expect, it } from "vitest";
import { publicGateDetail, type ConservatoryGate } from "./ConservatoryReadiness";

describe("publicGateDetail", () => {
  it("does not echo operator-only backend evidence for a blocked gate", () => {
    const gate: ConservatoryGate = {
      name: "persistent_storage",
      passed: false,
      evidence: "/var/lib/orchid/private/conservatory.sqlite",
      blocking_reason: "VITE_CALYX_API_URL or storage mount is not configured",
    };

    const detail = publicGateDetail(gate);
    expect(detail).toContain("has not been verified");
    expect(detail).not.toContain(gate.evidence);
    expect(detail).not.toContain(gate.blocking_reason);
    expect(detail).not.toContain("VITE_CALYX_API_URL");
  });

  it("reports verified state without reproducing backend evidence", () => {
    const gate: ConservatoryGate = {
      name: "restart_survival",
      passed: true,
      evidence: "internal restart probe id=abc123",
    };

    const detail = publicGateDetail(gate);
    expect(detail).toContain("Verified by the deployed Conservatory readiness service");
    expect(detail).not.toContain(gate.evidence);
  });
});
