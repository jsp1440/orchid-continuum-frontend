/**
 * Grounded answer generation over retrieved evidence.
 *
 * The generator is extractive and deterministic: it composes an answer strictly
 * from retrieved claims, and every material statement carries the claim id(s)
 * that support it. It never writes a statement it cannot cite. When retrieval
 * returns no eligible evidence it fails closed with an explicit insufficiency
 * answer rather than fabricating a plausible one.
 *
 * The generator distinguishes observed evidence from inference and species-level
 * evidence from generalized cultivation guidance, and it shows accepted taxon
 * names while preserving the originally published names.
 */

import type { ScientificClaim } from "./claims";
import type { RetrievedEvidence } from "./retrieval";

export type AnswerStatement = {
  text: string;
  kind: "observation" | "experiment" | "inference" | "insufficient";
  claimIds: string[];
  taxa: { accepted: string | null; published: string }[];
  confidence: number;
};

export type GroundedAnswer = {
  answerId: string;
  question: string;
  correlationId: string;
  statements: AnswerStatement[];
  citations: {
    claimId: string;
    title: string;
    locator: string;
    passage: string;
    evidenceType: string;
    confidence: number;
  }[];
  insufficient: boolean;
  notes: string[];
};

function locatorString(claim: ScientificClaim): string {
  const l = claim.provenance.locator;
  const parts = [
    l.section ? l.section : null,
    l.page ? `p.${l.page}` : null,
    l.paragraph ? `¶${l.paragraph}` : null,
  ].filter(Boolean);
  return parts.join(", ");
}

function statementText(claim: ScientificClaim): string {
  const name = claim.taxon.acceptedName ?? claim.taxon.nameAsPublished;
  const published =
    claim.taxon.acceptedName && claim.taxon.nameAsPublished !== claim.taxon.acceptedName
      ? ` (published as ${claim.taxon.nameAsPublished})`
      : "";
  const q = claim.assertion.qualifiers.length ? ` [${claim.assertion.qualifiers.join(", ")}]` : "";
  return `${name}${published}: ${claim.assertion.predicate.replace(/_/g, " ")} — ${claim.assertion.objectNormalized}${q}`;
}

/**
 * Build a grounded answer. `answerId` is injected for reproducibility. If no
 * eligible evidence is present, returns an explicit insufficiency answer.
 */
export function generateGroundedAnswer(
  question: string,
  evidence: RetrievedEvidence[],
  opts: { answerId: string; correlationId: string },
): GroundedAnswer {
  const notes: string[] = [];

  if (evidence.length === 0) {
    return {
      answerId: opts.answerId,
      question,
      correlationId: opts.correlationId,
      statements: [
        {
          text: "Insufficient eligible evidence is available to answer this question from the governed corpus.",
          kind: "insufficient",
          claimIds: [],
          taxa: [],
          confidence: 0,
        },
      ],
      citations: [],
      insufficient: true,
      notes: ["retrieval returned no eligible evidence — failing closed"],
    };
  }

  const statements: AnswerStatement[] = evidence.map((e) => {
    const claim = e.claim;
    const kind =
      claim.evidenceType === "experiment"
        ? "experiment"
        : claim.evidenceType === "inference"
          ? "inference"
          : "observation";
    return {
      text: (kind === "inference" ? "Inferred: " : "") + statementText(claim),
      kind,
      claimIds: [claim.claimId],
      taxa: [{ accepted: claim.taxon.acceptedName, published: claim.taxon.nameAsPublished }],
      confidence: Math.min(claim.extractionConfidence, e.score > 0 ? 1 : 0.5),
    };
  });

  const observed = statements.filter((s) => s.kind !== "inference").length;
  const inferred = statements.filter((s) => s.kind === "inference").length;
  notes.push(`${observed} observed/experimental statement(s), ${inferred} inference(s)`);
  notes.push("Species-level evidence only; not generalized cultivation guidance.");

  const citations = evidence.map((e) => ({
    claimId: e.claim.claimId,
    title: e.claim.provenance.citation.title,
    locator: locatorString(e.claim),
    passage: e.claim.provenance.supportingPassage,
    evidenceType: e.claim.evidenceType,
    confidence: e.claim.extractionConfidence,
  }));

  return {
    answerId: opts.answerId,
    question,
    correlationId: opts.correlationId,
    statements,
    citations,
    insufficient: false,
    notes,
  };
}
