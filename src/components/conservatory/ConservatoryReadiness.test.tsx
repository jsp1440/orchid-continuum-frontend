// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ session: null })),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: mocks.useAuth,
}));

vi.stubEnv("VITE_CALYX_API_URL", "https://calyx.example.test");
const {
  ConservatoryReadinessBanner,
  ConservatoryReadinessPage,
} = await import("@/components/conservatory/ConservatoryReadiness");
type ConservatoryReadinessReport =
  import("@/components/conservatory/ConservatoryReadiness").ConservatoryReadinessReport;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const readyReport: ConservatoryReadinessReport = {
  ready_for_collection_entry: true,
  storage_path: "/data/conservatory",
  checked_at: "2026-08-15T00:00:00Z",
  instruction: "Operator: verify VITE_CALYX_API_URL before release.",
  gates: [
    { name: "persistent_storage", passed: true, evidence: "Volume mounted at /data/conservatory." },
    { name: "restart_survival", passed: true, evidence: "Probe https://internal.example.test/restart succeeded." },
  ],
};

const blockedReport: ConservatoryReadinessReport = {
  ready_for_collection_entry: false,
  storage_path: "/data/conservatory",
  checked_at: "2026-08-15T00:00:00Z",
  instruction: "Set CONSERVATORY_VOLUME_PATH and redeploy.",
  gates: [
    { name: "persistent_storage", passed: true, evidence: "Volume mounted at /data/conservatory." },
    {
      name: "restart_survival",
      passed: false,
      evidence: "Probe /api/internal/restart-check returned 503.",
      blocking_reason: "Deploy and confirm data survives a restart using CONSERVATORY_VOLUME_PATH.",
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.useAuth.mockReturnValue({ session: null });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderBanner() {
  act(() => {
    root.render(
      <MemoryRouter>
        <ConservatoryReadinessBanner />
      </MemoryRouter>,
    );
  });
}

describe("ConservatoryReadinessBanner", () => {
  it("shows a checking state before the readiness fetch resolves", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderBanner();
    expect(container.textContent).toContain("Checking deployment…");
  });

  it("renders a ready state without exposing backend evidence or instructions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => readyReport })),
    );
    renderBanner();
    await flush();

    expect(container.textContent).toContain("Ready for three test plants");
    expect(container.textContent).toContain("Required readiness checks are verified");
    const section = container.querySelector("section");
    expect(section?.className).toContain("border-emerald-500/40");
    expect(container.textContent).toContain("persistent storage");
    expect(container.querySelectorAll("span")[0]?.textContent).toBe("Verified");
    expect(container.textContent).not.toContain("/data/conservatory");
    expect(container.textContent).not.toContain("internal.example.test");
    expect(container.textContent).not.toContain("VITE_CALYX_API_URL");
  });

  it("renders a blocked state using bounded public copy only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => blockedReport })),
    );
    renderBanner();
    await flush();

    expect(container.textContent).toContain("Collection entry remains blocked");
    expect(container.textContent).toContain("One or more readiness checks are not yet verified");
    const section = container.querySelector("section");
    expect(section?.className).toContain("border-amber-500/40");
    expect(container.textContent).not.toContain("CONSERVATORY_VOLUME_PATH");
    expect(container.textContent).not.toContain("/api/internal/restart-check");
    expect(container.textContent).not.toContain("503");
    expect(container.textContent).not.toContain("Deploy and confirm data survives a restart");
  });

  it("fails closed on a failed check, without leaking deployment internals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 })),
    );
    renderBanner();
    await flush();

    expect(container.textContent).toContain("Collection entry remains blocked");
    expect(container.textContent).toContain("Collection entry remains safely blocked");
    expect(container.textContent).not.toContain("Ready for three test plants");
    expect(container.textContent).not.toContain("503");
    expect(container.textContent).not.toContain("VITE_CALYX_API_URL");
  });

  it("re-fetches when Check again is clicked", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => readyReport }));
    vi.stubGlobal("fetch", fetchMock);
    renderBanner();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const button = Array.from(container.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Check again"),
    ) as HTMLButtonElement;
    act(() => {
      button.click();
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("ConservatoryReadinessPage", () => {
  it("lists gate status without exposing raw evidence, paths, URLs, or operator instructions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => blockedReport })),
    );
    act(() => {
      root.render(
        <MemoryRouter>
          <ConservatoryReadinessPage />
        </MemoryRouter>,
      );
    });
    await flush();

    expect(container.textContent).toContain("Not ready for real collection entry");
    expect(container.textContent).toContain("restart survival");
    expect(container.textContent).toContain("This readiness check is not yet verified");
    expect(container.textContent).not.toContain("/data/conservatory");
    expect(container.textContent).not.toContain("/api/internal/restart-check");
    expect(container.textContent).not.toContain("CONSERVATORY_VOLUME_PATH");
    expect(container.textContent).not.toContain("503");
    expect(container.textContent).not.toContain("Deploy and confirm data survives a restart");
  });
});
