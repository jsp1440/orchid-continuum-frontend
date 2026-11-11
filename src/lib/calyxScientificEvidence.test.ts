import { describe, expect, it } from "vitest";

import recorded from "@/lib/__fixtures__/calyxScientificEvidence.realBackend.json";
import {
  CALYX_EVIDENCE_ANSWER_HEADING,
  composeAnswerWithEvidence,
  evidenceIsVisible,
  readSavedMessageEvidence,
  readScientificEvidence,
  splitEvidenceSection,
} from "@/lib/calyxScientificEvidence";

/**
 * The fixture is recorded output of the backend branch that adds the block
 * (see its `_source` entry). Cases the backend did not produce in that run
 * (a verified result, malformed blocks, unknown statuses) are written here
 * inline and are plainly synthetic.
 */
const turns = recorded.turns;

describe("readScientificEvidence", () => {
  it("treats a missing block as absent, which is what production sends today", () => {
    for (const raw of [undefined, null]) {
      const view = readScientificEvidence(raw);
      expect(view.kind).toBe("absent");
      expect(evidenceIsVisible(view)).toBe(false);
    }
  });

  it("reads the recorded available block without changing a sentence", () => {
    const view = readScientificEvidence(turns.available.scientific_evidence);
    expect(view.kind).toBe("available");
    expect(view.species).toBe("Catasetum barbatum");
    expect(view.sentences).toEqual(turns.available.scientific_evidence.reading);
    expect(view.sentences).toHaveLength(22);
    expect(view.pollinationVerified).toBe(false);
    expect(view.provenance).toEqual({
      missionId: turns.available.scientific_evidence.mission.mission_id,
      missionState: "EVIDENCE_ONLY",
      reviewStatus: "UNAVAILABLE_NO_REASONING_LEDGER",
      publicationEligible: false,
      publicationBlockers: ["NO_REASONING_LEDGER_REVIEW_UNAVAILABLE"],
      evidencePacketId: turns.available.scientific_evidence.evidence_packet_id,
      graphState: "EVIDENCE_ONLY",
      graphCompleteness: "COMPLETE",
      resolution: "RESOLVED",
    });
    expect(view.boundary).toEqual({
      readOnly: true,
      knowledgeGraphMutation: false,
      automaticPublication: false,
      durableMissionRecord: false,
      isReviewedConclusion: false,
    });
  });

  it("keeps the pollination flag unknown when the backend did not send one", () => {
    const { pollination_verified: _dropped, ...withoutFlag } = turns.available.scientific_evidence;
    expect(readScientificEvidence(withoutFlag).pollinationVerified).toBeNull();
    // A truthy non-boolean is not a verification.
    expect(readScientificEvidence({ ...withoutFlag, pollination_verified: "true" }).pollinationVerified).toBeNull();
    expect(readScientificEvidence({ ...withoutFlag, pollination_verified: true }).pollinationVerified).toBe(true);
  });

  it("reads the recorded ambiguous-name block as not resolved, with no sentences", () => {
    const view = readScientificEvidence(turns.not_resolved.scientific_evidence);
    expect(view.kind).toBe("not_resolved");
    expect(view.species).toBe("Ophrys apifera");
    expect(view.provenance.resolution).toBe("AMBIGUOUS");
    expect(view.sentences).toEqual([]);
    expect(view.pollinationVerified).toBeNull();
    expect(view.explanation).toContain("No evidence was attached to a guessed identity.");
  });

  it("reads the recorded failed retrieval as unavailable, with its cause", () => {
    const view = readScientificEvidence(turns.unavailable.scientific_evidence);
    expect(view.kind).toBe("unavailable");
    expect(view.code).toBe("MISSION_BLOCKED");
    expect(view.species).toBe("Catasetum barbatum");
    expect(view.sentences).toEqual([]);
    expect(view.pollinationVerified).toBeNull();
  });

  it("shows a not-applicable block only when the backend explains it", () => {
    const explained = readScientificEvidence(turns.not_applicable_with_explanation.scientific_evidence);
    expect(explained.kind).toBe("not_applicable");
    expect(explained.code).toBe("MCP_SINGLE_SPECIES_POLLINATION_QUESTION_REQUIRED");
    const silent = readScientificEvidence(turns.not_applicable_silent.scientific_evidence);
    expect(silent.kind).toBe("quiet");
    expect(evidenceIsVisible(silent)).toBe(false);
  });

  it("is quiet for not_requested (recorded) and not_enabled", () => {
    expect(readScientificEvidence(turns.not_requested.scientific_evidence).kind).toBe("quiet");
    // What the backend returns when OC_BRAIN_MCP_EVIDENCE_ENABLED is unset
    // (`_base("not_enabled")` in scientific_evidence_context.py).
    const notEnabled = { ...turns.not_applicable_silent.scientific_evidence, status: "not_enabled" };
    expect(readScientificEvidence(notEnabled).kind).toBe("quiet");
  });

  it("reads the route's exception fallback, which omits two boundary flags", () => {
    // Shape of `_safe_scientific_evidence`'s except branch in speak_routes.py.
    const view = readScientificEvidence({
      schema: "oc.calyx-scientific-evidence-context.v1",
      status: "unavailable",
      reading: [],
      error: "RuntimeError",
      read_only: true,
      knowledge_graph_mutation: false,
      automatic_publication: false,
    });
    expect(view.kind).toBe("unavailable");
    expect(view.code).toBe("RuntimeError");
    expect(view.explanation).toBeNull();
    expect(view.boundary.isReviewedConclusion).toBeNull();
    expect(view.boundary.durableMissionRecord).toBeNull();
  });

  it("fails closed on an unknown status and shows none of its sentences", () => {
    const view = readScientificEvidence({ ...turns.available.scientific_evidence, status: "partially_available" });
    expect(view.kind).toBe("unrecognised");
    expect(view.status).toBe("partially_available");
    expect(view.sentences).toEqual([]);
    expect(view.pollinationVerified).toBeNull();
  });

  it.each([
    ["a string", "available"],
    ["a list", [{ status: "available" }]],
    ["a number", 7],
    ["no status", { reading: ["x"] }],
    ["a non-string status", { status: 1, reading: ["x"] }],
    ["an empty status", { status: "  ", reading: ["x"] }],
    ["another schema", { ...turns.available.scientific_evidence, schema: "oc.calyx-scientific-evidence-context.v2" }],
    ["a numeric schema", { ...turns.available.scientific_evidence, schema: 123 }],
    ["an object schema", { ...turns.available.scientific_evidence, schema: {} }],
    ["a null schema", { ...turns.available.scientific_evidence, schema: null }],
    ["a schema with stray whitespace", { ...turns.available.scientific_evidence, schema: " oc.calyx-scientific-evidence-context.v1" }],
    ["available with reading that is not a list", { ...turns.available.scientific_evidence, reading: "Subject: x" }],
  ])("fails closed on a malformed block: %s", (_label, raw) => {
    const view = readScientificEvidence(raw);
    expect(view.kind).toBe("malformed");
    expect(view.sentences).toEqual([]);
    expect(view.pollinationVerified).toBeNull();
    expect(view.species).toBeNull();
  });

  it("accepts a block that leaves the schema key out", () => {
    const { schema: _dropped, ...withoutSchema } = turns.available.scientific_evidence;
    expect(readScientificEvidence(withoutSchema).kind).toBe("available");
    expect(readScientificEvidence({ ...withoutSchema, schema: undefined }).kind).toBe("available");
  });

  it.each([" available ", "available ", "Available", "AVAILABLE", "available\n"])(
    "does not read %j as the available status",
    (status) => {
      const view = readScientificEvidence({ ...turns.available.scientific_evidence, status });
      expect(view.kind).toBe("unrecognised");
      expect(view.sentences).toEqual([]);
      expect(view.pollinationVerified).toBeNull();
    },
  );

  it("drops non-string and blank entries from reading rather than printing them", () => {
    const view = readScientificEvidence({ status: "available", reading: ["One.", 2, null, "  ", { text: "x" }, " Two. "] });
    expect(view.kind).toBe("available");
    expect(view.sentences).toEqual(["One.", "Two."]);
  });

  it("ignores wrongly typed optional fields instead of throwing", () => {
    const view = readScientificEvidence({ status: "available", reading: [], species: 5, mission: "m", evidence_packet_id: {}, read_only: "yes" });
    expect(view.kind).toBe("available");
    expect(view.species).toBeNull();
    expect(view.provenance.missionId).toBeNull();
    expect(view.provenance.evidencePacketId).toBeNull();
    expect(view.boundary.readOnly).toBeNull();
  });
});

describe("splitEvidenceSection", () => {
  it("separates the section the backend appended to the recorded answer", () => {
    const parts = splitEvidenceSection(turns.available.answer);
    expect(parts.evidenceSentences).toEqual(turns.available.scientific_evidence.reading);
    expect(parts.body).not.toContain(CALYX_EVIDENCE_ANSWER_HEADING);
    expect(parts.body.startsWith(turns.available.answer.slice(0, 40))).toBe(true);
  });

  it("leaves an answer without the section whole", () => {
    const answer = turns.not_applicable_silent.answer;
    expect(splitEvidenceSection(answer)).toEqual({ body: answer, evidenceSentences: [] });
  });

  it("leaves the text whole when prose follows the heading", () => {
    const answer = `Intro.\n\n${CALYX_EVIDENCE_ANSWER_HEADING}:\n- One.\n\nAnd a closing remark.`;
    expect(splitEvidenceSection(answer)).toEqual({ body: answer, evidenceSentences: [] });
  });

  it("does not split on a mere mention of the heading", () => {
    const answer = `As I said, ${CALYX_EVIDENCE_ANSWER_HEADING}: nothing yet.\n- a point`;
    expect(splitEvidenceSection(answer).evidenceSentences).toEqual([]);
  });

  it("does not split a heading with nothing under it", () => {
    const answer = `Intro.\n\n${CALYX_EVIDENCE_ANSWER_HEADING}:\n`;
    expect(splitEvidenceSection(answer).body).toBe(answer);
  });
});

describe("composeAnswerWithEvidence", () => {
  it("prints the recorded sentences once: in the panel, not in the answer", () => {
    const evidence = readScientificEvidence(turns.available.scientific_evidence);
    const result = composeAnswerWithEvidence(turns.available.answer, evidence);
    expect(result.answerText).not.toContain("Subject: Catasetum barbatum");
    expect(result.answerText).not.toContain(CALYX_EVIDENCE_ANSWER_HEADING);
    expect(result.evidence.sentences).toEqual(turns.available.scientific_evidence.reading);
  });

  it("keeps the answer whole when it holds a sentence the panel would not show", () => {
    const evidence = readScientificEvidence({ status: "available", reading: ["One."] });
    const answer = `Intro.\n\n${CALYX_EVIDENCE_ANSWER_HEADING}:\n- One.\n- Two, only in the text.`;
    expect(composeAnswerWithEvidence(answer, evidence).answerText).toBe(answer);
  });

  it("never lifts text from the answer into the panel when reading is empty", () => {
    // The reply provider writes the answer; a model can be prompted to write
    // the heading. Text under it is not the backend's records.
    const answer = "A\n\nWhat the Continuum's evidence records show:\n- LLM INVENTED: verified pollinator is Bee";
    const result = composeAnswerWithEvidence(answer, readScientificEvidence({ status: "available", reading: [] }));
    expect(result.evidence.sentences).toEqual([]);
    expect(result.answerText).toBe(answer);
  });

  it("never shows a sentence that was not in reading, whatever the answer says", () => {
    const answer = `Intro.\n\n${CALYX_EVIDENCE_ANSWER_HEADING}:\n- One.\n- LLM INVENTED.`;
    for (const reading of [[], ["One."], ["One.", 7, null, { text: "LLM INVENTED." }], [42, null]]) {
      const result = composeAnswerWithEvidence(answer, readScientificEvidence({ status: "available", reading }));
      expect(result.evidence.sentences).not.toContain("LLM INVENTED.");
      expect(result.evidence.sentences.every((sentence) => reading.includes(sentence))).toBe(true);
      // The invented line is not hidden either: it stays where the provider wrote it.
      expect(result.answerText).toBe(answer);
    }
  });

  it("returns the view it was given, unchanged, in every case", () => {
    const cases = [
      readScientificEvidence(turns.available.scientific_evidence),
      readScientificEvidence({ status: "available", reading: [] }),
      readSavedMessageEvidence(turns.available.saved_message_metadata),
      readScientificEvidence(turns.not_resolved.scientific_evidence),
    ];
    for (const view of cases) expect(composeAnswerWithEvidence(turns.available.answer, view).evidence).toBe(view);
  });

  it("keeps the answer whole when no block came with it", () => {
    const answer = turns.available.answer;
    const result = composeAnswerWithEvidence(answer, readScientificEvidence(undefined));
    expect(result.answerText).toBe(answer);
    expect(evidenceIsVisible(result.evidence)).toBe(false);
  });

  it("keeps the answer whole when the block could not be read", () => {
    const answer = turns.available.answer;
    const result = composeAnswerWithEvidence(answer, readScientificEvidence({ status: "partially_available" }));
    expect(result.answerText).toBe(answer);
  });

  it.each(["not_resolved", "unavailable", "not_applicable_with_explanation"] as const)(
    "moves the recorded %s explanation out of the answer, once",
    (name) => {
      const turn = turns[name];
      const explanation = turn.scientific_evidence.explanation as string;
      expect(turn.answer.endsWith(explanation)).toBe(true);
      const result = composeAnswerWithEvidence(turn.answer, readScientificEvidence(turn.scientific_evidence));
      expect(result.answerText).not.toContain(explanation);
      expect(result.answerText.length).toBeGreaterThan(0);
      expect(result.evidence.explanation).toBe(explanation);
    },
  );

  it("leaves the answer alone when the explanation is not its last paragraph", () => {
    const evidence = readScientificEvidence({ status: "unavailable", explanation: "It failed." });
    expect(composeAnswerWithEvidence("It failed. But more follows.", evidence).answerText).toBe("It failed. But more follows.");
    expect(composeAnswerWithEvidence("Prefix It failed.", evidence).answerText).toBe("Prefix It failed.");
  });
});

describe("readSavedMessageEvidence", () => {
  it("is absent for a saved message with no evidence keys (every message in production today)", () => {
    expect(readSavedMessageEvidence(undefined).kind).toBe("absent");
    expect(readSavedMessageEvidence({ provider: "deterministic-governed" }).kind).toBe("absent");
    expect(readSavedMessageEvidence({ scientific_evidence_status: null }).kind).toBe("absent");
  });

  it("rebuilds only what the recorded saved message keeps", () => {
    const view = readSavedMessageEvidence(turns.available.saved_message_metadata);
    expect(view.kind).toBe("available");
    expect(view.origin).toBe("saved_message");
    expect(view.provenance.missionId).toBe(turns.available.scientific_evidence.mission.mission_id);
    expect(view.provenance.evidencePacketId).toBe(turns.available.scientific_evidence.evidence_packet_id);
    // Not stored on the message, so not known on reload.
    expect(view.species).toBeNull();
    expect(view.pollinationVerified).toBeNull();
    expect(view.provenance.reviewStatus).toBeNull();
    expect(view.boundary.isReviewedConclusion).toBeNull();
    // The sentences are only in the answer text, where they cannot be verified
    // as the records' wording, so they are neither rebuilt nor removed.
    const result = composeAnswerWithEvidence(turns.available.answer, view);
    expect(result.evidence.sentences).toEqual([]);
    expect(result.answerText).toBe(turns.available.answer);
  });

  it("does not lift invented text into the panel on reload either", () => {
    const answer = "A\n\nWhat the Continuum's evidence records show:\n- LLM INVENTED: verified pollinator is Bee";
    const result = composeAnswerWithEvidence(answer, readSavedMessageEvidence({ scientific_evidence_status: "available" }));
    expect(result.evidence.sentences).toEqual([]);
    expect(result.answerText).toBe(answer);
  });

  it("requires the saved status to match exactly", () => {
    expect(readSavedMessageEvidence({ scientific_evidence_status: " available " }).kind).toBe("unrecognised");
    expect(readSavedMessageEvidence({ scientific_evidence_status: "  " }).kind).toBe("absent");
    expect(readSavedMessageEvidence({ scientific_evidence_status: 1 }).kind).toBe("absent");
  });

  it("is quiet for saved turns where the path was off, unasked or did not apply", () => {
    for (const status of ["not_enabled", "not_requested", "not_applicable"]) {
      expect(readSavedMessageEvidence({ scientific_evidence_status: status }).kind).toBe("quiet");
    }
    expect(readSavedMessageEvidence(turns.not_requested.saved_message_metadata).kind).toBe("quiet");
  });

  it("keeps not_resolved and unavailable distinct on reload and leaves the answer whole", () => {
    const unresolved = readSavedMessageEvidence(turns.not_resolved.saved_message_metadata);
    expect(unresolved.kind).toBe("not_resolved");
    expect(composeAnswerWithEvidence(turns.not_resolved.answer, unresolved).answerText).toBe(turns.not_resolved.answer);
    expect(readSavedMessageEvidence(turns.unavailable.saved_message_metadata).kind).toBe("unavailable");
  });

  it("fails closed on an unknown saved status", () => {
    expect(readSavedMessageEvidence({ scientific_evidence_status: "something_new" }).kind).toBe("unrecognised");
  });
});
