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

/**
 * Cultivation context on the dossier.
 *
 * The chain this completes: scan a tag, resolve the plant, see where it is,
 * where it has been, and what is known about the conditions there.
 *
 * The property worth defending is that a number never loses its origin. A
 * hand-entered temperature and an instrument reading look identical once the
 * origin is dropped, and a grower deciding whether to move a plant is entitled
 * to know which one they are acting on.
 */

const contextPlant = {
  id: "p1",
  accession_number: "OC-2026-0001",
  display_name: "Cattleya skinneri",
  accepted_scientific_name: "Cattleya skinneri",
  location: "Greenhouse bench 2",
  notes: null,
  qr_identifier: "calyx:plant:p1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function contextFetch(overrides: {
  placement?: unknown;
  locations?: unknown;
  environment?: unknown;
  placementStatus?: number;
} = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("qr.svg")) return { ok: true, blob: async () => new Blob([""]) } as unknown as Response;
    if (url.includes("/placement")) {
      const status = overrides.placementStatus ?? 200;
      return {
        ok: status === 200,
        status,
        json: async () => overrides.placement ?? { plant_id: "p1", current: null, history: [] },
      } as Response;
    }
    if (url.includes("/environment")) {
      return { ok: true, status: 200, json: async () => overrides.environment ?? { location_id: "loc-1", variables: {} } } as Response;
    }
    if (url.includes("/locations")) {
      return { ok: true, status: 200, json: async () => overrides.locations ?? { locations: [] } } as Response;
    }
    return { ok: true, status: 200, json: async () => contextPlant } as Response;
  });
}

const twoLocations = {
  locations: [
    { id: "loc-warm", name: "Warm bench", kind: "greenhouse_bench" },
    { id: "loc-cool", name: "Cool bench", kind: "greenhouse_bench" },
  ],
};

describe("MyConservatory cultivation context", () => {
  it("shows where the plant is and where it has been", async () => {
    const fetchMock = contextFetch({
      locations: twoLocations,
      placement: {
        plant_id: "p1",
        current: { id: "e2", location_id: "loc-cool", reason: "move", note: "Not flowering", recorded_at: "2026-02-01T00:00:00Z" },
        history: [
          { id: "e1", location_id: "loc-warm", reason: "initial", note: null, recorded_at: "2026-01-01T00:00:00Z" },
          { id: "e2", location_id: "loc-cool", reason: "move", note: "Not flowering", recorded_at: "2026-02-01T00:00:00Z" },
        ],
      },
    });
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="current-location"]')?.textContent).toContain("Cool bench");
    const history = container.querySelectorAll('[data-testid="placement-history"] > li');
    expect(history).toHaveLength(2);
    // The earlier bench survives the move.
    expect(history[0].textContent).toContain("Warm bench");
  });

  it("shows a correction as a corrected record, never as a move", async () => {
    // A plant wrongly entered on the wrong bench never went anywhere.
    const fetchMock = contextFetch({
      locations: twoLocations,
      placement: {
        plant_id: "p1",
        current: { id: "e2", location_id: "loc-cool", reason: "correction", note: null, recorded_at: "2026-02-01T00:00:00Z" },
        history: [
          { id: "e1", location_id: "loc-warm", reason: "initial", note: null, recorded_at: "2026-01-01T00:00:00Z" },
          { id: "e2", location_id: "loc-cool", reason: "correction", note: null, recorded_at: "2026-02-01T00:00:00Z" },
        ],
      },
    });
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="placement-reason-correction"]')?.textContent).toMatch(/record corrected/i);
    expect(container.querySelector('[data-testid="placement-history"]')?.textContent).not.toMatch(/\bmove\b/);
  });

  it("keeps every environmental number attached to how it was obtained", async () => {
    const fetchMock = contextFetch({
      locations: twoLocations,
      placement: {
        plant_id: "p1",
        current: { id: "e1", location_id: "loc-cool", reason: "initial", note: null, recorded_at: "2026-01-01T00:00:00Z" },
        history: [{ id: "e1", location_id: "loc-cool", reason: "initial", note: null, recorded_at: "2026-01-01T00:00:00Z" }],
      },
      environment: {
        location_id: "loc-cool",
        variables: {
          temperature_c: { unit: "degrees Celsius", known: true, value: 12.5, origin: "measured", instrument: "Probe A", is_summary: true, summary_kind: "min" },
          relative_humidity_pct: { unit: "percent", known: true, value: 60, origin: "manual", instrument: null },
          light_ppfd_umol_m2_s: { unit: "micromole per square metre per second", known: false, origin: "unknown", reason: "NO_READING_RECORDED" },
        },
      },
    });
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="env-origin-temperature_c"]')?.textContent).toMatch(/measured by an instrument/i);
    expect(container.querySelector('[data-testid="env-origin-temperature_c"]')?.textContent).toContain("Probe A");
    // A hand-entered number must not read as an instrument reading.
    expect(container.querySelector('[data-testid="env-origin-relative_humidity_pct"]')?.textContent).toMatch(/entered by hand/i);
    expect(container.querySelector('[data-testid="env-origin-relative_humidity_pct"]')?.textContent).not.toMatch(/instrument/i);
  });

  it("says a nightly minimum is a summary, not a spot reading", async () => {
    const fetchMock = contextFetch({
      locations: twoLocations,
      placement: {
        plant_id: "p1",
        current: { id: "e1", location_id: "loc-cool", reason: "initial", note: null, recorded_at: "2026-01-01T00:00:00Z" },
        history: [{ id: "e1", location_id: "loc-cool", reason: "initial", note: null, recorded_at: "2026-01-01T00:00:00Z" }],
      },
      environment: {
        location_id: "loc-cool",
        variables: {
          temperature_c: { unit: "degrees Celsius", known: true, value: 12.5, origin: "measured", instrument: "Probe A", is_summary: true, summary_kind: "min" },
        },
      },
    });
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();
    expect(container.querySelector('[data-testid="env-origin-temperature_c"]')?.textContent).toMatch(/over a window, not a spot reading/i);
  });

  it("renders an unrecorded variable as unrecorded, never as zero or blank", async () => {
    // An empty slot reads as "nothing to consider here", which is exactly
    // wrong when the truth is that no sensor exists.
    const fetchMock = contextFetch({
      locations: twoLocations,
      placement: {
        plant_id: "p1",
        current: { id: "e1", location_id: "loc-cool", reason: "initial", note: null, recorded_at: "2026-01-01T00:00:00Z" },
        history: [{ id: "e1", location_id: "loc-cool", reason: "initial", note: null, recorded_at: "2026-01-01T00:00:00Z" }],
      },
      environment: {
        location_id: "loc-cool",
        variables: {
          relative_humidity_pct: { unit: "percent", known: false, origin: "unknown", reason: "NO_READING_RECORDED" },
        },
      },
    });
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();

    const cell = container.querySelector('[data-testid="env-relative_humidity_pct"]');
    expect(cell?.getAttribute("data-known")).toBe("false");
    // Assert on the value cell itself. Checking the whole card is too weak:
    // its text concatenates to "...pct0 percent...", where a word-boundary
    // check for a stray zero never fires.
    const value = cell?.querySelector("dd")?.textContent ?? "";
    expect(value).toMatch(/not recorded/i);
    expect(value).not.toMatch(/[0-9]/);
  });

  it("states that collection records are not scientific evidence", async () => {
    const fetchMock = contextFetch({
      locations: twoLocations,
      placement: {
        plant_id: "p1",
        current: { id: "e1", location_id: "loc-cool", reason: "initial", note: null, recorded_at: "2026-01-01T00:00:00Z" },
        history: [{ id: "e1", location_id: "loc-cool", reason: "initial", note: null, recorded_at: "2026-01-01T00:00:00Z" }],
      },
    });
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();
    expect(container.querySelector('[data-testid="context-provenance"]')?.textContent).toMatch(/not scientific evidence/i);
  });

  it("keeps a backend without these routes distinct from a plant never placed", async () => {
    // Rendering an absent contract as "no placement recorded" would tell a
    // grower their record is missing when the service simply lacks the route.
    const fetchMock = contextFetch({ placementStatus: 404 });
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="context-unavailable"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="no-current-location"]')).toBeNull();
  });

  it("keeps a malformed placement response distinct from a plant never placed", async () => {
    // A 200 whose body lacks `history` is a contract the service did not
    // honour. Rendering it as an empty history would claim "no moves have been
    // recorded" — a statement about the plant, from a broken response.
    const fetchMock = contextFetch({ placement: { plant_id: "p1" } });
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="context-unavailable"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="placement-history"]')).toBeNull();
    expect(container.querySelector('[data-testid="no-current-location"]')).toBeNull();
  });

  it("does not ask for conditions when the plant is in no location", async () => {
    // Asking for the conditions of nowhere is not a meaningful question.
    const fetchMock = contextFetch({ placement: { plant_id: "p1", current: null, history: [] } });
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/environment"))).toBe(false);
    expect(container.querySelector('[data-testid="no-current-location"]')).not.toBeNull();
  });
});

/**
 * Recording where a plant went.
 *
 * The property under test is that the form refuses to choose the reason for
 * the grower. A move and a correction both change where the record says the
 * plant is, and only one of them means the plant physically went somewhere.
 * Defaulting to "move" would manufacture husbandry every time somebody fixed a
 * typo, and that invented history would later read as a cause of whatever the
 * plant did next.
 */
describe("MyConservatory recording a placement", () => {
  const placedContext = {
    locations: twoLocations,
    placement: {
      plant_id: "p1",
      current: { id: "e1", location_id: "loc-warm", reason: "initial", note: null, recorded_at: "2026-01-01T00:00:00Z" },
      history: [{ id: "e1", location_id: "loc-warm", reason: "initial", note: null, recorded_at: "2026-01-01T00:00:00Z" }],
    },
  };

  async function open(overrides = placedContext) {
    const fetchMock = contextFetch(overrides);
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();
    return fetchMock;
  }

  function set(testid: string, value: string) {
    const field = container.querySelector(`[data-testid="${testid}"]`) as HTMLSelectElement | HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("will not submit until the grower says what happened", async () => {
    await open();
    const submit = container.querySelector('[data-testid="placement-submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    set("placement-location", "loc-cool");
    expect((container.querySelector('[data-testid="placement-submit"]') as HTMLButtonElement).disabled).toBe(true);

    set("placement-reason-select", "move");
    expect((container.querySelector('[data-testid="placement-submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not preselect a reason", async () => {
    // Choosing for the grower is how a typo becomes husbandry history.
    await open();
    const select = container.querySelector('[data-testid="placement-reason-select"]') as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("posts the reason the grower chose", async () => {
    const fetchMock = await open();
    set("placement-location", "loc-cool");
    set("placement-reason-select", "correction");
    const form = container.querySelector('[data-testid="record-placement"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    const post = fetchMock.mock.calls.find(
      (call) => String(call[0]).includes("/placement") && (call[1] as RequestInit)?.method === "POST",
    );
    expect(post).toBeDefined();
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
      location_id: "loc-cool",
      reason: "correction",
    });
  });

  it("offers a first placement only when the plant has none", async () => {
    await open({
      locations: twoLocations,
      placement: { plant_id: "p1", current: null, history: [] },
    });
    const options = [...container.querySelectorAll('[data-testid="placement-reason-select"] option')].map((o) => o.getAttribute("value"));
    expect(options).toContain("initial");

    act(() => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await open();
    const laterOptions = [...container.querySelectorAll('[data-testid="placement-reason-select"] option')].map((o) => o.getAttribute("value"));
    // Already placed: a "first placement" would contradict the history.
    expect(laterOptions).not.toContain("initial");
  });

  it("does not offer a retired location", async () => {
    // The backend refuses it, so offering it only produces a failure the
    // grower cannot act on.
    await open({
      locations: { locations: [
        { id: "loc-warm", name: "Warm bench", kind: "greenhouse_bench" },
        { id: "loc-gone", name: "Dismantled bench", kind: "greenhouse_bench", retired_at: "2026-05-01T00:00:00Z" },
      ] },
      placement: placedContext.placement,
    });
    const options = [...container.querySelectorAll('[data-testid="placement-location"] option')].map((o) => o.getAttribute("value"));
    expect(options).toContain("loc-warm");
    expect(options).not.toContain("loc-gone");
  });

  it("says a move is husbandry and a correction is not", async () => {
    await open();
    const guidance = container.querySelector('[data-testid="placement-guidance"]')?.textContent ?? "";
    expect(guidance).toMatch(/move becomes part of this plant/i);
    expect(guidance).toMatch(/the plant never went anywhere/i);
  });

  it("reports a rejected placement instead of pretending it saved", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("qr.svg")) return { ok: true, blob: async () => new Blob([""]) } as unknown as Response;
      if (url.includes("/placement") && init?.method === "POST") {
        return { ok: false, status: 409, json: async () => ({ detail: { code: "LOCATION_RETIRED" } }) } as Response;
      }
      if (url.includes("/placement")) return { ok: true, status: 200, json: async () => placedContext.placement } as Response;
      if (url.includes("/environment")) return { ok: true, status: 200, json: async () => ({ location_id: "loc-warm", variables: {} }) } as Response;
      if (url.includes("/locations")) return { ok: true, status: 200, json: async () => twoLocations } as Response;
      return { ok: true, status: 200, json: async () => contextPlant } as Response;
    });
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();

    set("placement-location", "loc-cool");
    set("placement-reason-select", "move");
    const form = container.querySelector('[data-testid="record-placement"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    expect(container.querySelector('[data-testid="placement-error"]')).not.toBeNull();
    // The history must not gain an entry that the backend refused.
    expect(container.querySelectorAll('[data-testid="placement-history"] > li')).toHaveLength(1);
  });

  it("says so when there is nowhere to put the plant", async () => {
    await open({ locations: { locations: [] }, placement: placedContext.placement });
    expect(container.querySelector('[data-testid="no-locations"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="record-placement"]')).toBeNull();
  });
});

/**
 * Creating growing locations.
 *
 * The gap this closes: a collection with no locations could never place its
 * first plant. The property worth defending is that conditions typed here are
 * asked for, and stored, as the grower's description — a field later read as a
 * measurement gives every comparison built on it a precision nobody took.
 */
describe("MyConservatory growing locations", () => {
  function locationsFetch(existing: unknown[] = [], onPost?: { ok: boolean; status?: number; body: unknown }) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/conservatory/locations") && init?.method === "POST") {
        const result = onPost ?? { ok: true, status: 201, body: { id: "new", name: "Cool bench", kind: "greenhouse_bench" } };
        return { ok: result.ok, status: result.status ?? 201, json: async () => result.body } as Response;
      }
      if (url.includes("/api/conservatory/locations")) {
        return { ok: true, status: 200, json: async () => ({ locations: existing }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  }

  function set(testid: string, value: string) {
    const field = container.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement | HTMLSelectElement;
    act(() => {
      const proto = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    });
  }

  it("tells a grower with no locations to create one before placing a plant", async () => {
    renderAt("/conservatory/locations", locationsFetch() as unknown as ReturnType<typeof routedFetch>);
    await flush();
    expect(container.querySelector('[data-testid="no-locations-yet"]')).not.toBeNull();
  });

  it("will not create a location without a name and a kind", async () => {
    renderAt("/conservatory/locations", locationsFetch() as unknown as ReturnType<typeof routedFetch>);
    await flush();
    const submit = () => container.querySelector('[data-testid="location-submit"]') as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    set("location-name", "Cool bench");
    expect(submit().disabled).toBe(true);
    set("location-kind", "greenhouse_bench");
    expect(submit().disabled).toBe(false);
  });

  it("posts the name, kind and description the grower entered", async () => {
    const fetchMock = locationsFetch();
    renderAt("/conservatory/locations", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    set("location-name", "Cool bench");
    set("location-kind", "greenhouse_bench");
    set("location-described", "Bright shade, cool nights");
    const form = container.querySelector('[data-testid="create-location"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === "POST");
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
      name: "Cool bench",
      kind: "greenhouse_bench",
      described_conditions: "Bright shade, cool nights",
    });
  });

  it("says the description is not a measurement", async () => {
    // The same field read later as a measurement would give every comparison
    // built on it a precision nobody took.
    renderAt("/conservatory/locations", locationsFetch() as unknown as ReturnType<typeof routedFetch>);
    await flush();
    const disclaimer = container.querySelector('[data-testid="described-disclaimer"]')?.textContent ?? "";
    expect(disclaimer).toMatch(/not as a measurement/i);
    expect(disclaimer).toMatch(/instrument readings are entered separately/i);
  });

  it("offers a bench as its own kind of place", async () => {
    // Two benches in one greenhouse can differ more than two greenhouses do.
    renderAt("/conservatory/locations", locationsFetch() as unknown as ReturnType<typeof routedFetch>);
    await flush();
    const kinds = [...container.querySelectorAll('[data-testid="location-kind"] option')].map((o) => o.getAttribute("value"));
    expect(kinds).toEqual(expect.arrayContaining(["greenhouse_bench", "lath_house", "shelf", "zone", "custom"]));
  });

  it("reports a refused name instead of showing it as created", async () => {
    const fetchMock = locationsFetch([], { ok: false, status: 409, body: { detail: { code: "LOCATION_NAME_ALREADY_USED" } } });
    renderAt("/conservatory/locations", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    set("location-name", "Cool bench");
    set("location-kind", "greenhouse_bench");
    const form = container.querySelector('[data-testid="create-location"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    expect(container.querySelector('[data-testid="location-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="location-list"]')).toBeNull();
  });

  it("keeps retired locations visible", async () => {
    // Placement history points at these; hiding them would make a plant's
    // past read as though it happened nowhere.
    renderAt("/conservatory/locations", locationsFetch([
      { id: "a", name: "Live bench", kind: "greenhouse_bench" },
      { id: "b", name: "Dismantled bench", kind: "greenhouse_bench", retired_at: "2026-05-01T00:00:00Z" },
    ]) as unknown as ReturnType<typeof routedFetch>);
    await flush();

    expect(container.querySelector('[data-testid="location-list"]')?.textContent).toContain("Live bench");
    expect(container.querySelector('[data-testid="location-list"]')?.textContent).not.toContain("Dismantled bench");
    expect(container.querySelector('[data-testid="retired-locations"]')?.textContent).toContain("Dismantled bench");
  });
});

/**
 * The plant ledger on the dossier.
 *
 * Two properties carry the weight: the two clocks stay apart, and a correction
 * stays visible. A grower noticing on Sunday that a plant spiked last week is
 * making one claim about the plant and a weaker one about timing; showing only
 * the occurrence hides how late the record was made.
 */
describe("MyConservatory plant ledger", () => {
  const emptyTimeline = { plant_id: "p1", standing: [], corrected: [], event_count: 0, is_scientific_evidence: false };

  function ledgerFetch(timeline: unknown = emptyTimeline, onPost?: { ok: boolean; status?: number; body: unknown }) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("qr.svg")) return { ok: true, blob: async () => new Blob([""]) } as unknown as Response;
      if (url.includes("/events") && init?.method === "POST") {
        const result = onPost ?? { ok: true, status: 201, body: { id: "new", kind: "watered", occurred_at: "2026-08-20T00:00:00Z", recorded_at: "2026-08-20T00:00:00Z", recorder_kind: "grower", note: null, supersedes_id: null, superseded_by_id: null } };
        return { ok: result.ok, status: result.status ?? 201, json: async () => result.body } as Response;
      }
      if (url.includes("/events")) return { ok: true, status: 200, json: async () => timeline } as Response;
      if (url.includes("/placement")) return { ok: true, status: 200, json: async () => ({ plant_id: "p1", current: null, history: [] }) } as Response;
      if (url.includes("/locations")) return { ok: true, status: 200, json: async () => ({ locations: [] }) } as Response;
      return { ok: true, status: 200, json: async () => contextPlant } as Response;
    });
  }

  function set(testid: string, value: string) {
    const field = container.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement | HTMLSelectElement;
    act(() => {
      const proto = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    });
  }

  async function open(timeline: unknown = emptyTimeline, onPost?: Parameters<typeof ledgerFetch>[1]) {
    const fetchMock = ledgerFetch(timeline, onPost);
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();
    return fetchMock;
  }

  it("shows both clocks when the record was made later than the event", async () => {
    // The gap is the fact: an event recorded six days late is a weaker claim
    // about timing than one recorded the same hour.
    await open({
      ...emptyTimeline,
      event_count: 1,
      standing: [{ id: "e1", kind: "spike_observed", occurred_at: "2026-08-16T00:00:00Z", recorded_at: "2026-08-22T00:00:00Z", recorder_kind: "grower", note: null, supersedes_id: null, superseded_by_id: null }],
    });
    const entry = container.querySelector('[data-testid="event-spike_observed"]')?.textContent ?? "";
    expect(entry).toContain("2026-08-16");
    expect(entry).toMatch(/recorded 2026-08-22/);
  });

  it("does not clutter an entry recorded the same day", async () => {
    await open({
      ...emptyTimeline,
      event_count: 1,
      standing: [{ id: "e1", kind: "watered", occurred_at: "2026-08-20T00:00:00Z", recorded_at: "2026-08-20T06:00:00Z", recorder_kind: "grower", note: null, supersedes_id: null, superseded_by_id: null }],
    });
    expect(container.querySelector('[data-testid="event-recorded-late-e1"]')).toBeNull();
  });

  it("will not record an observation without saying when it happened", async () => {
    // Defaulting to today would forge the plant's timeline.
    await open();
    const submit = () => container.querySelector('[data-testid="event-submit"]') as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    set("event-kind", "watered");
    expect(submit().disabled).toBe(true);
    set("event-day", "2026-08-20");
    expect(submit().disabled).toBe(false);
  });

  it("does not prefill the occurrence date", async () => {
    await open();
    expect((container.querySelector('[data-testid="event-day"]') as HTMLInputElement).value).toBe("");
  });

  it("refuses a future occurrence date", async () => {
    await open();
    const field = container.querySelector('[data-testid="event-day"]') as HTMLInputElement;
    expect(field.getAttribute("max")).toBe(new Date().toISOString().slice(0, 10));
  });

  it("posts the kind and occurrence the grower chose", async () => {
    const fetchMock = await open();
    set("event-kind", "repotted");
    set("event-day", "2026-08-20");
    const form = container.querySelector('[data-testid="record-event"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    const post = fetchMock.mock.calls.find((call) => String(call[0]).includes("/events") && (call[1] as RequestInit)?.method === "POST");
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    expect(body.kind).toBe("repotted");
    expect(body.occurred_at).toContain("2026-08-20");
  });

  it("keeps corrected records visible", async () => {
    // "I thought it flowered in March and I was wrong" is itself information.
    await open({
      ...emptyTimeline,
      event_count: 2,
      standing: [],
      corrected: [{ id: "e1", kind: "flowering_observed", occurred_at: "2026-03-01T00:00:00Z", recorded_at: "2026-03-02T00:00:00Z", recorder_kind: "grower", note: null, supersedes_id: null, superseded_by_id: "e2" }],
    });
    const corrected = container.querySelector('[data-testid="corrected-events"]');
    expect(corrected).not.toBeNull();
    expect(corrected?.textContent).toContain("Flowering");
  });

  it("states these are not scientific evidence", async () => {
    await open();
    const provenance = container.querySelector('[data-testid="ledger-provenance"]')?.textContent ?? "";
    expect(provenance).toMatch(/not scientific evidence/i);
    expect(provenance).toMatch(/not published as observations of the species/i);
  });

  it("reports a refused observation instead of showing it as recorded", async () => {
    await open(emptyTimeline, { ok: false, status: 422, body: { detail: { code: "EVENT_KIND_UNRECOGNISED" } } });
    set("event-kind", "watered");
    set("event-day", "2026-08-20");
    const form = container.querySelector('[data-testid="record-event"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    expect(container.querySelector('[data-testid="event-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="event-list"]')).toBeNull();
  });

  it("keeps a malformed ledger response distinct from a plant with no events", async () => {
    // A 200 whose body has no standing list is a contract the service did not
    // honour. Rendering it as "nothing has been recorded" would be a claim
    // about the plant, made on the strength of a broken payload.
    await open({ plant_id: "p1" });
    expect(container.querySelector('[data-testid="ledger-unavailable"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="no-events"]')).toBeNull();
    expect(container.querySelector('[data-testid="record-event"]')).toBeNull();
  });

  it("keeps a backend without the ledger distinct from a plant with no events", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("qr.svg")) return { ok: true, blob: async () => new Blob([""]) } as unknown as Response;
      if (url.includes("/events")) return { ok: false, status: 404, json: async () => ({ detail: "not found" }) } as Response;
      if (url.includes("/placement")) return { ok: true, status: 200, json: async () => ({ plant_id: "p1", current: null, history: [] }) } as Response;
      if (url.includes("/locations")) return { ok: true, status: 200, json: async () => ({ locations: [] }) } as Response;
      return { ok: true, status: 200, json: async () => contextPlant } as Response;
    });
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="ledger-unavailable"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="no-events"]')).toBeNull();
  });
});

/**
 * Entering an environmental reading.
 *
 * The property under test: the grower says where the number came from, and the
 * form never says it for them. A measurement and a hand-entered estimate are
 * different claims about the same number, and defaulting to "measured" would
 * give every guess an instrument's authority for as long as the record lives.
 */
describe("MyConservatory recording an environmental reading", () => {
  const oneBench = [{ id: "loc-1", name: "Cool bench", kind: "greenhouse_bench" }];

  function readingFetch(onPost?: { ok: boolean; status?: number; body: unknown }) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/environment") && init?.method === "POST") {
        const result = onPost ?? { ok: true, status: 201, body: { id: "r1" } };
        return { ok: result.ok, status: result.status ?? 201, json: async () => result.body } as Response;
      }
      if (url.includes("/api/conservatory/locations")) {
        return { ok: true, status: 200, json: async () => ({ locations: oneBench }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  }

  function set(testid: string, value: string) {
    const field = container.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement | HTMLSelectElement;
    act(() => {
      const proto = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    });
  }

  async function open(onPost?: Parameters<typeof readingFetch>[0]) {
    const fetchMock = readingFetch(onPost);
    renderAt("/conservatory/locations", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    return fetchMock;
  }

  it("does not preselect how the number was obtained", async () => {
    await open();
    expect((container.querySelector('[data-testid="reading-origin"]') as HTMLSelectElement).value).toBe("");
  });

  it("asks which instrument only once the grower claims a measurement", async () => {
    await open();
    expect(container.querySelector('[data-testid="instrument-field"]')).toBeNull();
    set("reading-origin", "measured");
    expect(container.querySelector('[data-testid="instrument-field"]')).not.toBeNull();
    set("reading-origin", "manual");
    expect(container.querySelector('[data-testid="instrument-field"]')).toBeNull();
  });

  it("will not submit a measurement without an instrument", async () => {
    // The backend refuses it outright rather than downgrading it, so asking
    // here saves the grower discovering that after typing everything else.
    await open();
    set("reading-variable", "temperature_c");
    set("reading-value", "12.5");
    set("reading-day", "2026-08-20");
    set("reading-origin", "measured");
    expect((container.querySelector('[data-testid="reading-submit"]') as HTMLButtonElement).disabled).toBe(true);
    set("reading-instrument", "Probe A");
    expect((container.querySelector('[data-testid="reading-submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("submits a hand-entered reading without an instrument", async () => {
    const fetchMock = await open();
    set("reading-variable", "relative_humidity_pct");
    set("reading-value", "60");
    set("reading-day", "2026-08-20");
    set("reading-origin", "manual");
    const form = container.querySelector('[data-testid="record-reading"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === "POST");
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    expect(body).toMatchObject({ variable: "relative_humidity_pct", value: 60, origin: "manual" });
    // Only a measured reading may carry an instrument.
    expect(body.instrument).toBeNull();
  });

  it("sends the instrument with a measured reading", async () => {
    const fetchMock = await open();
    set("reading-variable", "temperature_c");
    set("reading-value", "12.5");
    set("reading-day", "2026-08-20");
    set("reading-origin", "measured");
    set("reading-instrument", "Probe A");
    const form = container.querySelector('[data-testid="record-reading"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === "POST");
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    expect(body).toMatchObject({ origin: "measured", instrument: "Probe A", value: 12.5 });
    expect(body.observed_at).toContain("2026-08-20");
  });

  it("says why an instrument is required", async () => {
    await open();
    set("reading-origin", "measured");
    const hint = container.querySelector('[data-testid="instrument-required"]')?.textContent ?? "";
    expect(hint).toMatch(/a measurement has to say what measured it/i);
    expect(hint).toMatch(/a reading you took\s+yourself/i);
  });

  it("refuses a future observation date", async () => {
    await open();
    expect((container.querySelector('[data-testid="reading-day"]') as HTMLInputElement).getAttribute("max"))
      .toBe(new Date().toISOString().slice(0, 10));
  });

  it("reports a refused reading instead of clearing the form as if saved", async () => {
    await open({ ok: false, status: 422, body: { detail: { code: "MEASURED_REQUIRES_INSTRUMENT" } } });
    set("reading-variable", "temperature_c");
    set("reading-value", "12.5");
    set("reading-day", "2026-08-20");
    set("reading-origin", "manual");
    const form = container.querySelector('[data-testid="record-reading"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    expect(container.querySelector('[data-testid="reading-error"]')).not.toBeNull();
    // The grower's input survives so they can correct it.
    expect((container.querySelector('[data-testid="reading-value"]') as HTMLInputElement).value).toBe("12.5");
  });
});

/**
 * Correcting an observation.
 *
 * The ledger is append-only, so a correction is a new event naming the one it
 * supersedes. The interface has to make that visible: a grower who thinks they
 * are editing will not understand why the old entry is still on screen, and a
 * grower who thinks they are deleting will be wrong about what the record now
 * says.
 */
describe("MyConservatory correcting an observation", () => {
  const standing = {
    id: "e1",
    kind: "flowering_observed",
    occurred_at: "2026-03-01T00:00:00Z",
    recorded_at: "2026-03-02T00:00:00Z",
    recorder_kind: "grower",
    note: null,
    supersedes_id: null,
    superseded_by_id: null,
  };
  const timelineWithOne = { plant_id: "p1", standing: [standing], corrected: [], event_count: 1, is_scientific_evidence: false };

  function ledgerFetch(onPost?: { ok: boolean; status?: number; body: unknown }) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("qr.svg")) return { ok: true, blob: async () => new Blob([""]) } as unknown as Response;
      if (url.includes("/events") && init?.method === "POST") {
        const result = onPost ?? { ok: true, status: 201, body: { ...standing, id: "e2", kind: "correction", supersedes_id: "e1" } };
        return { ok: result.ok, status: result.status ?? 201, json: async () => result.body } as Response;
      }
      if (url.includes("/events")) return { ok: true, status: 200, json: async () => timelineWithOne } as Response;
      if (url.includes("/placement")) return { ok: true, status: 200, json: async () => ({ plant_id: "p1", current: null, history: [] }) } as Response;
      if (url.includes("/locations")) return { ok: true, status: 200, json: async () => ({ locations: [] }) } as Response;
      return { ok: true, status: 200, json: async () => contextPlant } as Response;
    });
  }

  function click(testid: string) {
    const el = container.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement;
    act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  }

  function set(testid: string, value: string) {
    const field = container.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function open(onPost?: Parameters<typeof ledgerFetch>[0]) {
    const fetchMock = ledgerFetch(onPost);
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();
    return fetchMock;
  }

  it("says the original is kept, not deleted", async () => {
    // A grower who thinks they are deleting will be wrong about what the
    // record now says.
    await open();
    click("correct-e1");
    const banner = container.querySelector('[data-testid="correcting-banner"]')?.textContent ?? "";
    expect(banner).toMatch(/stays in the record, marked as corrected/i);
    expect(banner).toMatch(/not deleted/i);
  });

  it("posts a correction naming the event it supersedes", async () => {
    const fetchMock = await open();
    click("correct-e1");
    set("event-day", "2026-03-05");
    const form = container.querySelector('[data-testid="record-event"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    const post = fetchMock.mock.calls.find((call) => String(call[0]).includes("/events") && (call[1] as RequestInit)?.method === "POST");
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    // A correction is its own kind; sending the corrected event's kind would
    // leave two competing claims with nothing saying which supersedes which.
    expect(body.kind).toBe("correction");
    expect(body.supersedes_id).toBe("e1");
  });

  it("moves the corrected entry out of what stands and into what was corrected", async () => {
    await open();
    click("correct-e1");
    set("event-day", "2026-03-05");
    const form = container.querySelector('[data-testid="record-event"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    expect(container.querySelector('[data-testid="corrected-events"]')?.textContent).toContain("Flowering");
    expect(container.querySelector('[data-testid="event-flowering_observed"]')).toBeNull();
  });

  it("hides the kind chooser while correcting, since the kind is fixed", async () => {
    await open();
    expect(container.querySelector('[data-testid="event-kind"]')).not.toBeNull();
    click("correct-e1");
    expect(container.querySelector('[data-testid="event-kind"]')).toBeNull();
  });

  it("still requires a date for the correction", async () => {
    await open();
    click("correct-e1");
    expect((container.querySelector('[data-testid="event-submit"]') as HTMLButtonElement).disabled).toBe(true);
    set("event-day", "2026-03-05");
    expect((container.querySelector('[data-testid="event-submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("can be cancelled back to recording a new observation", async () => {
    await open();
    click("correct-e1");
    click("cancel-correction");
    expect(container.querySelector('[data-testid="correcting-banner"]')).toBeNull();
    expect(container.querySelector('[data-testid="event-kind"]')).not.toBeNull();
  });

  it("leaves the timeline alone when the correction is refused", async () => {
    await open({ ok: false, status: 409, body: { detail: { code: "EVENT_ALREADY_SUPERSEDED" } } });
    click("correct-e1");
    set("event-day", "2026-03-05");
    const form = container.querySelector('[data-testid="record-event"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    expect(container.querySelector('[data-testid="event-error"]')).not.toBeNull();
    // The original still stands: nothing was superseded.
    expect(container.querySelector('[data-testid="event-flowering_observed"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="corrected-events"]')).toBeNull();
  });
});

/**
 * Renaming and retiring a location.
 *
 * Both happen to real collections — benches get renamed when their purpose
 * becomes clearer, dismantled when the greenhouse is rebuilt — and neither
 * happens to a plant. "Rename the bench" and "move the plant" produce the same
 * visible change beside a plant and mean entirely different things, so the
 * interface has to say which one it is doing.
 */
describe("MyConservatory location administration", () => {
  const bench = { id: "loc-1", name: "Cool bench", kind: "greenhouse_bench" };

  function adminFetch(handlers: { rename?: { ok: boolean; status?: number; body: unknown }; retire?: { ok: boolean; status?: number; body: unknown } } = {}) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/rename") && init?.method === "POST") {
        const r = handlers.rename ?? { ok: true, status: 200, body: { ...bench, name: "The cold end" } };
        return { ok: r.ok, status: r.status ?? 200, json: async () => r.body } as Response;
      }
      if (url.includes("/retire") && init?.method === "POST") {
        const r = handlers.retire ?? { ok: true, status: 200, body: { ...bench, retired_at: "2026-08-23T00:00:00Z" } };
        return { ok: r.ok, status: r.status ?? 200, json: async () => r.body } as Response;
      }
      if (url.includes("/api/conservatory/locations")) {
        return { ok: true, status: 200, json: async () => ({ locations: [bench] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  }

  function click(testid: string) {
    const el = container.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement;
    act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  }

  function setInput(testid: string, value: string) {
    const field = container.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function open(handlers?: Parameters<typeof adminFetch>[0]) {
    const fetchMock = adminFetch(handlers);
    renderAt("/conservatory/locations", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    return fetchMock;
  }

  it("says a rename is not a move", async () => {
    // The distinction the whole placement model rests on.
    await open();
    click("rename-loc-1");
    const note = container.querySelector('[data-testid="rename-note-loc-1"]')?.textContent ?? "";
    expect(note).toMatch(/it is not a move/i);
    expect(note).toMatch(/no plant.s history changes/i);
  });

  it("posts the new name to the rename endpoint", async () => {
    const fetchMock = await open();
    click("rename-loc-1");
    setInput("rename-input-loc-1", "The cold end");
    const form = container.querySelector('[data-testid="rename-form-loc-1"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    const post = fetchMock.mock.calls.find((call) => String(call[0]).includes("/rename"));
    expect(post).toBeDefined();
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ name: "The cold end" });
  });

  it("will not submit a rename that changes nothing", async () => {
    // A no-op rename would put a change in the location's log that never
    // happened.
    await open();
    click("rename-loc-1");
    expect((container.querySelector('[data-testid="rename-save-loc-1"]') as HTMLButtonElement).disabled).toBe(true);
    setInput("rename-input-loc-1", "The cold end");
    expect((container.querySelector('[data-testid="rename-save-loc-1"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("posts a retire request", async () => {
    const fetchMock = await open();
    click("retire-loc-1");
    await flush();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/retire"))).toBe(true);
  });

  it("reports that a bench still has plants on it rather than failing silently", async () => {
    // A fact about the collection the grower must act on, not a bug.
    await open({ retire: { ok: false, status: 409, body: { detail: { code: "LOCATION_STILL_OCCUPIED" } } } });
    click("retire-loc-1");
    await flush();
    expect(container.querySelector('[data-testid="location-admin-error-loc-1"]')).not.toBeNull();
  });

  it("reports a refused rename and keeps the form open", async () => {
    await open({ rename: { ok: false, status: 409, body: { detail: { code: "LOCATION_NAME_ALREADY_USED" } } } });
    click("rename-loc-1");
    setInput("rename-input-loc-1", "Warm bench");
    const form = container.querySelector('[data-testid="rename-form-loc-1"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    expect(container.querySelector('[data-testid="location-admin-error-loc-1"]')).not.toBeNull();
    // Still editable, so the grower can pick another name.
    expect(container.querySelector('[data-testid="rename-form-loc-1"]')).not.toBeNull();
  });

  it("can cancel a rename back to the original name", async () => {
    await open();
    click("rename-loc-1");
    setInput("rename-input-loc-1", "Something else");
    click("rename-cancel-loc-1");
    expect(container.querySelector('[data-testid="rename-form-loc-1"]')).toBeNull();
    click("rename-loc-1");
    expect((container.querySelector('[data-testid="rename-input-loc-1"]') as HTMLInputElement).value).toBe("Cool bench");
  });
});

/**
 * A location's own history.
 *
 * This is where the distinction the placement model rests on becomes visible.
 * A rename belongs here and nowhere near a plant, so a grower puzzled by a
 * bench having changed names can see when it happened without finding a
 * phantom move in a plant's record.
 */
describe("MyConservatory location history", () => {
  const bench = { id: "loc-1", name: "The cold end", kind: "greenhouse_bench" };
  const changes = [
    { id: "c1", change: "created", previous_name: null, new_name: "Cool bench", note: null, recorded_at: "2026-01-01T00:00:00Z" },
    { id: "c2", change: "renamed", previous_name: "Cool bench", new_name: "The cold end", note: null, recorded_at: "2026-05-01T00:00:00Z" },
  ];

  function historyFetch(result?: { ok: boolean; status?: number; body: unknown }) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/history")) {
        const r = result ?? { ok: true, status: 200, body: { location_id: "loc-1", history: changes } };
        return { ok: r.ok, status: r.status ?? 200, json: async () => r.body } as Response;
      }
      if (url.includes("/api/conservatory/locations")) {
        return { ok: true, status: 200, json: async () => ({ locations: [bench] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  }

  function click(testid: string) {
    const el = container.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement;
    act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  }

  async function open(result?: Parameters<typeof historyFetch>[0]) {
    const fetchMock = historyFetch(result);
    renderAt("/conservatory/locations", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    return fetchMock;
  }

  it("is not fetched until the grower asks for it", async () => {
    const fetchMock = await open();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/history"))).toBe(false);
    click("history-toggle-loc-1");
    await flush();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/history"))).toBe(true);
  });

  it("shows a rename as a rename, with both names", async () => {
    await open();
    click("history-toggle-loc-1");
    await flush();
    const renamed = container.querySelector('[data-testid="history-entry-renamed"]')?.textContent ?? "";
    expect(renamed).toContain("Cool bench");
    expect(renamed).toContain("The cold end");
    expect(renamed).toMatch(/renamed/i);
  });

  it("says no plant moved because of any of it", async () => {
    // The whole reason this view exists separately from placement history.
    await open();
    click("history-toggle-loc-1");
    await flush();
    const scope = container.querySelector('[data-testid="history-scope-loc-1"]')?.textContent ?? "";
    expect(scope).toMatch(/changes to the place itself/i);
    expect(scope).toMatch(/no plant moved/i);
  });

  it("reports a failure to load rather than showing an empty history", async () => {
    // An empty list would claim nothing ever happened to this bench.
    await open({ ok: false, status: 503, body: { detail: "unavailable" } });
    click("history-toggle-loc-1");
    await flush();
    expect(container.querySelector('[data-testid="history-error-loc-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="history-entry-created"]')).toBeNull();
  });

  it("reports a malformed history rather than claiming nothing happened", async () => {
    // Fourth time this shape of gap has appeared this session: a
    // contract-shaped failure (200, wrong body) reaches the component by a
    // different path than a transport-shaped one (503), and covering one says
    // nothing about the other.
    await open({ ok: true, status: 200, body: { location_id: "loc-1" } });
    click("history-toggle-loc-1");
    await flush();
    expect(container.querySelector('[data-testid="history-error-loc-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="history-loc-1"]')?.textContent).not.toMatch(/no changes recorded/i);
  });

  it("can be hidden again", async () => {
    await open();
    click("history-toggle-loc-1");
    await flush();
    expect(container.querySelector('[data-testid="history-loc-1"]')).not.toBeNull();
    click("history-toggle-loc-1");
    expect(container.querySelector('[data-testid="history-loc-1"]')).toBeNull();
  });
});

/**
 * Bringing a retired location back.
 *
 * A bench that returns is the same bench. Un-retiring keeps its identity, so
 * every placement recorded before it was retired still points here — which is
 * exactly what creating a replacement with the same name would destroy.
 */
describe("MyConservatory un-retiring a location", () => {
  const gone = { id: "loc-gone", name: "Winter bench", kind: "greenhouse_bench", retired_at: "2026-05-01T00:00:00Z" };
  const active = { id: "loc-active", name: "Summer bench", kind: "greenhouse_bench" };

  function unretireFetch(result?: { ok: boolean; status?: number; body: unknown }) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/unretire") && init?.method === "POST") {
        const r = result ?? { ok: true, status: 200, body: { ...gone, retired_at: null } };
        return { ok: r.ok, status: r.status ?? 200, json: async () => r.body } as Response;
      }
      if (url.includes("/api/conservatory/locations")) {
        // Both an active and a retired bench, so "only on a retired one" is a
        // real assertion rather than one about an id the fixture never had.
        return { ok: true, status: 200, json: async () => ({ locations: [active, gone] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  }

  function click(testid: string) {
    const el = container.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement;
    act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  }

  async function open(result?: Parameters<typeof unretireFetch>[0]) {
    const fetchMock = unretireFetch(result);
    renderAt("/conservatory/locations", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    return fetchMock;
  }

  it("offers the option only on a retired location", async () => {
    await open();
    expect(container.querySelector('[data-testid="unretire-loc-gone"]')).not.toBeNull();
    // The active bench is present and must NOT offer it: it has retire instead.
    expect(container.querySelector('[data-testid="location-card-loc-active"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="unretire-loc-active"]')).toBeNull();
  });

  it("posts to the unretire endpoint", async () => {
    const fetchMock = await open();
    click("unretire-loc-gone");
    await flush();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/unretire"))).toBe(true);
  });

  it("says the identity is kept, since that is the point", async () => {
    // Creating a replacement with the same name would split one place's
    // history in two.
    await open();
    const note = container.querySelector('[data-testid="unretire-note-loc-gone"]')?.textContent ?? "";
    expect(note).toMatch(/keeps its identity/i);
    expect(note).toMatch(/plants that were here still show it in their history/i);
  });

  it("reports a refusal rather than appearing to succeed", async () => {
    await open({ ok: false, status: 409, body: { detail: { code: "LOCATION_NOT_RETIRED" } } });
    click("unretire-loc-gone");
    await flush();
    expect(container.querySelector('[data-testid="unretire-error-loc-gone"]')).not.toBeNull();
  });
});

/**
 * The placement assessment on the dossier.
 *
 * The failure this panel exists to prevent: a grower skims a list of grey rows,
 * sees no red, and concludes the plant is fine — when in fact nothing could be
 * compared at all. "Nothing to complain about" and "well placed" are different
 * claims, and only one of them is supported by two absences.
 */
describe("MyConservatory placement assessment", () => {
  function assessmentFetch(body: unknown, status = 200) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("qr.svg")) return { ok: true, blob: async () => new Blob([""]) } as unknown as Response;
      if (url.includes("/placement-assessment")) {
        return { ok: status === 200, status, json: async () => body } as Response;
      }
      if (url.includes("/events")) return { ok: true, status: 200, json: async () => ({ plant_id: "p1", standing: [], corrected: [], event_count: 0, is_scientific_evidence: false }) } as Response;
      if (url.includes("/placement")) return { ok: true, status: 200, json: async () => ({ plant_id: "p1", current: null, history: [] }) } as Response;
      if (url.includes("/locations")) return { ok: true, status: 200, json: async () => ({ locations: [] }) } as Response;
      return { ok: true, status: 200, json: async () => contextPlant } as Response;
    });
  }

  async function open(body: unknown, status = 200) {
    const fetchMock = assessmentFetch(body, status);
    renderAt("/conservatory/plants/p1", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();
    return fetchMock;
  }

  const unassessable = {
    assessments: [
      { variable: "temperature_c", outcome: "unassessable", reason: "NO_REQUIREMENT_EVIDENCE" },
      { variable: "relative_humidity_pct", outcome: "unassessable", reason: "NO_CONDITION_RECORDED" },
    ],
    counts: { within: 0, outside: 0, unassessable: 2, conflicting: 0 },
    anything_assessed: false,
    is_recommendation: false,
  };

  it("says plainly when nothing could be compared", async () => {
    // The whole point of the panel.
    await open(unassessable);
    const banner = container.querySelector('[data-testid="nothing-assessed"]')?.textContent ?? "";
    expect(banner).toMatch(/nothing could be compared/i);
    expect(banner).toMatch(/not a sign that the plant is well placed/i);
    expect(container.querySelector('[data-testid="assessment-summary"]')).toBeNull();
  });

  it("explains why each variable could not be assessed", async () => {
    await open(unassessable);
    expect(container.querySelector('[data-testid="assessment-temperature_c"]')?.textContent)
      .toMatch(/no cultivation evidence for this taxon/i);
    expect(container.querySelector('[data-testid="assessment-relative_humidity_pct"]')?.textContent)
      .toMatch(/nothing has been recorded for this variable/i);
  });

  it("reports a breach with the bound it passed and the evidence behind it", async () => {
    await open({
      assessments: [{
        variable: "temperature_c", outcome: "outside",
        breached: [{ bound: "minimum", limit: 15 }],
        condition: { value: 10, unit: "degrees Celsius", origin: "measured" },
        bounds: { minimum: [{ value: 15, evidence_strength: "verified" }] },
      }],
      counts: { within: 0, outside: 1, unassessable: 0, conflicting: 0 },
      anything_assessed: true,
      is_recommendation: false,
    });
    const breach = container.querySelector('[data-testid="assessment-breach-temperature_c-minimum"]')?.textContent ?? "";
    expect(breach).toMatch(/past the known minimum of 15/i);
    expect(breach).toMatch(/evidence: verified/i);
    expect(container.querySelector('[data-testid="assessment-summary"]')?.textContent).toMatch(/1 recorded condition falls outside/i);
  });

  it("shows how the breached condition was obtained", async () => {
    // A breach found against a hand-entered number is a weaker finding than
    // one against an instrument.
    await open({
      assessments: [{
        variable: "temperature_c", outcome: "outside",
        breached: [{ bound: "minimum", limit: 15 }],
        condition: { value: 10, unit: "degrees Celsius", origin: "manual" },
        bounds: { minimum: [{ value: 15 }] },
      }],
      counts: { within: 0, outside: 1, unassessable: 0, conflicting: 0 },
      anything_assessed: true, is_recommendation: false,
    });
    expect(container.querySelector('[data-testid="assessment-condition-temperature_c"]')?.textContent)
      .toMatch(/entered by hand/i);
  });

  it("does not claim everything is fine when some variables were skipped", async () => {
    await open({
      assessments: [
        { variable: "temperature_c", outcome: "within", condition: { value: 20, unit: "degrees Celsius", origin: "measured" }, bounds: {} },
        { variable: "relative_humidity_pct", outcome: "unassessable", reason: "NO_CONDITION_RECORDED" },
      ],
      counts: { within: 1, outside: 0, unassessable: 1, conflicting: 0 },
      anything_assessed: true, is_recommendation: false,
    });
    const summary = container.querySelector('[data-testid="assessment-summary"]')?.textContent ?? "";
    expect(summary).toMatch(/everything that could be compared/i);
    expect(summary).toMatch(/could not be compared are listed below/i);
  });

  it("shows a conflict as a conflict, not as a pass", async () => {
    await open({
      assessments: [{ variable: "temperature_c", outcome: "conflicting", reason: "SOURCES_DISAGREE_ABOUT_THE_BOUND" }],
      counts: { within: 0, outside: 0, unassessable: 0, conflicting: 1 },
      anything_assessed: false, is_recommendation: false,
    });
    const row = container.querySelector('[data-testid="assessment-temperature_c"]');
    expect(row?.getAttribute("data-outcome")).toBe("conflicting");
    expect(row?.textContent).toMatch(/sources disagree/i);
  });

  it("states it is not advice", async () => {
    await open(unassessable);
    const note = container.querySelector('[data-testid="assessment-not-advice"]')?.textContent ?? "";
    expect(note).toMatch(/a comparison, not advice/i);
    expect(note).toMatch(/what else is on the bench/i);
  });

  it("keeps a backend without the route distinct from a plant with nothing to assess", async () => {
    await open({ detail: "not found" }, 404);
    expect(container.querySelector('[data-testid="assessment-unavailable"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="nothing-assessed"]')).toBeNull();
  });

  it("keeps a malformed assessment distinct too", async () => {
    await open({ counts: {} });
    expect(container.querySelector('[data-testid="assessment-unavailable"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="assessment-list"]')).toBeNull();
  });
});

/**
 * Correcting an environmental reading.
 *
 * Until this list existed a correction was unreachable: the form could send one
 * but nothing showed a grower which reading to correct. A typo matters here
 * more than most places — readings feed the placement assessment, so a stray
 * 120 can put a plant "outside" a bound it never breached.
 */
describe("MyConservatory correcting a reading", () => {
  const bench = { id: "loc-1", name: "Cool bench", kind: "greenhouse_bench" };
  const wrongReading = {
    id: "r1", variable: "temperature_c", unit: "degrees Celsius", value: 120,
    origin: "manual", instrument: null, observed_at: "2026-08-20T00:00:00Z",
    note: null, supersedes_id: null, superseded_by_id: null,
  };

  /** "omit" means the response carries no readings key at all. Passing
   *  `undefined` cannot express that: it selects `open`'s default parameter,
   *  which is how this case silently stopped being tested. */
  function readingsFetch(readings: unknown[] | "omit", onPost?: { ok: boolean; status?: number; body: unknown }) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/environment") && init?.method === "POST") {
        const r = onPost ?? { ok: true, status: 201, body: { id: "r2" } };
        return { ok: r.ok, status: r.status ?? 201, json: async () => r.body } as Response;
      }
      if (url.includes("/environment")) {
        const body: Record<string, unknown> = { location_id: "loc-1", variables: {} };
        if (readings !== "omit") body.readings = readings;
        return { ok: true, status: 200, json: async () => body } as Response;
      }
      if (url.includes("/api/conservatory/locations")) {
        return { ok: true, status: 200, json: async () => ({ locations: [bench] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  }

  function click(testid: string) {
    const el = container.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement;
    act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  }

  function set(testid: string, value: string) {
    const field = container.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement | HTMLSelectElement;
    act(() => {
      const proto = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    });
  }

  async function open(readings: unknown[] | "omit" = [wrongReading], onPost?: Parameters<typeof readingsFetch>[1]) {
    const fetchMock = readingsFetch(readings, onPost);
    renderAt("/conservatory/locations", fetchMock as unknown as ReturnType<typeof routedFetch>);
    await flush();
    await flush();
    return fetchMock;
  }

  it("lists what has been measured here, so a typo can be found", async () => {
    await open();
    const entry = container.querySelector('[data-testid="reading-r1"]')?.textContent ?? "";
    expect(entry).toContain("120");
    expect(entry).toMatch(/entered by hand/i);
    expect(container.querySelector('[data-testid="correct-reading-r1"]')).not.toBeNull();
  });

  it("says the original is kept and stops being used", async () => {
    await open();
    click("correct-reading-r1");
    const banner = container.querySelector('[data-testid="correcting-reading"]')?.textContent ?? "";
    expect(banner).toMatch(/stays in the record, marked as\s+corrected/i);
    expect(banner).toMatch(/stops being used/i);
    expect(banner).toMatch(/not deleted/i);
  });

  it("posts a correction naming the reading it supersedes", async () => {
    const fetchMock = await open();
    click("correct-reading-r1");
    set("reading-value", "12");
    set("reading-day", "2026-08-20");
    set("reading-origin", "manual");
    const form = container.querySelector('[data-testid="record-reading"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();

    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === "POST");
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    expect(body.supersedes_id).toBe("r1");
    // The variable is fixed by the reading being corrected; changing it would
    // make one claim into a different one, and the backend refuses it.
    expect(body.variable).toBe("temperature_c");
    expect(body.value).toBe(12);
  });

  it("hides the variable chooser while correcting", async () => {
    await open();
    expect(container.querySelector('[data-testid="reading-variable"]')).not.toBeNull();
    click("correct-reading-r1");
    expect(container.querySelector('[data-testid="reading-variable"]')).toBeNull();
  });

  it("can be cancelled back to recording a new reading", async () => {
    await open();
    click("correct-reading-r1");
    click("cancel-reading-correction");
    expect(container.querySelector('[data-testid="correcting-reading"]')).toBeNull();
    expect(container.querySelector('[data-testid="reading-variable"]')).not.toBeNull();
  });

  it("keeps corrected readings visible, struck through", async () => {
    // A grower must be able to see that a number they remember was revised.
    await open([
      { ...wrongReading, superseded_by_id: "r2" },
      { ...wrongReading, id: "r2", value: 12, supersedes_id: "r1" },
    ]);
    const corrected = container.querySelector('[data-testid="corrected-readings-loc-1"]');
    expect(corrected?.textContent).toContain("120");
    // And the corrected one is not offered for correction again.
    expect(container.querySelector('[data-testid="correct-reading-r1"]')).toBeNull();
    expect(container.querySelector('[data-testid="correct-reading-r2"]')).not.toBeNull();
  });

  it("reports a refused correction instead of appearing to save", async () => {
    await open([wrongReading], { ok: false, status: 409, body: { detail: { code: "READING_ALREADY_SUPERSEDED" } } });
    click("correct-reading-r1");
    set("reading-value", "12");
    set("reading-day", "2026-08-20");
    set("reading-origin", "manual");
    const form = container.querySelector('[data-testid="record-reading"]') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();
    expect(container.querySelector('[data-testid="reading-error"]')).not.toBeNull();
  });

  it("says nothing measured yet rather than showing an empty list", async () => {
    await open([]);
    expect(container.querySelector('[data-testid="no-readings-loc-1"]')).not.toBeNull();
  });

  it("keeps a malformed readings response distinct from an unmeasured bench", async () => {
    // An empty list would claim this bench has never been measured, on the
    // strength of a broken payload.
    await open("omit");
    expect(container.querySelector('[data-testid="readings-unavailable-loc-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="no-readings-loc-1"]')).toBeNull();
  });
});
