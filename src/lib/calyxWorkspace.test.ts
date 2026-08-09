import { afterEach, describe, expect, it, vi } from "vitest";
import { BrainMissionApiError, getBrainMission, startBrainMission } from "./calyxWorkspace";

const mission = {
  mission_id: "mission-1", project_id: "project-1", question: "What evidence exists?", state: "AWAITING_HUMAN_REVIEW", current_stage: "eligible_for_publication_state", steps_executed: 10,
  sources: [], supporting_evidence: [], contradicting_evidence: [], missing_evidence: ["mycorrhiza"], confidence: 0.72, conclusions: [{ type: "inference", text: "Provisional conclusion" }],
  reasoning_ledger: { ledger_id: "ledger-1", version: 3 }, validation: { valid: true, blockers: [] }, review_status: "HUMAN_REVIEW_REQUIRED",
  publication_eligibility: { eligible: false, automatic_publication: false as const, blockers: ["HUMAN_REVIEW_REQUIRED"] }, blockers: [], partial: false,
  created_at: "2026-08-09T00:00:00Z", updated_at: "2026-08-09T00:00:01Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("Brain mission API", () => {
  it("starts a bounded mission with the shared Calyx origin and owner credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(mission), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const payload = { question: mission.question, project_id: mission.project_id, max_sources: 20, max_execution_steps: 10, timeout_seconds: 30 };
    await expect(startBrainMission(payload)).resolves.toEqual(mission);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://orchid-calyx-backend.onrender.com/api/brain/missions");
    expect(init).toMatchObject({ method: "POST", credentials: "include", body: JSON.stringify(payload) });
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("retrieves a mission using an encoded identifier", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(mission), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await getBrainMission("mission/one");
    expect(fetchMock.mock.calls[0][0]).toBe("https://orchid-calyx-backend.onrender.com/api/brain/missions/mission%2Fone");
  });

  it.each([[401, "authentication_required"], [403, "authentication_required"], [404, "route_unavailable"], [422, "validation_failed"], [500, "server_error"]] as const)("maps HTTP %s to %s", async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { code: "FAIL_CLOSED" } }), { status })));
    const error = await startBrainMission({ question: "q", project_id: "p" }).catch((value) => value);
    expect(error).toBeInstanceOf(BrainMissionApiError);
    expect(error).toMatchObject({ kind, status, message: "FAIL_CLOSED" });
  });

  it("reports network failures without inventing mission results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(startBrainMission({ question: "q", project_id: "p" })).rejects.toMatchObject({ kind: "network_error", message: "offline" });
  });
});
