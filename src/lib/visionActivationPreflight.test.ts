import { afterEach, describe, expect, it, vi } from "vitest";

import { getVisionActivationPreflight, visionBlockerLabel } from "./visionActivationPreflight";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Vision activation preflight client", () => {
  it("reads the owner-gated preflight without requesting a mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        schema_version: "vision-activation-preflight/v1",
        read_only: true,
        mutations_performed: false,
        database_url_configured: true,
        connectivity: true,
        schema_ready: true,
        schema_problem: null,
        inspection_error: null,
        durable_requested: false,
        persistence_activation_ready: true,
        persistence_active: false,
        provider_status: "PROVIDER_NOT_CONFIGURED",
        provider_ready: false,
        live_inference_enabled: false,
        live_inference_activation_ready: false,
        blockers: [
          "VISION_DURABLE_PERSISTENCE_DISABLED",
          "VISION_PROVIDER_NOT_CONFIGURED",
          "VISION_LIVE_INFERENCE_DISABLED",
        ],
        activation_order: ["activate schema", "enable durable persistence"],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getVisionActivationPreflight();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/vision-lexicon/activation-preflight");
    expect(init.method).toBeUndefined();
    expect(init.credentials).toBe("include");
    expect(result.read_only).toBe(true);
    expect(result.mutations_performed).toBe(false);
    expect(result.persistence_activation_ready).toBe(true);
    expect(result.persistence_active).toBe(false);
    expect(result.blockers).toContain("VISION_PROVIDER_NOT_CONFIGURED");
  });

  it("turns blocker codes into readable labels without changing their meaning", () => {
    expect(visionBlockerLabel("VISION_SCHEMA_INSPECTION_FAILED")).toBe("Schema inspection failed");
    expect(visionBlockerLabel("VISION_DURABLE_PERSISTENCE_DISABLED")).toBe("Durable persistence disabled");
  });
});
