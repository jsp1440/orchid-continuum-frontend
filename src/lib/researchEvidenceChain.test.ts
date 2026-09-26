/**
 * The Research Station evidence chain, checked against payloads the backend
 * really produces.
 *
 * `__fixtures__/researchEvidenceChain.realBackend.json` is captured verbatim
 * from orchid-calyx-backend main (c37ff0ca6) through FastAPI TestClient on
 * `app.main`, using the repo's own fakes (SQLite research/ledger tables, a
 * stubbed canonical-reference validator, MemoryCandidateRepository). Meeting
 * it found that the station rendered every evidence link as a bare id, filed
 * a CONTRADICTS link under "what the Continuum holds" as if it supported the
 * question, and never read the candidate, its conflict, or the ledger that
 * cites it — although every one of those routes exists.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import literature from "./__fixtures__/literaturePaper.realBackend.json";
import realBackend from "./__fixtures__/researchEvidenceChain.realBackend.json";
import { fetchLiteratureIndex } from "./literatureIndex";
import { claimStanding, type LiteraturePaper } from "./literaturePaper";
import type { LedgerRevision } from "./reasoningLedger";
import {
  candidateSources,
  candidateStanding,
  candidateStatement,
  conflictsForCandidate,
  fetchCandidateKnowledge,
  ledgerCitations,
  listProjectReasoningLedgers,
  type CandidateConflict,
  type CandidateKnowledgeRecord,
} from "./researchEvidenceChain";
import { buildResearchDossier, type ResearchEvidenceLink, type ResearchProject } from "./researchStation";

const superseded = realBackend.candidate_detail["3"] as unknown as CandidateKnowledgeRecord;
const current = realBackend.candidate_detail["8"] as unknown as CandidateKnowledgeRecord;
const conflicts = realBackend.candidate_conflicts.items as unknown as CandidateConflict[];
const ledgers = realBackend.project_reasoning_ledgers.items as unknown as LedgerRevision[];
const links = realBackend.project_evidence.items as unknown as ResearchEvidenceLink[];

afterEach(() => vi.unstubAllGlobals());

describe("captured project evidence links", () => {
  it("separates the CONTRADICTS link from support in the dossier", () => {
    const dossier = buildResearchDossier({
      project: realBackend.project as unknown as ResearchProject,
      taxa: [],
      documents: [],
      evidence: links,
      notes: [],
    });
    expect(dossier.contradictingEvidence.map((item) => item.evidence_id)).toEqual(["8"]);
    expect(dossier.evidence).toHaveLength(2);
  });
});

describe("captured candidate-knowledge records", () => {
  it("states review standing verbatim and never as accepted or published", () => {
    expect(candidateStanding(current)).toEqual(["Human review required", "Not published", "Current version"]);
    expect(candidateStanding(superseded)).toEqual([
      "Human review required",
      "Not published",
      "Superseded — no longer the active candidate",
    ]);
    for (const text of [...candidateStanding(current), ...candidateStanding(superseded)]) {
      expect(text).not.toMatch(/accepted|verified|approved/i);
    }
  });

  it("renders the extracted claim and its literature anchor", () => {
    expect(candidateStatement(current)).toBe("masdevallia veitchiana · flower color · red");
    expect(candidateSources(current)).toEqual([
      {
        label: "literature paper #2 · revision 2 · page 3",
        quote: "Masdevallia veitchiana has red flowers.",
        policy: "full text allowed",
      },
    ]);
  });

  it("withholds the quote when the display policy does not allow it", () => {
    const restricted = {
      ...current,
      evidence: current.evidence?.map((link) => ({ ...link, display_policy: "METADATA_ONLY" })),
    };
    expect(candidateSources(restricted)[0].quote).toBeNull();
  });

  it("finds the open conflict between the two colour claims", () => {
    expect(conflictsForCandidate(conflicts, "3")).toEqual(conflicts);
    expect(conflictsForCandidate(conflicts, "8")[0].state).toBe("OPEN");
  });
});

describe("captured project reasoning ledgers", () => {
  it("resolves the ledger entry that cites each candidate, with its uncertainty", () => {
    const [support] = ledgerCitations(ledgers, "3");
    expect(support.ledgerTitle).toBe("Flower colour reasoning");
    expect(support.ledgerVersion).toBe(3);
    expect(support.ledgerStatus).toBe("draft");
    expect(support.entry.kind).toBe("support");
    expect(support.entry.uncertainty?.unresolved_assumptions).toEqual(["Colour not photographically calibrated"]);
    const [counter] = ledgerCitations(ledgers, "8");
    expect(counter.entry.kind).toBe("counterevidence");
    expect(counter.entry.uncertainty).toBeNull();
    expect(ledgerCitations(ledgers, "999")).toEqual([]);
  });

  it("matches the exact revision payload for the same ledger", () => {
    expect(realBackend.ledger_revision.revision.ledger_fingerprint).toBe(ledgers[0].ledger_fingerprint);
  });
});

describe("clients call the routes the backend serves", () => {
  it("reads the candidate and project-ledger routes", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes("/reasoning-ledgers") ? realBackend.project_reasoning_ledgers : current,
    ), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchCandidateKnowledge("8");
    await listProjectReasoningLedgers(realBackend.project.project_id);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/candidate-knowledge\/candidates\/8$/);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(
      new RegExp(`/api/research/projects/${realBackend.project.project_id}/reasoning-ledgers$`),
    );
  });
});

describe("captured literature payloads (main c37ff0ca6)", () => {
  it("reads the paper list the backend serves", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(literature.papers), { status: 200 })));
    const index = await fetchLiteratureIndex();
    expect(index.papers[0]).toMatchObject({ readable: true, claim_count: 3, evidence_count: 3, review_decision_count: 0 });
    expect(index.unreadable_count).toBe(0);
  });

  it("joins each claim to its normalized record and blocked publication decision", () => {
    const paper = literature.paper as unknown as LiteraturePaper;
    for (const claim of paper.claims ?? []) {
      expect(claimStanding(claim, paper)).toEqual({
        polarity: "uncertain",
        recordReviewStatus: "unreviewed",
        publicationStatus: "blocked",
        publicationReasons: ["awaiting_review"],
      });
    }
    expect(claimStanding({ claim_id: "absent", statement: "x" }, paper)).toEqual({
      polarity: null, recordReviewStatus: null, publicationStatus: null, publicationReasons: [],
    });
  });
});
