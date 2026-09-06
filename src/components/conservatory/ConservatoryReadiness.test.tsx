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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const readyReport: ConservatoryReadinessReport = {
  ready_for_collection_entry: true,
  storage_path: "/data/conservatory",
  checked_at: "2026-08-15T00:00:00Z",
  instruction: "Ready.",
  gates: [
    { name: "persistent_storage", passed: true, evidence: "Volume mounted." },
    { name: "restart_survival", passed: true, evidence: "Survived redeploy." },
  ],
};

const blockedReport: ConservatoryReadinessReport = {
  ready_for_collection_entry: false,
  storage_path: "/data/conservatory",
  checked_at: "2026-08-15T00:00:00Z",
  instruction: "Restart survival has not been verified yet.",
  gates: [
    { name: "persistent_storage", passed: true, evidence: "Volume mounted." },
    { name: "restart_survival", passed: false, evidence: "No verified restart evidence.", blocking_reason: "Deploy and confirm data survives a restart." },
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
    root.render(<MemoryRouter><ConservatoryReadinessBanner /></MemoryRouter>);
  });
}

describe("ConservatoryReadinessBanner", () => {
  it("shows a checking state before the readiness fetch resolves", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderBanner();
    expect(container.textContent).toContain("Checking deployment…");
  });

  it("renders a ready, green state with every gate marked Verified when the backend reports ready", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => readyReport })));
    renderBanner();
    await flush();
    expect(container.textContent).toContain("Ready for three test plants");
    expect(container.querySelector("section")?.className).toContain("border-emerald-500/40");
    expect(container.textContent).toContain("persistent storage");
    expect(container.querySelectorAll("span")[0]?.textContent).toBe("Verified");
    expect(container.textContent).not.toContain("Volume mounted.");
    expect(container.textContent).not.toContain("Survived redeploy.");
  });

  it("renders a blocked, amber state without exposing operator-only blocking detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => blockedReport })));
    renderBanner();
    await flush();
    expect(container.textContent).toContain("Collection entry remains blocked");
    expect(container.querySelector("section")?.className).toContain("border-amber-500/40");
    expect(container.textContent).toContain("This gate has not been verified");
    expect(container.textContent).not.toContain("Deploy and confirm data survives a restart.");
    expect(container.textContent).not.toContain("No verified restart evidence.");
  });

  it("fails closed on a failed check, without leaking deployment internals", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
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
    const button = Array.from(container.querySelectorAll("button")).find((el) => el.textContent?.includes("Check again")) as HTMLButtonElement;
    act(() => button.click());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("ConservatoryReadinessPage", () => {
  it("lists every gate with bounded public readiness text when blocked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => blockedReport })));
    act(() => {
      root.render(<MemoryRouter><ConservatoryReadinessPage /></MemoryRouter>);
    });
    await flush();
    expect(container.textContent).toContain("Not ready for real collection entry");
    expect(container.textContent).toContain("restart survival");
    expect(container.textContent).toContain("Collection entry remains blocked until the deployed service reports it ready.");
    expect(container.textContent).not.toContain("Required: Deploy and confirm data survives a restart.");
    expect(container.textContent).not.toContain("No verified restart evidence.");
    expect(container.textContent).not.toContain("/data/conservatory");
  });
});
