import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrainMissionApiError,
  CalyxApiError,
  createCalyxConversation,
  getBrainMission,
  getCalyxConversation,
  sendCalyxTurn,
  startBrainMission,
} from "./calyxWorkspace";

const mission = {
  mission_id: "mission-1", project_id: "project-1", question: "What evidence exists?", state: "AWAITING_HUMAN_REVIEW", current_stage: "eligible_for_publication_state", steps_executed: 10,
  sources: [], supporting_evidence: [], contradicting_evidence: [], missing_evidence: ["mycorrhiza"], confidence: 0.72, conclusions: [{ type: "inference", text: "Provisional conclusion" }],
  reasoning_ledger: { ledger_id: "ledger-1", version: 3 }, validation: { valid: true, blockers: [] }, review_status: "HUMAN_REVIEW_REQUIRED",
  publication_eligibility: { eligible: false, automatic_publication: false as const, blockers: ["HUMAN_REVIEW_REQUIRED"] }, blockers: [], partial: false,
  created_at: "2026-08-09T00:00:00Z", updated_at: "2026-08-09T00:00:01Z",
};

const conversation = {
  conversation_id: "conversation-1",
  owner: "owner-1",
  project_id: "calyx-vision",
  title: "Speak with Calyx",
  created_at: "2026-08-09T00:00:00Z",
  updated_at: "2026-08-09T00:00:01Z",
  messages: [],
  persistence_mode: "postgres",
};

const turnResponse = {
  conversation_id: "conversation-1",
  operator_message: { message_id: "m1", conversation_id: "conversation-1", role: "operator", content: "What does Vision need?", created_at: "2026-08-09T00:00:02Z" },
  calyx_message: { message_id: "m2", conversation_id: "conversation-1", role: "calyx", content: "Ground visual structures to canonical concepts.", created_at: "2026-08-09T00:00:03Z", metadata: { provider: "deterministic-governed", model: "calyx-governed-summary-v1", mission_id: "mission-1" } },
  answer: "Ground visual structures to canonical concepts.",
  provider: { name: "deterministic-governed", model: "calyx-governed-summary-v1", request_hash: "abc" },
  research: { casual: false, mission, mission_error: null, retrieval: {} },
  persistence_mode: "postgres",
  epistemic_policy: { continuum_first: true },
};

afterEach(() => vi.unstubAllGlobals());

describe("Brain mission API", () => {
  it("starts a bounded mission with the shared Calyx origin and owner credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(mission), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const payload = { question: mission.question, project_id: mission.project_id, max_sources: 20, max_execution_steps: 10, timeout_seconds: 30 };
    await expect(startBrainMission(payload)).resolves.toEqual(mission);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://orchid-calyx-backend.onrender.com/brain/missions");
    expect(init).toMatchObject({ method: "POST", credentials: "include", body: JSON.stringify(payload) });
  });

  it("retrieves a mission using an encoded identifier", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(mission), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await getBrainMission("mission/one");
    expect(fetchMock.mock.calls[0][0]).toBe("https://orchid-calyx-backend.onrender.com/brain/missions/mission%2Fone");
  });

  it("keeps Brain mission error compatibility", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { code: "FAIL_CLOSED" } }), { status: 422 })));
    const error = await startBrainMission({ question: "q", project_id: "p" }).catch((value) => value);
    expect(error).toBeInstanceOf(BrainMissionApiError);
    expect(error).toMatchObject({ kind: "validation_failed", status: 422, message: "FAIL_CLOSED" });
  });
});

describe("server-owned Calyx conversation API", () => {
  it("creates a durable server conversation rather than a browser transcript", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(conversation), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createCalyxConversation({ title: "Speak with Calyx", project_id: "calyx-vision" })).resolves.toEqual(conversation);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://orchid-calyx-backend.onrender.com/api/calyx/speak/conversations");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
  });

  it("sends a turn to the same server thread and receives the Calyx-authored reply plus research metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(turnResponse), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendCalyxTurn("conversation-1", { message: "What does Vision need?", project_id: "calyx-vision", research_mode: "auto" });
    expect(result.answer).toContain("canonical concepts");
    expect(result.research.mission?.mission_id).toBe("mission-1");
    expect(result.provider.request_hash).toBe("abc");
    expect(fetchMock.mock.calls[0][0]).toBe("https://orchid-calyx-backend.onrender.com/api/calyx/speak/conversations/conversation-1/turns");
  });

  it("reloads conversation state from the server", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(conversation), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await getCalyxConversation("conversation/one");
    expect(fetchMock.mock.calls[0][0]).toBe("https://orchid-calyx-backend.onrender.com/api/calyx/speak/conversations/conversation%2Fone");
  });

  it.each([[401, "authentication_required"], [404, "route_unavailable"], [422, "validation_failed"], [500, "server_error"]] as const)("maps conversation HTTP %s to %s", async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { code: "FAIL_CLOSED" } }), { status })));
    const error = await createCalyxConversation().catch((value) => value);
    expect(error).toBeInstanceOf(CalyxApiError);
    expect(error).toMatchObject({ kind, status, message: "FAIL_CLOSED" });
  });

  it("reports network failures without fabricating a Calyx reply", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(createCalyxConversation()).rejects.toMatchObject({ kind: "network_error", message: "offline" });
  });
});
