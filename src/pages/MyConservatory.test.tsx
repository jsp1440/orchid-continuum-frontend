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
const { default: MyConservatory } = await import("@/pages/MyConservatory");

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const readyReport = {
  ready_for_collection_entry: true,
  storage_path: "/data/conservatory",
  checked_at: "2026-08-15T00:00:00Z",
  instruction: "Ready.",
  gates: [{ name: "restart_survival", passed: true, evidence: "Survived redeploy." }],
};

const blockedReport = {
  ready_for_collection_entry: false,
  storage_path: "/data/conservatory",
  checked_at: "2026-08-15T00:00:00Z",
  instruction: "Restart survival has not been verified yet.",
  gates: [
    {
      name: "restart_survival",
      passed: false,
      evidence: "No verified restart evidence.",
      blocking_reason: "Deploy and confirm data survives a restart.",
    },
  ],
};

const plants = [
  {
    id: "p1",
    accession_number: "OC-0001",
    display_name: "Phalaenopsis amabilis",
    accepted_scientific_name: "Phalaenopsis amabilis",
    location: "Greenhouse bench 2",
    notes: null,
    qr_identifier: "qr-p1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "p2",
    accession_number: "OC-0002",
    display_name: "Cattleya labiata",
    accepted_scientific_name: "Cattleya labiata",
    location: null,
    notes: null,
    qr_identifier: "qr-p2",
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
];

function routedFetch(overrides: { readiness?: unknown; plantsList?: unknown } = {}) {
  const readiness = overrides.readiness ?? readyReport;
  const plantsList = overrides.plantsList ?? { plants };
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/conservatory/readiness")) {
      return { ok: true, json: async () => readiness } as Response;
    }
    if (url.includes("/api/conservatory/plants") && !url.match(/plants\/[^/?]+/)) {
      return { ok: true, json: async () => plantsList } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
}

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
    await Promise.resolve();
  });
}

function renderAt(path: string, fetchMock: ReturnType<typeof routedFetch>) {
  vi.stubGlobal("fetch", fetchMock);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <MyConservatory />
      </MemoryRouter>,
    );
  });
}

describe("MyConservatory routing", () => {
  it("renders the Dashboard with real plant counts at /conservatory", async () => {
    renderAt("/conservatory", routedFetch());
    await flush();
    expect(container.textContent).toContain("Your living collection");
    expect(container.textContent).toContain("Phalaenopsis amabilis");
    // Plants: 2, QR ready: 2, Locations recorded: 1
    const counts = Array.from(container.querySelectorAll("strong")).map((el) => el.textContent);
    expect(counts).toContain("2");
    expect(counts).toContain("1");
  });

  it("renders the plant list and falls back to Dashboard for an unknown path", async () => {
    renderAt("/conservatory/plants", routedFetch());
    await flush();
    expect(container.textContent).toContain("My Plants");
    expect(container.textContent).toContain("2 results");
  });
});

describe("MyConservatory plant search", () => {
  it("filters plants by accession number, name, or location as the query changes", async () => {
    renderAt("/conservatory/plants", routedFetch());
    await flush();

    const input = container.querySelector('input[aria-label="Search plants"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      nativeSetter.call(input, "Cattleya");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();

    expect(container.textContent).toContain("1 result");
    expect(container.textContent).toContain("Cattleya labiata");
    expect(container.textContent).not.toContain("Phalaenopsis amabilis");
  });
});

describe("MyConservatory Add Plant — readiness gate", () => {
  it("blocks the form entirely and shows the locked message when the backend is not ready", async () => {
    renderAt("/conservatory/plants/new", routedFetch({ readiness: blockedReport }));
    await flush();

    expect(container.textContent).toContain("Plant entry is locked");
    expect(container.textContent).toContain("Deploy and confirm data survives a restart.");
    // The safety-critical assertion: no submittable form exists while blocked.
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('input[required]')).toBeNull();
  });

  it("renders the add-plant form once readiness passes, and blocks submission client-side if ready flips false first", async () => {
    renderAt("/conservatory/plants/new", routedFetch({ readiness: readyReport }));
    await flush();

    expect(container.textContent).toContain("Add Test Plant");
    const form = container.querySelector("form");
    expect(form).toBeTruthy();
    const submitButton = form!.querySelector("button") as HTMLButtonElement;
    expect(submitButton.textContent).toContain("Save and assign accession");
  });

  it("submits a POST to /api/conservatory/plants and navigates to the new plant when ready", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/conservatory/readiness")) {
        return { ok: true, json: async () => readyReport } as Response;
      }
      if (url.includes("/api/conservatory/plants") && init?.method === "POST") {
        return { ok: true, json: async () => ({ ...plants[0], id: "new-plant-id" }) } as Response;
      }
      return { ok: true, json: async () => ({ plants: [] }) } as Response;
    });
    renderAt("/conservatory/plants/new", fetchMock);
    await flush();

    const nameInput = container.querySelector("form input") as HTMLInputElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      nativeSetter.call(nameInput, "Vanda coerulea");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = container.querySelector("form") as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();

    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeTruthy();
    expect(String(postCall![0])).toContain("/api/conservatory/plants");
    expect(JSON.parse((postCall![1] as RequestInit).body as string).display_name).toBe("Vanda coerulea");
  });
});

/**
 * Scanning a tag, and the dossier it lands on.
 *
 * The dossier bug these tests pin was real and silent: this route is mounted
 * under a `/conservatory/*` splat, which declares no `:plantId`, so useParams
 * returned undefined and every plant page requested
 * `/api/conservatory/plants/` — the list endpoint, whose shape is not a plant.
 * No test caught it because none asserted which URL was requested.
 */

const scannedPlant = {
  id: "p1",
  accession_number: "OC-2026-0001",
  display_name: "Phalaenopsis amabilis",
  accepted_scientific_name: "Phalaenopsis amabilis",
  location: "Greenhouse bench 2",
  notes: "Repotted in spring.",
  qr_identifier: "calyx:plant:p1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function trackingFetch(handler: (url: string) => { ok: boolean; status?: number; body: unknown }) {
  const seen: string[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("qr.svg")) return { ok: true, blob: async () => new Blob([""]) } as unknown as Response;
    const result = handler(url);
    return { ok: result.ok, status: result.status ?? (result.ok ? 200 : 404), json: async () => result.body } as Response;
  });
  return { mock, seen };
}

describe("MyConservatory plant dossier", () => {
  it("requests the plant named in the address, not the collection", async () => {
    // The regression. `/plants/` (no id) is the list endpoint and silently
    // renders a dossier from the wrong shape.
    const { mock, seen } = trackingFetch(() => ({ ok: true, body: scannedPlant }));
    renderAt("/conservatory/plants/p1", mock as unknown as ReturnType<typeof routedFetch>);
    await flush();

    const plantCalls = seen.filter((url) => /\/api\/conservatory\/plants\//.test(url) && !url.includes("qr.svg"));
    expect(plantCalls).toContain("https://calyx.example.test/api/conservatory/plants/p1");
    expect(plantCalls).not.toContain("https://calyx.example.test/api/conservatory/plants/");
    expect(container.textContent).toContain("Phalaenopsis amabilis");
    expect(container.textContent).toContain("OC-2026-0001");
  });
});

describe("MyConservatory scan landing", () => {
  it("resolves the scanned identity and shows that plant", async () => {
    const { mock, seen } = trackingFetch(() => ({ ok: true, body: scannedPlant }));
    renderAt("/conservatory/scan/calyx:plant:p1", mock as unknown as ReturnType<typeof routedFetch>);
    await flush();

    expect(seen.some((url) => url.includes("/api/conservatory/resolve/"))).toBe(true);
    expect(container.textContent).toContain("Phalaenopsis amabilis");
    expect(container.querySelector('[data-testid="scan-arrival"]')).not.toBeNull();
  });

  it("sends the whole remaining path as the identity when the tag is a URL", async () => {
    // A scanned tag can itself be a URL. Truncating at the first slash would
    // resolve some prefix of the identity, or nothing at all.
    const { mock, seen } = trackingFetch(() => ({ ok: true, body: scannedPlant }));
    renderAt("/conservatory/scan/https://continuum.example/conservatory/scan/p1", mock as unknown as ReturnType<typeof routedFetch>);
    await flush();

    const resolveCall = seen.find((url) => url.includes("/api/conservatory/resolve/"));
    expect(resolveCall).toBeDefined();
    expect(decodeURIComponent(resolveCall as string)).toContain("continuum.example/conservatory/scan/p1");
  });

  it("says a tag is unrecognised without claiming the plant is gone", async () => {
    const { mock } = trackingFetch(() => ({ ok: false, status: 404, body: { detail: { code: "ACCESSION_NOT_RESOLVED" } } }));
    renderAt("/conservatory/scan/calyx:plant:unknown", mock as unknown as ReturnType<typeof routedFetch>);
    await flush();

    const panel = container.querySelector('[data-testid="scan-unresolved"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toMatch(/not matched approximately/i);
    // The recovery path a grower with a damaged tag actually has.
    expect(panel?.textContent).toMatch(/accession number is still legible/i);
  });

  it("keeps an unreachable service distinct from an unrecognised tag", async () => {
    // Rendering an outage as "no such plant" tells a grower their record is
    // missing when the service is merely down.
    const { mock } = trackingFetch(() => ({ ok: false, status: 503, body: { detail: "backend unavailable" } }));
    renderAt("/conservatory/scan/calyx:plant:p1", mock as unknown as ReturnType<typeof routedFetch>);
    await flush();

    expect(container.querySelector('[data-testid="scan-unresolved"]')).toBeNull();
    expect(container.textContent).toMatch(/could not be loaded|backend unavailable/i);
  });

  it("does not render a dossier before the identity resolves", async () => {
    const { mock } = trackingFetch(() => ({ ok: false, status: 404, body: { detail: { code: "ACCESSION_NOT_RESOLVED" } } }));
    renderAt("/conservatory/scan/calyx:plant:unknown", mock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    expect(container.querySelector('[data-testid="scan-arrival"]')).toBeNull();
  });
});
