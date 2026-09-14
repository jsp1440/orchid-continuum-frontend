// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiRequest }));

import ScientificObservabilityAnomalyQueue from "./ScientificObservabilityAnomalyQueue";

const correlationId = "OC:EVENT:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function task(overrides: Record<string, unknown> = {}) {
  const eventId = "OC:EVENT:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  return {
    task_id: "review-1",
    orchestration_id: correlationId,
    review_type: "SCI_OBS_ANOMALY:PROTECTED_LOCALITY_EXPOSURE",
    risk_class: "CRITICAL",
    routing_outcome: "ROUTE_TO_VERIFICATION_WORKBENCH",
    required_capability: "scientific_review",
    batch_key: `sci-obs:${correlationId}:${eventId}:PROTECTED_LOCALITY_EXPOSURE`,
    display_policy: "SEALED_PARTNER",
    embargoed: true,
    state: "OPEN",
    metadata: {
      authoritative_state_mutated: false,
      sci_obs_anomaly: {
        code: "PROTECTED_LOCALITY_EXPOSURE",
        risk_class: "CRITICAL",
        correlation_id: correlationId,
        event_id: eventId,
        details: { exact_locality: "must never render", latitude: 19.4326 },
      },
    },
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("ScientificObservabilityAnomalyQueue", () => {
  it("renders the bounded producer contract and never locality details", async () => {
    apiRequest.mockResolvedValue({
      data: {
        tasks: [
          task(),
          task({ task_id: "duplicate-backend-row" }),
          task({
            task_id: "forged-authority",
            metadata: {
              authoritative_state_mutated: true,
              sci_obs_anomaly: {
                code: "PROTECTED_LOCALITY_EXPOSURE",
                risk_class: "CRITICAL",
                correlation_id: correlationId,
                event_id: "OC:EVENT:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              },
            },
          }),
        ],
      },
    });

    await act(async () => {
      root.render(
        <ScientificObservabilityAnomalyQueue correlationId={correlationId} />,
      );
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/mission-control/review/queue?limit=200",
    );
    expect(container.textContent).toMatch(/protected locality exposure/i);
    expect(container.textContent).toMatch(/critical risk/i);
    expect(container.textContent).toContain(correlationId);
    expect(container.textContent).toMatch(/details are sealed/i);
    expect(container.textContent).not.toContain("must never render");
    expect(container.textContent).not.toContain("19.4326");
    expect(container.querySelectorAll("li")).toHaveLength(1);
  });

  it("reports an unavailable queue as unknown rather than no anomalies", async () => {
    apiRequest.mockResolvedValue({ error: { message: "offline" } });
    await act(async () => {
      root.render(
        <ScientificObservabilityAnomalyQueue correlationId={correlationId} />,
      );
    });
    expect(container.textContent).toMatch(/not evidence that no anomalies exist/i);
  });
});
