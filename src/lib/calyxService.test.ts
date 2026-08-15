// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCalyxConversation: vi.fn(),
  getCalyxConversation: vi.fn(),
  sendCalyxTurn: vi.fn(),
}));

vi.mock("@/lib/calyxWorkspace", async () => {
  const actual = await vi.importActual<typeof import("@/lib/calyxWorkspace")>("@/lib/calyxWorkspace");
  return {
    ...actual,
    createCalyxConversation: mocks.createCalyxConversation,
    getCalyxConversation: mocks.getCalyxConversation,
    sendCalyxTurn: mocks.sendCalyxTurn,
  };
});

import { CALYX_WORKSPACE_OUTPUT_EVENT, type WorkspaceOutput } from "@/features/calyx-workspace/workspaceOutputBus";
import { askCalyx } from "@/lib/calyxService";

function baseTurn(overrides: Record<string, unknown> = {}) {
  return {
    conversation_id: "conv-1",
    operator_message: { message_id: "op-1", conversation_id: "conv-1", role: "operator", content: "q", created_at: "2026-08-15T00:00:00Z" },
    calyx_message: { message_id: "calyx-1", conversation_id: "conv-1", role: "calyx", content: "a", created_at: "2026-08-15T00:00:01Z" },
    answer: "The answer.",
    provider: { name: "deterministic-governed", model: "calyx-governed-summary-v1", request_hash: "hash" },
    research: { casual: false, mission: null, mission_error: null, retrieval: {} },
    persistence_mode: "postgres",
    epistemic_policy: { continuum_first: true },
    ...overrides,
  };
}

function collectedOutputs(): WorkspaceOutput[] {
  const collected: WorkspaceOutput[] = [];
  window.addEventListener(CALYX_WORKSPACE_OUTPUT_EVENT, (event) => {
    collected.push((event as CustomEvent<WorkspaceOutput>).detail);
  });
  return collected;
}

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.createCalyxConversation.mockReset();
  mocks.getCalyxConversation.mockReset();
  mocks.sendCalyxTurn.mockReset();
  mocks.createCalyxConversation.mockResolvedValue({ conversation_id: "conv-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("askCalyx workspace-output bridge", () => {
  it("emits each server workspace output onto the shared bus", async () => {
    mocks.sendCalyxTurn.mockResolvedValue(
      baseTurn({
        workspace_outputs: [
          {
            id: "calyx-1:mission-sources",
            kind: "table",
            title: "Retrieved canonical sources",
            subtitle: "1 source",
            provenance: { source_module: "brain_mission", source_id: "mission-1", generated: false, evidence_status: "evidence" },
            payload: { columns: [{ key: "title", label: "Title" }], rows: [{ title: "A source" }] },
            created_at: "2026-08-15T00:00:01Z",
          },
        ],
      }),
    );

    const seen = collectedOutputs();
    await askCalyx({ concept: "resupination", question: "What is this?" });

    expect(seen).toHaveLength(1);
    expect(seen[0].id).toBe("calyx-1:mission-sources");
    expect(seen[0].provenance.evidence_status).toBe("evidence");
  });

  it("does nothing when the server returns no workspace outputs", async () => {
    mocks.sendCalyxTurn.mockResolvedValue(baseTurn());

    const seen = collectedOutputs();
    await askCalyx({ concept: "resupination", question: "What is this?" });

    expect(seen).toHaveLength(0);
  });

  it("discards a malformed output without throwing or blocking the response", async () => {
    mocks.sendCalyxTurn.mockResolvedValue(
      baseTurn({
        workspace_outputs: [
          {
            // Missing required "id" - validateWorkspaceOutput must reject this.
            id: "",
            kind: "text",
            title: "Broken output",
            provenance: { source_module: "brain_mission", evidence_status: "unknown" },
            payload: { body: "x" },
            created_at: "2026-08-15T00:00:01Z",
          },
          {
            id: "calyx-1:missing-evidence",
            kind: "text",
            title: "Evidence gaps for this turn",
            provenance: { source_module: "brain_mission", evidence_status: "unknown" },
            payload: { body: "- something is missing" },
            created_at: "2026-08-15T00:00:01Z",
          },
        ],
      }),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const seen = collectedOutputs();
    const response = await askCalyx({ concept: "resupination", question: "What is this?" });

    expect(response.concise_answer).toBe("The answer.");
    expect(seen).toHaveLength(1);
    expect(seen[0].id).toBe("calyx-1:missing-evidence");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
