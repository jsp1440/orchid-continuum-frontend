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
