import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CalyxSynthesisStructure } from "@/lib/calyxWorkspace";
import type { ResearchStationDossier } from "@/lib/researchStation";
import {
  ResearchStationQuestionMissing,
  buildResearchStationTurnContext,
  groupClaimCoverage,
  hasUnresolvedConflict,
  runResearchStationSynthesis,
  synthesisGaps,
} from "@/lib/researchStationSynthesis";

const createConversation = vi.hoisted(() => vi.fn());
const sendTurn = vi.hoisted(() => vi.fn());

vi.mock("@/lib/calyxWorkspace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calyxWorkspace")>()),
  createCalyxConversation: createConversation,
  sendCalyxTurn: sendTurn,
}));

const dossier = (overrides: Partial<ResearchStationDossier> = {}): ResearchStationDossier =>
  ({
    project: {
      project_id: "proj-1",
      title: "Velamen and epiphytic water capture",
      research_question: "Does velamen thickness track drought tolerance?",
      status: "ACTIVE",
    },
    subject: { taxon_id: "Phalaenopsis amabilis", relationship: "SUBJECT" },
    comparisons: [],
    context: [],
    supporting: [],
    conflicts: [],
    methods: [],
    evidence: [],
    openQuestions: [],
    evidenceEmpty: true,
    ...overrides,
  }) as ResearchStationDossier;

const structure = (
  overrides: Partial<CalyxSynthesisStructure> = {},
): CalyxSynthesisStructure => ({
  generative: true,
  claim_coverage: [],
  missing_evidence: [],
  ...overrides,
});

beforeEach(() => {
  createConversation.mockReset();
  sendTurn.mockReset();
  createConversation.mockResolvedValue({ conversation_id: "conv-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("research station turn context", () => {
  it("carries the project's own question, never an invented one", () => {
    const context = buildResearchStationTurnContext(dossier()) as {
      route_context: Record<string, unknown>;
    };
    expect(context.route_context.question).toContain(
      "Does velamen thickness track drought tolerance?",
    );
  });

  it("marks the question as interaction context and not evidence", () => {
    const context = buildResearchStationTurnContext(dossier()) as {
      route_context: Record<string, unknown>;
    };
    expect(context.route_context.question_is_evidence).toBe(false);
    expect(context.route_context.question_source).toBe("research_project");
  });

  it("carries canonical taxon and project identity and nothing else", () => {
    const context = buildResearchStationTurnContext(dossier()) as Record<string, unknown>;
    const routeContext = context.route_context as Record<string, unknown>;
    expect(context.project_id).toBe("proj-1");
    expect(routeContext.featured_taxon).toEqual({
      rank: "TAXON",
      accepted_name: "Phalaenopsis amabilis",
    });
    expect(Object.keys(routeContext).sort()).toEqual([
      "featured_taxon",
      "origin",
      "question",
      "question_is_evidence",
      "question_source",
    ]);
  });

  it("refuses to build a turn when the project records no question", () => {
    expect(() =>
      buildResearchStationTurnContext(
        dossier({ project: { ...dossier().project, research_question: null } }),
      ),
    ).toThrow(ResearchStationQuestionMissing);
  });
});

describe("running the governed synthesis", () => {
  it("asks the governed path explicitly rather than letting the casual heuristic decide", async () => {
    sendTurn.mockResolvedValue({
      conversation_id: "conv-1",
      answer: "An integrated answer.",
      synthesis_structure: structure(),
    });
    await runResearchStationSynthesis(dossier());
    expect(sendTurn.mock.calls[0][1].research_mode).toBe("always");
  });

  it("returns the backend answer verbatim and composes nothing locally", async () => {
    sendTurn.mockResolvedValue({
      conversation_id: "conv-1",
      answer: "The evidence points this way without settling it.",
      synthesis_structure: structure(),
    });
    const result = await runResearchStationSynthesis(dossier());
    expect(result.answer).toBe("The evidence points this way without settling it.");
  });

  it("returns a null structure rather than inventing one on an older backend", async () => {
    sendTurn.mockResolvedValue({ conversation_id: "conv-1", answer: "Answer." });
    const result = await runResearchStationSynthesis(dossier());
    expect(result.structure).toBeNull();
    // Unknown composer must not be reported as generative reasoning.
    expect(result.degraded).toBe(true);
  });

  it("reports a composed answer as degraded", async () => {
    sendTurn.mockResolvedValue({
      conversation_id: "conv-1",
      answer: "Answer.",
      synthesis_structure: structure({ generative: false }),
    });
    expect((await runResearchStationSynthesis(dossier())).degraded).toBe(true);
  });

  it("preserves the conversation so a follow-up resolves against this turn", async () => {
    sendTurn.mockResolvedValue({
      conversation_id: "conv-99",
      answer: "Answer.",
      synthesis_structure: structure(),
    });
    expect((await runResearchStationSynthesis(dossier())).conversationId).toBe("conv-99");
  });

  it("never opens a conversation when the project holds no question", async () => {
    await expect(
      runResearchStationSynthesis(
        dossier({ project: { ...dossier().project, research_question: "  " } }),
      ),
    ).rejects.toBeInstanceOf(ResearchStationQuestionMissing);
    expect(createConversation).not.toHaveBeenCalled();
    expect(sendTurn).not.toHaveBeenCalled();
  });
});

describe("claim coverage never loses a disagreement", () => {
  const mixed = structure({
    claim_coverage: [
      { claim_id: "c1", claim: "supported claim", coverage: "supported", source_families: ["trait"], supporting_count: 2, contradicting_count: 0 },
      { claim_id: "c2", claim: "contested claim", coverage: "contested", source_families: ["trait", "literature"], supporting_count: 1, contradicting_count: 1 },
      { claim_id: "c3", claim: "contradicted claim", coverage: "contradicted", source_families: ["literature"], supporting_count: 0, contradicting_count: 3 },
      { claim_id: "c4", claim: "unresolved claim", coverage: "unresolved", source_families: [], supporting_count: 0, contradicting_count: 0 },
    ],
  });

  it("keeps contested and contradicted out of supported", () => {
    const groups = groupClaimCoverage(mixed);
    expect(groups.supported.map((c) => c.claim_id)).toEqual(["c1"]);
    expect(groups.contested.map((c) => c.claim_id)).toEqual(["c2"]);
    expect(groups.contradicted.map((c) => c.claim_id)).toEqual(["c3"]);
  });

  it("treats an unrecognised coverage value as unresolved, not as support", () => {
    const groups = groupClaimCoverage(
      structure({
        claim_coverage: [
          { claim_id: "c9", claim: "future state", coverage: "some_new_state", source_families: [], supporting_count: 0, contradicting_count: 0 },
        ],
      }),
    );
    expect(groups.supported).toHaveLength(0);
    expect(groups.unresolved.map((c) => c.claim_id)).toEqual(["c9"]);
  });

  it("reports an unresolved conflict when any claim disagrees", () => {
    expect(hasUnresolvedConflict(mixed)).toBe(true);
  });

  it("does not manufacture a conflict when every claim is supported", () => {
    expect(
      hasUnresolvedConflict(
        structure({
          claim_coverage: [
            { claim_id: "c1", claim: "supported", coverage: "supported", source_families: [], supporting_count: 1, contradicting_count: 0 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("honours an explicit backend conflict flag even with no claim breakdown", () => {
    expect(hasUnresolvedConflict(structure({ unresolved_conflict: true }))).toBe(true);
  });

  it("reports no conflict rather than guessing when there is no structure", () => {
    expect(hasUnresolvedConflict(null)).toBe(false);
    expect(groupClaimCoverage(null).supported).toHaveLength(0);
  });
});

describe("evidence gaps stay gaps", () => {
  it("surfaces what the backend named as missing", () => {
    expect(
      synthesisGaps(structure({ missing_evidence: ["direct velamen conductance measurements"] })),
    ).toEqual(["direct velamen conductance measurements"]);
  });

  it("reports an empty list when nothing was reported missing", () => {
    // Absence of reported gaps is not a claim that nothing is missing; the panel
    // renders this section only when non-empty.
    expect(synthesisGaps(structure())).toEqual([]);
    expect(synthesisGaps(null)).toEqual([]);
  });

  it("drops blank entries rather than rendering an empty gap", () => {
    expect(synthesisGaps(structure({ missing_evidence: ["", "   ", "real gap"] }))).toEqual([
      "real gap",
    ]);
  });
});
