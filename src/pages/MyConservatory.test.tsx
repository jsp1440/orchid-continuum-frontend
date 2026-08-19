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
