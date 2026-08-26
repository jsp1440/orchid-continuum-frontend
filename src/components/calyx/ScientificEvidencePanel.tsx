import React from "react";

import {
  buildEvidenceViewModel,
  EVIDENCE_STATE_LABEL,
  type EvidenceState,
} from "@/lib/scientific-rag/evidenceView";
import type { GroundedAnswer } from "@/lib/scientific-rag/answer";
import type { VerificationResult } from "@/lib/scientific-rag/verification";
import type { ScientificClaim } from "@/lib/scientific-rag/claims";
import type { ScientificRagMetrics } from "@/lib/scientific-rag/missionControl";

/**
 * User-visible evidence / provenance surface for the event-driven scientific
 * RAG slice. It exposes the completed backend capability: the grounded answer,
 * every supporting claim with its passage-level provenance, the verification
 * gate result, and (optionally) the Mission Control processing state derived
 * from the event ledger.
 *
 * It is presentational and pure — no network calls — so it renders exactly the
 * governed evidence it is handed, never invented state. Every material row is
 * tagged with one evidence state so a reader can tell verified from inferred,
 * disputed, ambiguous, quarantined, insufficient, or blocked.
 */

const STATE_CLASS: Record<EvidenceState, string> = {
  verified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  inferred: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  disputed: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  ambiguous: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  quarantined: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  insufficient: "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  blocked: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
};

const CHECK_CLASS: Record<VerificationResult["checks"][number]["status"], string> = {
  pass: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-red-600 dark:text-red-400",
};

function StateBadge({ state }: { state: EvidenceState }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATE_CLASS[state]}`}
    >
      {EVIDENCE_STATE_LABEL[state]}
    </span>
  );
}

export default function ScientificEvidencePanel({
  answer,
  verification,
  claims,
  metrics,
}: {
  answer: GroundedAnswer;
  verification: VerificationResult;
  claims: ScientificClaim[];
  metrics?: ScientificRagMetrics;
}) {
  const model = buildEvidenceViewModel(answer, verification, claims);
  const verdictBlocked = model.overallVerdict === "blocked";

  return (
    <section
      className="rounded-xl border border-primary/20 bg-muted/10 p-4"
      data-testid="scientific-evidence-panel"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Grounded evidence
          </p>
          <h2 className="mt-1 text-sm font-semibold leading-5">{model.question}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Run {model.correlationId} · {model.rows.length} statement(s)
          </p>
        </div>
        <span
          data-testid="evidence-verdict"
          className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${
            verdictBlocked ? STATE_CLASS.blocked : STATE_CLASS.verified
          }`}
        >
          {verdictBlocked ? "Answer blocked" : "Answer verified"}
        </span>
      </header>

      {verdictBlocked && model.blockReasons.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-700 dark:text-red-300">
          {model.blockReasons.map((reason, i) => (
            <li key={i}>• {reason}</li>
          ))}
        </ul>
      )}

      <ol className="mt-4 space-y-3">
        {model.rows.map((row, i) => (
          <li
            key={row.claimId ?? `row-${i}`}
            className="rounded-lg border border-border/60 bg-background/40 p-3"
            data-testid="evidence-row"
            data-state={row.state}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StateBadge state={row.state} />
              {row.evidenceType && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {row.evidenceType}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-5">{row.statement}</p>

            {(row.acceptedTaxon || row.publishedTaxon) && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {row.acceptedTaxon && (
                  <span className="italic">{row.acceptedTaxon}</span>
                )}
                {row.publishedTaxon && row.publishedTaxon !== row.acceptedTaxon && (
                  <span> · published as <span className="italic">{row.publishedTaxon}</span></span>
                )}
              </p>
            )}

            {row.supportingPassage && (
              <blockquote className="mt-2 border-l-2 border-primary/30 pl-2 text-[11px] italic text-muted-foreground">
                "{row.supportingPassage}"
              </blockquote>
            )}

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
              {row.citationTitle && <span>Source: {row.citationTitle}</span>}
              {row.locator && <span>Locator: {row.locator}</span>}
              <span>Confidence: {(row.confidence * 100).toFixed(0)}%</span>
              {row.taxonomyVersion && <span>Taxonomy {row.taxonomyVersion}</span>}
              {row.extractionVersion && <span>Extractor {row.extractionVersion}</span>}
            </div>
          </li>
        ))}
      </ol>

      {model.contradictions.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            Conflicting evidence surfaced
          </p>
          <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
            {model.contradictions.map((c, i) => (
              <li key={i}>• {c.detail}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground">
          Verification checks ({model.checks.filter((c) => c.status === "pass").length}/
          {model.checks.length} pass)
        </summary>
        <ul className="mt-2 space-y-1">
          {model.checks.map((check) => (
            <li key={check.id} className="text-[11px]">
              <span className={`font-semibold ${CHECK_CLASS[check.status]}`}>
                {check.status.toUpperCase()}
              </span>{" "}
              <span className="text-foreground">{check.label}</span>{" "}
              <span className="text-muted-foreground">— {check.detail}</span>
            </li>
          ))}
        </ul>
      </details>

      {metrics && (
        <dl
          className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-[11px] sm:grid-cols-4"
          data-testid="evidence-metrics"
        >
          {[
            ["Docs parsed", metrics.documentsParsed],
            ["Claims", metrics.claimsExtracted],
            ["Quarantined", metrics.claimsQuarantined],
            ["Taxa resolved", metrics.taxaResolved],
            ["Taxa ambiguous", metrics.taxaAmbiguous],
            ["Embeddings", metrics.embeddingsCreated],
            ["Graph updates", metrics.graphUpdatesCompleted],
            ["Answers verified", metrics.answersVerified],
            ["Answers blocked", metrics.answersBlocked],
            ["Dead-letter", metrics.deadLetterEvents],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md bg-muted/30 px-2 py-1.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-sm font-semibold">{value as number}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
