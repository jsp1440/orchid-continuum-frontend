import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listResearchActivity,
  nextResearchActivityOffset,
  previousResearchActivityOffset,
  reconcileResearchActivityOffset,
  researchActivityRange,
  researchActivityRequestKey,
  type ResearchActivityPage,
} from "@/lib/researchStationActivity";

afterEach(() => {
  vi.restoreAllMocks();
});

const page = (overrides: Partial<ResearchActivityPage> = {}): ResearchActivityPage => ({
  items: [
    {
      event_id: "event-1",
      project_id: "project-1",
      action: "NOTE_CREATED",
      entity_type: "NOTE",
      entity_id: "note-1",
      occurred_at: "2026-09-05T12:00:00Z",
    },
  ],
  total: 51,
  limit: 25,
  offset: 0,
  ...overrides,
});

describe("Research Station activity pagination", () => {
  it("binds a request fingerprint to project, limit, and offset", () => {
    expect(researchActivityRequestKey("project-a", 25, 50)).toBe("project-a:25:50");
    expect(researchActivityRequestKey("project-b", 25, 50)).not.toBe(
      researchActivityRequestKey("project-a", 25, 50),
    );
  });

  it("reconciles an invalid offset to the last valid backend page", () => {
    expect(reconcileResearchActivityOffset(75, 51, 25)).toBe(50);
    expect(reconcileResearchActivityOffset(25, 0, 25)).toBe(0);
    expect(reconcileResearchActivityOffset(25, 25, 25)).toBe(0);
  });

  it("computes truthful ranges and bounded previous/next offsets", () => {
    expect(researchActivityRange(page())).toEqual({ start: 1, end: 1, total: 51 });
    expect(previousResearchActivityOffset(25, 25)).toBe(0);
    expect(previousResearchActivityOffset(0, 25)).toBe(0);
    expect(nextResearchActivityOffset(page())).toBe(25);
    expect(nextResearchActivityOffset(page({ offset: 50, items: [], total: 51 }))).toBeNull();
  });

  it("sends explicit bounded limit and offset to the canonical activity route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(page({ offset: 25 })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await listResearchActivity("project / 1", { limit: 25, offset: 25 });

    expect(result.offset).toBe(25);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "/api/research/projects/project%20%2F%201/activity?limit=25&offset=25",
    );
    expect(init).toMatchObject({ credentials: "include" });
  });

  it("clamps client pagination parameters to the backend contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(page({ limit: 200, offset: 100000 })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await listResearchActivity("project-1", { limit: 999, offset: 999999 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("?limit=200&offset=100000");
  });
});
