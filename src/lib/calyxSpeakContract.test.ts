/**
 * CONTRACT EVIDENCE ONLY - this is NOT live acceptance.
 *
 * These tests drive the REAL frontend client functions (src/lib/calyxWorkspace.ts)
 * against a stubbed `fetch`. The stub returns bodies shaped like the responses
 * of jsp1440/orchid-calyx-backend app/calyx_conversation/speak_routes.py (router
 * prefix /calyx/speak, mounted under /api; auth dependency
 * verify_owner_or_api_key). Nothing here contacts the deployed backend, so it
 * proves nothing about authentication, persistence, deployment or the live
 * provider. A real authenticated conversation on the Render frontend is still
 * required for acceptance.
 *
 * Provenance of the fixtures:
 *  - Turn response top-level keys, the casual-turn `research` blocks, the
 *    `knowledge` fallback block, `deliverables` and `workspace_outputs` shapes
 *    are copied from speak_routes.py (append_turn / _run_governed_turn /
 *    _safe_knowledge_context / _deliverable_capabilities / _workspace_outputs).
 *  - Message and conversation field names (message_id, conversation_id, role,
 *    content, created_at, metadata, project_id, persistence_mode...) come from the
 *    frontend `CalyxServerMessage` / `CalyxConversation` types, because the
 *    store module that builds them (STORE) was not read for this file.
 *  - `access_policy` is reduced to the one key speak_routes.py itself adds
 *    (`provider_outcome`); the keys of `access.as_dict()` were not read.
 *  - Error bodies use the `detail.code` values raised in speak_routes.py.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import { visibleConversationMessages } from "@/lib/calyxConversation";
import {
  CalyxApiError,
  createCalyxConversation,
  getCalyxConversation,
  sendCalyxTurn,
} from "@/lib/calyxWorkspace";

const CONVERSATION_ID = "5b1d2f4c-0000-4000-8000-000000000001";
const OPERATOR_ID = "m-operator-1";
const CALYX_ID = "m-calyx-1";
const TOOL_ID = "m-tool-1";
const ANSWER = "Hello. I can help with orchid research questions.";

const operatorMessage = {
  message_id: OPERATOR_ID,
  conversation_id: CONVERSATION_ID,
  role: "operator",
  content: "hello calyx",
  created_at: "2026-10-26T12:00:01Z",
  metadata: { context: {}, research_mode: "auto" },
};

const calyxMessage = {
  message_id: CALYX_ID,
  conversation_id: CONVERSATION_ID,
  role: "calyx",
  content: ANSWER,
  created_at: "2026-10-26T12:00:02Z",
  metadata: { provider: "deterministic-governed", citations: [], synthesis_structure: null },
};

const createdConversation = {
  conversation_id: CONVERSATION_ID,
  project_id: "calyx-speak",
  title: "Speak with Calyx",
  created_at: "2026-10-26T12:00:00Z",
  updated_at: "2026-10-26T12:00:00Z",
  context: {},
  messages: [],
  persistence_mode: "postgres",
};

// Shape of append_turn's return dict, with the casual-turn blocks copied from _run_governed_turn.
const turnResponse = {
  conversation_id: CONVERSATION_ID,
  operator_message: operatorMessage,
  calyx_message: calyxMessage,
  answer: ANSWER,
  provider: {
    name: "deterministic-governed",
    model: "calyx-governed-summary-v1",
    request_hash: "0".repeat(64),
    provider_response_id: null,
    fallback_error: null,
    configuration: {},
    generative: false,
  },
  access_policy: { provider_outcome: "deterministic" },
  interaction_context: {},
  synthesis_structure: null,
  research: {
    casual: true,
    mission: null,
    mission_error: null,
    retrieval: { results: [], total_eligible_results: 0, retrieval_mode: "HYBRID", status: "not_requested" },
    continuum: {
      candidate_genera: [], resolved_genera: [], taxa: [], diagnostics: [],
      read_only: true, automatic_publication: false, knowledge_graph_mutation: false,
    },
    climate: { requested: false, status: "not_relevant", products: [], external: true, time_sensitive: true },
    knowledge: {
      schema: "oc.calyx-knowledge-context.v1",
      query: "hello calyx",
      lexicon: { available: false, source: "oc_lexicon", canonical_graph_mutated: false, read_only: true },
      literature: { available: false, source: "oc_literature_extraction", canonical_graph_mutated: false, read_only: true },
      read_only: true,
      canonical_graph_mutated: false,
      engineering_dispatch_authorized: false,
      provider_calls: 0,
    },
    citations: [],
    scientific_memory: {},
  },
  workspace_outputs: [],
  deliverables: { downloadable_conversation_export: true, export_format: "markdown", structured_citations: true },
  persistence_mode: "postgres",
  epistemic_policy: {
    continuum_first: true, provider_memory_is_evidence: false, interaction_context_is_evidence: false,
    external_literature_requires_review: true, conversation_does_not_publish_knowledge: true,
    candidate_knowledge_auto_promotion: false, knowledge_graph_mutation: false,
  },
};

// GET /conversations/{id}: persisted transcript. speak_routes.append_turn appends
// role="tool" messages for governed tool steps; visibleConversationMessages must hide them.
const persistedConversation = {
  ...createdConversation,
  updated_at: "2026-10-26T12:00:02Z",
  messages: [
    operatorMessage,
    {
      message_id: TOOL_ID,
      conversation_id: CONVERSATION_ID,
      role: "tool",
      content: "Canonical Continuum graph context resolved for: Cattleya",
      created_at: "2026-10-26T12:00:01Z",
      metadata: { tool: "continuum_context", read_only: true, knowledge_graph_mutation: false },
    },
    calyxMessage,
  ],
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("CALYX speak client against speak_routes.py-shaped responses (contract evidence only)", () => {
  const fetchStub = vi.fn();

  beforeEach(() => {
    fetchStub.mockReset();
    vi.stubGlobal("fetch", fetchStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([401, 403])("maps HTTP %i to authentication_required and sends credentials", async (status) => {
    fetchStub.mockResolvedValue(jsonResponse(status, {}));

    const failure = await createCalyxConversation({ project_id: "calyx-speak" }).catch((error) => error);

    expect(failure).toBeInstanceOf(CalyxApiError);
    expect((failure as CalyxApiError).kind).toBe("authentication_required");
    expect((failure as CalyxApiError).status).toBe(status);
    const [url, init] = fetchStub.mock.calls[0];
    expect(url).toBe(`${CALYX_BACKEND_BASE_URL}/api/calyx/speak/conversations`);
    expect(init.credentials).toBe("include");
  });

  it("surfaces the backend detail.code as the message of an authentication failure", async () => {
    fetchStub.mockResolvedValue(jsonResponse(401, { detail: { code: "AUTHENTICATED_SUBJECT_REQUIRED" } }));

    const failure = await getCalyxConversation(CONVERSATION_ID).catch((error) => error);

    expect((failure as CalyxApiError).kind).toBe("authentication_required");
    expect((failure as CalyxApiError).message).toBe("AUTHENTICATED_SUBJECT_REQUIRED");
  });

  it("maps CONVERSATION_NOT_FOUND (404) and INVALID_CONVERSATION_IDENTIFIER (422) distinctly", async () => {
    fetchStub.mockResolvedValueOnce(jsonResponse(404, { detail: { code: "CONVERSATION_NOT_FOUND" } }));
    fetchStub.mockResolvedValueOnce(jsonResponse(422, { detail: { code: "INVALID_CONVERSATION_IDENTIFIER" } }));

    const notFound = await getCalyxConversation("missing").catch((error) => error);
    const invalid = await getCalyxConversation("not-a-uuid").catch((error) => error);

    // The client folds a missing conversation into route_unavailable, the same kind
    // used for "API not deployed"; the backend code is preserved only as the message.
    expect((notFound as CalyxApiError).kind).toBe("route_unavailable");
    expect((notFound as CalyxApiError).message).toBe("CONVERSATION_NOT_FOUND");
    expect((invalid as CalyxApiError).kind).toBe("validation_failed");
    expect((invalid as CalyxApiError).message).toBe("INVALID_CONVERSATION_IDENTIFIER");
  });

  it("create -> send -> displayed answer -> reload of the persisted transcript", async () => {
    fetchStub.mockResolvedValueOnce(jsonResponse(201, createdConversation));
    fetchStub.mockResolvedValueOnce(jsonResponse(200, turnResponse));
    fetchStub.mockResolvedValueOnce(jsonResponse(200, persistedConversation));

    const created = await createCalyxConversation({ title: "Speak with Calyx", project_id: "calyx-speak", context: {} });
    expect(created.conversation_id).toBe(CONVERSATION_ID);
    expect(created.messages).toEqual([]);

    const turn = await sendCalyxTurn(created.conversation_id, {
      message: "hello calyx",
      project_id: "calyx-speak",
      context: {},
      research_mode: "auto",
      retrieval_limit: 20,
    });
    expect(turn.conversation_id).toBe(CONVERSATION_ID);
    expect(turn.answer).toBe(ANSWER);
    expect(turn.operator_message.role).toBe("operator");
    expect(turn.calyx_message.content).toBe(turn.answer);
    expect(turn.research.casual).toBe(true);
    expect(turn.research.mission).toBeNull();
    expect(turn.workspace_outputs).toEqual([]);
    expect(turn.epistemic_policy.knowledge_graph_mutation).toBe(false);

    // What the transcript renders for the live turn.
    const live = visibleConversationMessages([turn.operator_message, turn.calyx_message]);
    expect(live.map((item) => item.role)).toEqual(["operator", "calyx"]);
    expect(live[1].content).toBe(ANSWER);

    // Reload of the persisted transcript: the tool step is stored but not displayed.
    const reloaded = await getCalyxConversation(created.conversation_id);
    expect(reloaded.persistence_mode).toBe("postgres");
    expect(reloaded.messages).toHaveLength(3);
    const shown = visibleConversationMessages(reloaded.messages);
    expect(shown.map((item) => item.message_id)).toEqual([OPERATOR_ID, CALYX_ID]);
    expect(shown[1].content).toBe(ANSWER);

    // Exact requests the client made.
    const [createCall, turnCall, getCall] = fetchStub.mock.calls;
    expect(createCall[0]).toBe(`${CALYX_BACKEND_BASE_URL}/api/calyx/speak/conversations`);
    expect(createCall[1].method).toBe("POST");
    expect(JSON.parse(createCall[1].body)).toEqual({ title: "Speak with Calyx", project_id: "calyx-speak", context: {} });
    expect(turnCall[0]).toBe(`${CALYX_BACKEND_BASE_URL}/api/calyx/speak/conversations/${CONVERSATION_ID}/turns`);
    expect(turnCall[1].method).toBe("POST");
    expect(JSON.parse(turnCall[1].body)).toEqual({
      message: "hello calyx", project_id: "calyx-speak", context: {}, research_mode: "auto", retrieval_limit: 20,
    });
    expect(getCall[0]).toBe(`${CALYX_BACKEND_BASE_URL}/api/calyx/speak/conversations/${CONVERSATION_ID}`);
    for (const [, init] of fetchStub.mock.calls) expect(init.credentials).toBe("include");
  });

  it("a network failure surfaces as network_error, not as an authentication failure", async () => {
    fetchStub.mockRejectedValue(new TypeError("Failed to fetch"));

    const failure = await sendCalyxTurn(CONVERSATION_ID, { message: "hello calyx" }).catch((error) => error);

    expect((failure as CalyxApiError).kind).toBe("network_error");
  });
});
