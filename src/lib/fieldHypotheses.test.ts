import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FieldHypothesisApiError,
  KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED,
  MINIMUM_COMPETING_HYPOTHESES,
  SensitiveLocalityError,
  assertNoSensitiveLocality,
  cueLabel,
  evidenceStateLabel,
  generateFieldHypotheses,
  getFieldHypothesisLibrary,
  getLatestFieldHypotheses,
  hypothesisClassLabel,
  recordHypothesisEvidence,
  type FieldHypothesis,
  type FieldHypothesisSet,
  type ObservationSnapshot,
} from "./fieldHypotheses";

const BASE = "https://orchid-calyx-backend.onrender.com";

const snapshot: ObservationSnapshot = {
  observer_id: "auth-subject-opaque-abc123",
  observed_at: "2026-06-15T10:30:00Z",
  taxon_hint: "Ophrys sp.",
  epistemic_certainty: "POSSIBLE",
  locality_sensitivity: "RESEARCH_RESTRICTED",
  interaction: {
    visitor_observed: true,
    visitor_group: "male_bee",
    visitor_behaviors: ["pseudocopulation_like_contact"],
    reward_check: "nectar_absent",
    floral_signal_cues: ["insect_like_labellum"],
  },
};

function hypothesis(overrides: Partial<FieldHypothesis> = {}): FieldHypothesis {
  return {
    hypothesis_id: "h-1", set_id: "s-1", observation_id: "obs-1", template_id: "sexual-deception",
    hypothesis_class: "sexual_deception", ko_0038_strategy: "sexual deception", epistemic_status: "HYPOTHESIS",
    statement: "The male bee is responding to Ophrys sp. as a mating signal.",
    predictions: ["Visitors are predominantly males."], would_support: ["Male-only visits."], would_contradict: ["Nectar consumed."],
    cue_matches: ["behavior:pseudocopulation_like_contact"], question_family_ids: ["signal-chemistry"],
    status: "PROPOSED", review_state: "machine_assisted", human_review: null,
    evidence_balance: { supporting: 0, contradicting: 0, unknown: 0 }, evidence_state: "no_evidence", evidence: [],
    knowledge_graph_publication: KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED,
    ...overrides,
  };
}

const set: FieldHypothesisSet = {
  set_id: "s-1", observation_id: "obs-1", observation_fingerprint: "f".repeat(64), created: true,
  generated_at: "2026-06-15T10:31:00Z",
  generation: { mode: "deterministic_rule_library", library_version: "field-hypothesis-library/2026.09-v1", contract_version: "field-hypotheses/v1", provider_called: false, basis: "KO-0038", cue_tokens: ["visitor:observed"] },
  observation: { observer_id: "auth-subject-opaque-abc123", observed_at: "2026-06-15T10:30:00Z", taxon_hint: "Ophrys sp.", epistemic_certainty: "POSSIBLE", locality_sensitivity: "RESEARCH_RESTRICTED", media_count: 0 },
  minimum_competing_hypotheses: MINIMUM_COMPETING_HYPOTHESES,
  hypotheses: [hypothesis(), hypothesis({ hypothesis_id: "h-2", template_id: "non-pollinating-visit", hypothesis_class: "non_pollinating_visit", ko_0038_strategy: "unknown", statement: "The visitor is not an effective pollinator." })],
  follow_up_protocol: [{ step_id: "record-column-contact", instruction: "Film each visit.", purpose: "Locate contact.", non_destructive: true, while_on_site: true, discriminates: ["sexual_deception", "non_pollinating_visit"] }],
  protocol_constraints: ["Do not collect, capture, mark or handle plants, flowers or visitors; observe and record only."],
  review_state: "machine_assisted",
  knowledge_graph_publication: KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("generateFieldHypotheses", () => {
  it("posts the snapshot to the observation's hypotheses route with Calyx credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(set));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateFieldHypotheses("obs/1", snapshot)).resolves.toEqual(set);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/field-observations/obs%2F1/hypotheses`);
    expect(init).toMatchObject({ method: "POST", credentials: "include", body: JSON.stringify(snapshot) });
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("refuses to send protected locality before any request is made", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const leaking = { ...snapshot, latitude: -22.4, longitude: -43.0 } as unknown as ObservationSnapshot;
    await expect(generateFieldHypotheses("obs-1", leaking)).rejects.toBeInstanceOf(SensitiveLocalityError);
    const nested = { ...snapshot, interaction: { ...snapshot.interaction, gps: "x" } } as unknown as ObservationSnapshot;
    await expect(generateFieldHypotheses("obs-1", nested)).rejects.toThrow(/SENSITIVE_LOCALITY_FORBIDDEN: interaction\.gps/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a 404 to route_unavailable so the UI can show an in-development state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "Not Found" }, 404)));
    await expect(generateFieldHypotheses("obs-1", snapshot)).rejects.toMatchObject({ kind: "route_unavailable", status: 404 });
  });

  it("surfaces the backend's validation message for a 422", async () => {
    const detail = [{ type: "value_error", loc: ["body"], msg: "Value error, SENSITIVE_LOCALITY_FORBIDDEN: location_name" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail }, 422)));
    const error = await generateFieldHypotheses("obs-1", snapshot).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FieldHypothesisApiError);
    expect((error as FieldHypothesisApiError).kind).toBe("validation_failed");
    expect((error as FieldHypothesisApiError).message).toMatch(/SENSITIVE_LOCALITY_FORBIDDEN/);
  });

  it("maps a thrown fetch to network_error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(generateFieldHypotheses("obs-1", snapshot)).rejects.toMatchObject({ kind: "network_error" });
  });
});

describe("recordHypothesisEvidence and reads", () => {
  it("posts one evidence item and returns the updated hypothesis", async () => {
    const updated = hypothesis({ status: "UNDER_EVALUATION", evidence_balance: { supporting: 1, contradicting: 0, unknown: 0 }, evidence_state: "supporting_only" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(updated));
    vi.stubGlobal("fetch", fetchMock);
    const evidence = { stance: "SUPPORTING" as const, evidence_type: "directly_observed_visit" as const, summary: "Male bee, copulatory posture.", source_kind: "field_observation" as const, source_reference: "obs-1", recorder_subject: "auth-subject-opaque-abc123" };
    await expect(recordHypothesisEvidence("h-1", evidence)).resolves.toEqual(updated);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/field-hypotheses/h-1/evidence`);
  });

  it("refuses evidence payloads that carry locality", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const evidence = { stance: "UNKNOWN", evidence_type: "unknown", summary: "x", source_kind: "other", recorder_subject: "s", locality: "the hill" } as never;
    await expect(recordHypothesisEvidence("h-1", evidence)).rejects.toBeInstanceOf(SensitiveLocalityError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the latest set and the library from their routes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(set)).mockResolvedValueOnce(jsonResponse({ library_version: "v", templates: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await getLatestFieldHypotheses("obs-1");
    await getFieldHypothesisLibrary();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/field-observations/obs-1/hypotheses`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/field-hypotheses/library`);
  });
});

describe("locality guard and labels", () => {
  it("inspects keys case-insensitively and at any depth, never values", () => {
    expect(() => assertNoSensitiveLocality({ notes: "at -22.4, -43.0" })).not.toThrow();
    expect(() => assertNoSensitiveLocality({ meta: [{ Latitude: 1 }] })).toThrow(/meta\[0\]\.Latitude/);
    expect(() => assertNoSensitiveLocality({ localization: "en" })).not.toThrow();
  });

  it("labels classes, evidence states and cue tokens for humans without inventing new ones", () => {
    expect(hypothesisClassLabel("non_pollinating_visit")).toBe("Visitor is not an effective pollinator");
    expect(hypothesisClassLabel("some_future_class")).toBe("some future class");
    expect(evidenceStateLabel("conflicting")).toMatch(/conflict/);
    expect(cueLabel("behavior:pseudocopulation_like_contact")).toBe("behavior: pseudocopulation like contact");
  });
});
