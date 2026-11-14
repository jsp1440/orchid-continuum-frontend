import { describe, expect, it } from "vitest";

import { evidenceOf, fixtures } from "@/lib/__fixtures__/calyxScientificEvidence";
import {
  CALYX_EVIDENCE_ANSWER_HEADING,
  composeAnswerWithEvidence,
  readScientificEvidence,
} from "@/lib/calyxScientificEvidence";
import { doiHref, readStructuredEvidence, type EvidenceSubject, type RecordsSection } from "@/lib/calyxStructuredEvidence";

/** Fixtures are real captured responses (see __fixtures__/calyxScientificEvidence/index.ts). Inline cases are synthetic. */

function structured(name: string) {
  const view = readScientificEvidence(evidenceOf(name));
  if (!view.structured) throw new Error(`${name}: no structured part`);
  return view.structured;
}
function readable(subject: EvidenceSubject) {
  if (subject.unreadable) throw new Error("subject unreadable");
  return subject;
}
function sectionOf(subject: EvidenceSubject, kind: string): Extract<RecordsSection, { unreadable: false }> {
  const found = readable(subject).sections.find((one) => one.kind === kind);
  if (!found || found.unreadable) throw new Error(`no readable ${kind}`);
  return found;
}

describe("compatibility: the base reader still accepts every real response", () => {
  it.each(Object.keys(fixtures))("%s is read, never malformed or unrecognised", (name) => {
    const view = readScientificEvidence(evidenceOf(name));
    expect(["malformed", "unrecognised"]).not.toContain(view.kind);
  });
});

describe("subjects and scopes", () => {
  it("reads a single-subject turn from subjects[0], with its sentences unchanged", () => {
    const s = structured("pollination-species");
    expect(s.subjects).toHaveLength(1);
    const subject = readable(s.subjects[0]);
    expect(subject.label).toBe("Ophrys sphegodes");
    expect(subject.kgNodeId).toBe(52151);
    const raw = evidenceOf("pollination-species") as { reading: string[] };
    expect(subject.sentences).toEqual(raw.reading);
    expect(s.topics).toEqual(["pollination"]);
  });

  it("reads two taxa as two subjects and the comparison lines", () => {
    const s = structured("distribution-two-species");
    expect(s.subjects.map((x) => readable(x).label)).toEqual(["Ophrys sphegodes", "Chloraea bletioides"]);
    expect(s.comparison).toHaveLength(1);
    // The turn's own top-level reading is empty; the sentences live on the subjects.
    expect(readScientificEvidence(evidenceOf("distribution-two-species")).sentences).toEqual([]);
    expect(readable(s.subjects[0]).sentences.length).toBeGreaterThan(0);
  });

  it("keeps the two scopes of a variety turn separate, with the returned note on the species scope", () => {
    const s = structured("pollination-variety-context");
    expect(s.isSubtaxonTurn).toBe(true);
    const [direct, context] = s.subjects.map(readable);
    expect(direct.scope).toBe("direct_subtaxon");
    expect(direct.label).toBe("Ophrys sphegodes var. provincialis");
    expect(context.scope).toBe("contextual_parent_species");
    expect(context.label).toBe("Ophrys sphegodes");
    const raw = evidenceOf("pollination-variety-context") as { contextual_note: string };
    expect(context.contextNote).toBe(raw.contextual_note);
    expect(direct.contextNote).toBeNull();
    expect(direct.sections.some((x) => x.kind === "relationships")).toBe(false);
    expect(context.sections.some((x) => x.kind === "relationships")).toBe(true);
    expect(s.notices).toHaveLength(1);
  });

  it("reads asked_as and also_asked_as", () => {
    expect(readable(structured("synonym-resolved-distribution").subjects[0]).askedAs).toBe("Asarca bletioides");
    const two = readable(structured("synonym-two-names-one-species").subjects[0]);
    expect(two.askedAs).toBe("Asarca bletioides");
    expect(two.alsoAskedAs).toEqual(["Asarca affinis"]);
    expect(two.sections.filter((x) => x.kind === "synonym_resolution")).toHaveLength(2);
  });

  it.each(["synonym-ambiguous", "synonym-accepted-taxon-is-a-variety", "synonym-with-infraspecific-word", "name-not-held"])(
    "%s is not_resolved with the returned explanation and no records",
    (name) => {
      const view = readScientificEvidence(evidenceOf(name));
      expect(view.kind).toBe("not_resolved");
      expect(view.explanation).not.toBeNull();
      const subject = readable(structured(name).subjects[0]);
      expect(subject.explanation).toBe(view.explanation);
      expect(subject.sections.filter((x) => !["synonym_resolution"].includes(x.kind))).toEqual([]);
      expect(subject.sentences).toEqual([]);
    },
  );
});

describe("records", () => {
  it("keeps area markers exactly as the source wrote them", () => {
    const areas = sectionOf(structured("distribution-species").subjects[0], "distribution").items.map((x) => x.text);
    expect(areas).toContain("?Portugal");
    const raw = evidenceOf("distribution-species") as { subjects: Array<{ evidence: { distribution: { areas: Array<{ as_written_by_source: string }> } } }> };
    expect(areas).toEqual(raw.subjects[0].evidence.distribution.areas.map((x) => x.as_written_by_source));
    expect(sectionOf(structured("distribution-species").subjects[0], "distribution").counts).toBe("18 of 18 shown");
  });

  it("reports N of M for a truncated synonym list, and the text after each name verbatim", () => {
    const section = sectionOf(structured("synonymy-list-truncated").subjects[0], "synonymy");
    expect(section.counts).toBe("25 of 31 shown");
    // The fixture is an excerpt: it lists 2 of the 25 synonyms the real response carried; the counts are the response's own.
    expect(section.items).toHaveLength(2);
    expect(section.items[0].text).toBe("Arachnites aranifera (Huds.) Bubani");
    expect(section.items[0].detail).toBe("[Fl. Pyren. [Bubani] 4: 48 (1901)]");
    expect(section.state).toBe("documented");
    expect(section.review).toBe("UNREVIEWED");
  });

  it("carries a conservation note verbatim and says nothing when there is none", () => {
    const note = sectionOf(structured("conservation-note").subjects[0], "conservation");
    expect(note.items.map((x) => x.text)).toEqual(["IUCN Ex/E"]);
    const none = sectionOf(structured("conservation-no-note").subjects[0], "conservation");
    expect(none.items).toEqual([]);
    expect(none.state).toBeNull();
    expect(none.review).toBeNull();
    expect(none.statements[0].text).toMatch(/^Nothing retrieved in this store/);
  });

  it("reads held-back records as a count and the returned reason text only", () => {
    const section = sectionOf(structured("pollination-quarantined").subjects[0], "held_back");
    expect(section.items).toHaveLength(1);
    expect(section.items[0].detail).toBe("2 held back");
    expect(section.items[0].text).toMatch(/held back pending review/);
  });

  it("does not read any other field of a held-back record, even a identifying one", () => {
    const raw = {
      status: "available",
      reading: ["x"],
      subjects: [{ species: "A b", status: "available", reading: ["x"], evidence: { held_back: [{ count: 3, statement: "3 records are held back.", partner: "SECRET PARTNER", edge_ids: [999], citation_text: "SECRET CITATION" }] } }],
    };
    const s = readStructuredEvidence(raw);
    expect(JSON.stringify(s)).not.toContain("SECRET");
    expect(JSON.stringify(s)).not.toContain("999");
  });

  it("reads not_retrieved as the backend's own sentences, never as an absence", () => {
    const section = sectionOf(structured("pollination-not-ingested").subjects[0], "not_retrieved");
    expect(section.items.map((x) => x.text).every((t) => t.startsWith("Not yet ingested"))).toBe(true);
    expect(sectionOf(structured("pollination-not-ingested").subjects[0], "not_retrieved").state).toBeNull();
    expect(readable(structured("pollination-not-ingested").subjects[0]).sections.some((x) => x.kind === "relationships")).toBe(false);
  });

  it("reads cited relationships with citation, DOI and review state as returned", () => {
    const rel = sectionOf(structured("pollination-species").subjects[0], "relationships");
    expect(rel.items.length).toBeGreaterThan(0);
    const first = rel.items[0];
    expect(first.citation).toMatch(/^Saul-Gershenz/);
    expect(first.doi).toBe("10.1073/pnas.0603901103");
    expect(first.review).toBe("A source asserts this; the Continuum has not reviewed it");
    expect(first.state).toBe("observed");
  });

  it("reads mycorrhizal statements with their DOI", () => {
    const section = sectionOf(structured("mycorrhiza-species").subjects[0], "mycorrhiza");
    expect(section.items.map((x) => x.doi)).toEqual(["10.1016/j.sajb.2019.06.029", "10.1016/j.sajb.2019.06.029"]);
  });
});

describe("DOI links", () => {
  it.each([
    ["10.1073/pnas.0603901103", "https://doi.org/10.1073/pnas.0603901103"],
    ["10.1111/j.1365-2435.2010.01737.x", "https://doi.org/10.1111/j.1365-2435.2010.01737.x"],
    ["javascript:alert(1)", null],
    ["https://evil.example/10.1234/x", null],
    ["10.12/short", null],
    ["10.1234/has space", null],
    [null, null],
  ])("%s", (doi, href) => expect(doiHref(doi)).toBe(href));
});

describe("fail closed, part by part", () => {
  const good = () => structuredClone(evidenceOf("pollination-species")) as Record<string, any>;

  it("an unreadable part says so; it does not read as an empty part and does not blank the sentences", () => {
    const raw = good();
    raw.subjects[0].evidence.relationships = "not a list";
    const view = readScientificEvidence(raw);
    expect(view.kind).toBe("available");
    expect(view.sentences).toEqual(raw.reading);
    const subject = readable(view.structured!.subjects[0]);
    expect(subject.sections.find((x) => x.kind === "relationships")).toEqual({ unreadable: true, kind: "relationships" });
    expect(subject.sections.find((x) => x.kind === "not_retrieved")?.unreadable).toBe(false);
  });

  it.each([
    ["a record in the list is not an object", (r: any) => { r.subjects[0].evidence.relationships[0] = 5; }],
    ["a statement is not text", (r: any) => { r.subjects[0].evidence.relationships[0].statement = 5; }],
    ["a citation is a number", (r: any) => { r.subjects[0].evidence.relationships[0].citation_text = 5; }],
    ["held_back is an object", (r: any) => { r.subjects[0].evidence.held_back = {}; }],
  ])("relationships/held_back: %s", (_label, mutate) => {
    const raw = good();
    mutate(raw);
    const kinds = readable(readScientificEvidence(raw).structured!.subjects[0]).sections.filter((x) => x.unreadable).map((x) => x.kind);
    expect(kinds.length).toBeGreaterThan(0);
  });

  it("an unreadable distribution, conservation or synonymy part is marked, not dropped", () => {
    for (const [name, key] of [["distribution-species", "distribution"], ["conservation-note", "conservation"], ["synonymy-list-truncated", "synonymy"]] as const) {
      const raw = structuredClone(evidenceOf(name)) as Record<string, any>;
      raw.subjects[0].evidence[key] = { areas: [1], notes: [1], synonyms: [1] };
      const section = readable(readScientificEvidence(raw).structured!.subjects[0]).sections.find((x) => x.kind === key);
      expect(section?.unreadable).toBe(true);
    }
  });

  it("an unreadable subject is marked and its sibling is still read", () => {
    const raw = structuredClone(evidenceOf("distribution-two-species")) as Record<string, any>;
    raw.subjects[0] = "oops";
    const s = readScientificEvidence(raw).structured!;
    expect(s.subjects[0]).toEqual({ unreadable: true });
    expect(readable(s.subjects[1]).label).toBe("Chloraea bletioides");
  });

  it("unreadable topics, notices and comparison are flagged, not read as empty", () => {
    const raw = structuredClone(evidenceOf("distribution-two-species")) as Record<string, any>;
    raw.topics = "distribution";
    raw.notices = [1];
    raw.comparison = { lines: "x" };
    const s = readScientificEvidence(raw).structured!;
    expect([s.topicsUnreadable, s.noticesUnreadable, s.comparisonUnreadable]).toEqual([true, true, true]);
    expect(s.topics).toEqual([]);
  });

  it("an unknown status or another schema yields no structured part at all", () => {
    expect(readScientificEvidence({ ...(good() as object), status: "partially_available" }).structured).toBeNull();
    expect(readScientificEvidence({ ...(good() as object), schema: "oc.calyx-scientific-evidence-context.v2" }).structured).toBeNull();
  });

  it("a block of the pre-#2420 shape (no topics, no subjects) still reads, with nothing structured", () => {
    const s = readScientificEvidence({ status: "available", reading: ["One."], species: "A b", pollination_verified: false }).structured!;
    expect(s.subjects).toEqual([]);
    expect(s.topics).toEqual([]);
  });

  it("no structured part for statuses that carry none", () => {
    for (const name of ["not-applicable-general", "research-mode-never"]) expect(readScientificEvidence(evidenceOf(name)).structured).toBeNull();
  });
});

describe("answer text: the evidence section leaves the answer only when the panel prints those sentences", () => {
  const section = (sentences: string[]) => `Intro.\n\n${CALYX_EVIDENCE_ANSWER_HEADING}:\n${sentences.map((s) => `- ${s}`).join("\n")}`;

  it("strips for a readable single-subject turn (real capture)", () => {
    const name = "pollination-species";
    // The fixtures omit the answer text, so the answer is built the way the backend builds it: prose, then the heading and the reading.
    const view = readScientificEvidence(evidenceOf(name));
    const result = composeAnswerWithEvidence(section(view.sentences), view);
    expect(result.answerText).toBe("Intro.");
  });

  it("leaves the answer whole when the block is unreadable, unknown or another schema", () => {
    const answer = section(["One."]);
    const raw = evidenceOf("pollination-species") as Record<string, unknown>;
    for (const bad of [{ ...raw, status: "partially_available" }, { ...raw, schema: "v2" }, { ...raw, reading: "x" }, "text"]) {
      expect(composeAnswerWithEvidence(answer, readScientificEvidence(bad)).answerText).toBe(answer);
    }
  });

  it("leaves the answer whole when a subject could not be read, even if the top-level sentences match", () => {
    const sentences = ["One.", "Two."];
    const raw = { status: "available", reading: sentences, subjects: ["oops"] };
    const view = readScientificEvidence(raw);
    expect(view.sentences).toEqual(sentences);
    expect(composeAnswerWithEvidence(section(sentences), view).answerText).toBe(section(sentences));
  });

  it("strips when all subjects are readable and the sentences match", () => {
    const sentences = ["One.", "Two."];
    const raw = { status: "available", reading: sentences, subjects: [{ species: "A b", reading: sentences, evidence: {} }] };
    expect(composeAnswerWithEvidence(section(sentences), readScientificEvidence(raw)).answerText).toBe("Intro.");
  });

  it("leaves the answer whole when the turn's sentences live only on the subjects (several taxa)", () => {
    const answer = section(["Only in the text."]);
    expect(composeAnswerWithEvidence(answer, readScientificEvidence(evidenceOf("distribution-two-species"))).answerText).toBe(answer);
  });

  it("leaves the variety turn's answer whole (the species-scope sentences are not in the top-level reading)", () => {
    const answer = section(["Species-scope sentence that is not in the turn's top-level reading."]);
    expect(composeAnswerWithEvidence(answer, readScientificEvidence(evidenceOf("pollination-variety-context"))).answerText).toBe(answer);
  });
});
