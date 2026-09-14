import { describe, expect, it } from "vitest";

import { getScientificObservabilityCorrelationId } from "@/lib/scientificObservabilityCorrelation";

describe("getScientificObservabilityCorrelationId", () => {
  it("uses an explicit top-level observability correlation id", () => {
    expect(
      getScientificObservabilityCorrelationId({
        mission_id: "mission-123",
        observability_correlation_id: " trace-456 ",
      }),
    ).toBe("trace-456");
  });

  it("accepts the explicit nested scientific-observability contract", () => {
    expect(
      getScientificObservabilityCorrelationId({
        mission_id: "mission-123",
        scientific_observability: { correlation_id: "trace-789" },
      }),
    ).toBe("trace-789");
  });

  it("never substitutes mission_id for correlation_id", () => {
    expect(
      getScientificObservabilityCorrelationId({ mission_id: "mission-123" }),
    ).toBeNull();
  });

  it("fails closed for blank or malformed correlation fields", () => {
    expect(
      getScientificObservabilityCorrelationId({
        observability_correlation_id: "   ",
        scientific_observability: { correlation_id: 42 },
      }),
    ).toBeNull();
  });
});
