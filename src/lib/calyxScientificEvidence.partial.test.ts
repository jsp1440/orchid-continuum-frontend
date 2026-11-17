import { describe, expect, it } from "vitest";

import produced from "@/lib/__fixtures__/calyxScientificEvidence.partialProducedByBackend.json";
import recorded from "@/lib/__fixtures__/calyxScientificEvidence.realBackend.json";
import {
  CALYX_EVIDENCE_ANSWER_HEADING,
  composeAnswerWithEvidence,
  evidenceIsVisible,
  readSavedMessageEvidence,
  readScientificEvidence,
} from "@/lib/calyxScientificEvidence";

/**
 * Status `partial` (backend contract `contracts/oc-scientific-evidence-block.v1.json`):
 * something was read and something was not. The fixture is the block the
 * backend's own code produces (see its `_source`); it was not captured from a
 * served turn. Every other shape here is written inline and is synthetic.
 */
const block = produced.block;

describe("readScientificEvidence: status partial", () => {
  it("reads the backend-produced partial block like an available one and keeps that part was not read", () => {
    const view = readScientificEvidence(block);
    expect(view.kind).toBe("available");
    expect(view.status).toBe("partial");
    expect(view.partial).toBe(true);
    expect(evidenceIsVisible(view)).toBe(true);
    expect(view.species).toBe("Vanda coerulea");
    expect(view.sentences).toEqual(block.reading);
    expect(view.provenance.graphCompleteness).toBe("INCOMPLETE");
    expect(view.readGapsUnreadable).toBe(false);
    expect(view.readGaps).toEqual(block.read_gaps.map((gap) => ({ component: gap.component, reason: gap.reason, statement: gap.statement })));
    expect(view.readGaps.map((gap) => gap.reason)).toEqual(["TIMEOUT", "TIMEOUT"]);
  });

  it("still shows what the block says was not retrieved, per taxon, from the structured part", () => {
    const view = readScientificEvidence(block);
    const subject = view.structured?.subjects[0];
    expect(subject && !subject.unreadable ? subject.status : null).toBe("partial");
    const notRetrieved = subject && !subject.unreadable ? subject.sections.find((section) => section.kind === "not_retrieved") : undefined;
    expect(notRetrieved && !notRetrieved.unreadable ? notRetrieved.items.map((one) => one.text) : []).toEqual(
      block.evidence.not_retrieved.map((entry) => entry.statement),
    );
  });

  it("is not a property of an available block", () => {
    const view = readScientificEvidence(recorded.turns.available.scientific_evidence);
    expect(view.kind).toBe("available");
    expect(view.partial).toBe(false);
    expect(view.readGaps).toEqual([]);
  });

  it("fails closed on gaps it cannot read, and still says the block is partial", () => {
    for (const read_gaps of ["graph:cited", { component: "graph:cited" }, [42], [{}], [{ component: 7, reason: null }]]) {
      const view = readScientificEvidence({ ...block, read_gaps });
      expect(view.kind).toBe("available");
      expect(view.partial).toBe(true);
      expect(view.readGaps).toEqual([]);
      expect(view.readGapsUnreadable).toBe(true);
    }
  });

  it("accepts a gap that carries a reason code without a sentence, and a partial block that lists none", () => {
    const coded = readScientificEvidence({ ...block, read_gaps: [{ component: "graph:cited", reason: "BUSY" }] });
    expect(coded.readGaps).toEqual([{ component: "graph:cited", reason: "BUSY", statement: null }]);
    expect(coded.readGapsUnreadable).toBe(false);
    const withoutGaps: Record<string, unknown> = { ...block };
    delete withoutGaps.read_gaps;
    const bare = readScientificEvidence(withoutGaps);
    expect(bare.partial).toBe(true);
    expect(bare.readGaps).toEqual([]);
    expect(bare.readGapsUnreadable).toBe(false);
  });

  it("does not show sentences from a partial block whose reading is not a list", () => {
    const view = readScientificEvidence({ ...block, reading: "Subject: Vanda coerulea" });
    expect(view.kind).toBe("malformed");
    expect(view.partial).toBe(false);
    expect(view.sentences).toEqual([]);
  });

  it("matches the status exactly and keeps unknown statuses unrecognised", () => {
    for (const status of ["Partial", " partial", "partially_available", "mostly_available"]) {
      const view = readScientificEvidence({ ...block, status });
      expect(view.kind).toBe("unrecognised");
      expect(view.partial).toBe(false);
      expect(view.sentences).toEqual([]);
    }
  });
});

describe("composeAnswerWithEvidence: status partial", () => {
  const view = readScientificEvidence(block);
  const section = `\n\n${CALYX_EVIDENCE_ANSWER_HEADING}:\n${block.reading.map((line) => `- ${line}`).join("\n")}`;

  it("removes the appended section only when the panel prints every sentence of it, as for an available block", () => {
    expect(composeAnswerWithEvidence(`The reply.${section}`, view).answerText).toBe("The reply.");
    const longer = `The reply.${section}\n- A sentence the block does not carry.`;
    expect(composeAnswerWithEvidence(longer, view).answerText).toBe(longer);
  });
});

describe("readSavedMessageEvidence: status partial", () => {
  it("keeps that the turn was partial and invents no gap", () => {
    const view = readSavedMessageEvidence({ scientific_evidence_status: "partial", scientific_evidence_mission_id: "m-1" });
    expect(view.kind).toBe("available");
    expect(view.status).toBe("partial");
    expect(view.partial).toBe(true);
    expect(view.readGaps).toEqual([]);
    expect(view.sentences).toEqual([]);
    expect(view.provenance.missionId).toBe("m-1");
  });
});
