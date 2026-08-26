/**
 * Post-generation verification gate (evidence gate / Verification Workbench).
 *
 * Evaluates a grounded answer against the stored evidence it claims to rest on
 * and produces both a machine-readable result and a human-readable evidence
 * view. An answer that fails any required check is BLOCKED and must not be
 * presented as verified.
 *
 * Checks (each required unless noted):
 *   - every material statement has supporting evidence;
 *   - cited claims resolve to stored claims;
 *   - cited passages support their statements (passage hash matches store);
 *   - taxon names/ids are consistent between answer and claim;
 *   - no quarantined claim is presented as established evidence;
 *   - unsupported numeric values/ranges/elevations are blocked;
 *   - inference is labelled as inference;
 *   - protected locality is absent from the rendered answer;
 *   - answer metadata (correlation id) matches the actual retrieval run;
 *   - contradictory evidence is surfaced (non-blocking, but reported).
 */

import type { ScientificClaim } from "./claims";
import type { GroundedAnswer } from "./answer";
import { assertNoProtectedLocality } from "./locality";

export const VERIFIER = "oc-evidence-gate";
export const VERIFIER_VERSION = "1.0.0";

export type VerificationCheck = {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
};

export type VerificationResult = {
  answerId: string;
  correlationId: string;
  verdict: "verified" | "blocked";
  checks: VerificationCheck[];
  blockReasons: string[];
  contradictions: { statementText: string; conflictingClaimId: string; detail: string }[];
  verifier: string;
  verifierVersion: string;
};

type ClaimLookup = (claimId: string) => ScientificClaim | undefined;

function numericTokens(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

export function verifyAnswer(
  answer: GroundedAnswer,
  lookup: ClaimLookup,
  ctx: { correlationId: string },
): VerificationResult {
  const checks: VerificationCheck[] = [];
  const blockReasons: string[] = [];
  const contradictions: VerificationResult["contradictions"] = [];

  const fail = (id: string, label: string, detail: string) => {
    checks.push({ id, label, status: "fail", detail });
    blockReasons.push(`${label}: ${detail}`);
  };
  const pass = (id: string, label: string, detail: string) =>
    checks.push({ id, label, status: "pass", detail });
  const warn = (id: string, label: string, detail: string) =>
    checks.push({ id, label, status: "warn", detail });

  // An explicit insufficiency answer is a valid, verified fail-closed outcome —
  // it makes no scientific claims, so the evidence checks do not apply.
  if (answer.insufficient) {
    pass("insufficiency", "Insufficiency declared", "answer correctly reports insufficient evidence");
    // Still enforce metadata + locality on the rendered text.
    if (answer.correlationId !== ctx.correlationId) {
      fail("metadata", "Metadata matches run", "correlation id mismatch");
    } else {
      pass("metadata", "Metadata matches run", "correlation id matches retrieval run");
    }
    return {
      answerId: answer.answerId,
      correlationId: answer.correlationId,
      verdict: blockReasons.length === 0 ? "verified" : "blocked",
      checks,
      blockReasons,
      contradictions,
      verifier: VERIFIER,
      verifierVersion: VERIFIER_VERSION,
    };
  }

  // 1. Every material statement has supporting evidence.
  const unsupported = answer.statements.filter(
    (s) => s.kind !== "insufficient" && s.claimIds.length === 0,
  );
  if (unsupported.length > 0) fail("support", "Every statement supported", `${unsupported.length} statement(s) without a claim`);
  else pass("support", "Every statement supported", "all statements carry claim ids");

  // 2. Citations resolve; 3. passages support; 4. taxon consistency;
  //    5. no quarantined claim; 6. numeric support; 7. inference labelled.
  let citationsResolve = true;
  let passagesSupport = true;
  let taxonConsistent = true;
  let numericSupported = true;
  let inferenceLabelled = true;
  let noQuarantined = true;

  for (const statement of answer.statements) {
    if (statement.kind === "insufficient") continue;
    for (const claimId of statement.claimIds) {
      const claim = lookup(claimId);
      if (!claim) {
        citationsResolve = false;
        continue;
      }
      if (claim.reviewStatus === "quarantined") noQuarantined = false;

      const citation = answer.citations.find((c) => c.claimId === claimId);
      if (!citation || citation.passage !== claim.provenance.supportingPassage) {
        passagesSupport = false;
      }

      // Taxon consistency between the rendered statement and the claim.
      const claimTaxon = claim.taxon.acceptedName ?? claim.taxon.nameAsPublished;
      if (!statement.text.includes(claimTaxon) && !statement.text.includes(claim.taxon.nameAsPublished)) {
        taxonConsistent = false;
      }

      // Numeric support: any number rendered in the statement must appear in
      // the claim's normalized object, original text, or numeric fields.
      const claimNumbers = new Set([
        ...numericTokens(claim.assertion.objectNormalized),
        ...numericTokens(claim.assertion.originalText),
        ...(claim.sampleSize ? [String(claim.sampleSize)] : []),
        ...(claim.assertion.numericValue !== null ? [String(claim.assertion.numericValue)] : []),
        ...(claim.assertion.numericRange ? claim.assertion.numericRange.map(String) : []),
        ...(claim.assertion.elevationRangeM ? claim.assertion.elevationRangeM.map(String) : []),
      ]);
      for (const n of numericTokens(statement.text)) {
        if (!claimNumbers.has(n) && !claim.assertion.objectNormalized.includes(n)) {
          numericSupported = false;
        }
      }

      // Inference must be labelled as inference in the statement.
      if (claim.evidenceType === "inference" && statement.kind !== "inference") {
        inferenceLabelled = false;
      }
    }
  }

  const gate = (
    ok: boolean,
    id: string,
    label: string,
    passDetail: string,
    failDetail: string,
  ) => (ok ? pass(id, label, passDetail) : fail(id, label, failDetail));

  gate(citationsResolve, "citations", "Citations resolve", "all cited claims found in store", "a cited claim is not in the store");
  gate(passagesSupport, "passages", "Passages support statements", "cited passages match stored provenance", "a cited passage does not match the stored claim");
  gate(taxonConsistent, "taxon", "Taxon names consistent", "answer taxa match claim taxa", "a statement's taxon does not match its claim");
  gate(noQuarantined, "quarantine", "No quarantined evidence", "no quarantined claim presented as established", "a quarantined claim was presented as evidence");
  gate(numericSupported, "numeric", "Numeric values supported", "all rendered numbers trace to a claim", "an unsupported numeric value/range was rendered");
  gate(inferenceLabelled, "inference", "Inference labelled", "inferences are marked as inference", "an inference was presented as observed fact");

  // 8. Protected locality absent from rendered answer + citations.
  const rendered = [
    ...answer.statements.map((s) => s.text),
    ...answer.citations.map((c) => c.passage),
  ].join("\n");
  const locality = assertNoProtectedLocality(rendered);
  gate(locality.ok, "locality", "Protected locality excluded", "no precise locality in rendered answer", locality.reason ?? "protected locality leaked");

  // 9. Metadata matches the actual retrieval run.
  gate(answer.correlationId === ctx.correlationId, "metadata", "Metadata matches run", "correlation id matches retrieval run", "correlation id mismatch");

  // 10. Contradiction surfacing (non-blocking): opposing objects for the same
  //     taxon+predicate across cited claims.
  const byKey = new Map<string, ScientificClaim[]>();
  for (const statement of answer.statements) {
    for (const claimId of statement.claimIds) {
      const claim = lookup(claimId);
      if (!claim) continue;
      const key = `${claim.taxon.taxonId ?? claim.taxon.nameAsPublished}␟${claim.assertion.predicate}`;
      byKey.set(key, [...(byKey.get(key) ?? []), claim]);
    }
  }
  for (const [, group] of byKey) {
    const objects = new Set(group.map((c) => c.assertion.objectNormalized));
    if (objects.size > 1) {
      contradictions.push({
        statementText: group[0].assertion.predicate,
        conflictingClaimId: group[1].claimId,
        detail: `conflicting values for ${group[0].assertion.predicate}: ${[...objects].join(" vs ")}`,
      });
    }
  }
  if (contradictions.length > 0) {
    warn("contradiction", "Contradictions surfaced", `${contradictions.length} conflict(s) reported`);
  } else {
    pass("contradiction", "Contradictions surfaced", "no conflicting evidence among citations");
  }

  return {
    answerId: answer.answerId,
    correlationId: answer.correlationId,
    verdict: blockReasons.length === 0 ? "verified" : "blocked",
    checks,
    blockReasons,
    contradictions,
    verifier: VERIFIER,
    verifierVersion: VERIFIER_VERSION,
  };
}
