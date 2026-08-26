import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ScientificEvidencePanel from "@/components/calyx/ScientificEvidencePanel";
import {
  ScientificRagPipeline,
  computeMetrics,
  PHALAENOPSIS_PUBLICATION_V1,
  PHALAENOPSIS_DEMO_QUESTION,
  type ScientificRagMetrics,
} from "@/lib/scientific-rag";
import type { GroundedAnswer } from "@/lib/scientific-rag/answer";
import type { VerificationResult } from "@/lib/scientific-rag/verification";
import type { ScientificClaim } from "@/lib/scientific-rag/claims";

/**
 * Diagnostics surface for the event-driven scientific RAG vertical slice.
 *
 * This runs the deterministic in-repo pipeline live in the browser — publication
 * fixture → ingestion → extraction → reconciliation → embedding → graph →
 * retrieval → grounded answer → verification — and renders the completed
 * consumer surface (`ScientificEvidencePanel`) against real, non-fabricated
 * output. It mirrors the existing `/diagnostics/*` pattern and is reachable by
 * URL without altering site navigation.
 */

type SliceRun = {
  answer: GroundedAnswer;
  verification: VerificationResult;
  claims: ScientificClaim[];
  metrics: ScientificRagMetrics;
  access: "public" | "research";
  question: string;
};

function runSlice(question: string, access: "public" | "research"): SliceRun {
  const pipeline = new ScientificRagPipeline();
  pipeline.processPublication(PHALAENOPSIS_PUBLICATION_V1);
  const { answer, verification } = pipeline.askCalyx(question, { access });
  const metrics = computeMetrics(pipeline.ledger, new Date().toISOString());
  return {
    answer,
    verification,
    claims: [...pipeline.claims.values()],
    metrics,
    access,
    question,
  };
}

export default function ScientificRagDiagnostics() {
  const [question, setQuestion] = useState(PHALAENOPSIS_DEMO_QUESTION);
  const [access, setAccess] = useState<"public" | "research">("public");
  const [nonce, setNonce] = useState(0);

  // `nonce` is a deliberate re-run trigger for the "Re-run slice" button; the
  // slice is deterministic, so a re-run reproduces identical output.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useMemo(() => runSlice(question, access), [question, access, nonce]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link to="/" className="hover:underline">
          Home
        </Link>{" "}
        / Scientific RAG diagnostics
      </nav>

      <header className="mb-6">
        <h1 className="text-lg font-semibold">Event-driven scientific RAG — vertical slice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A publication fixture is processed end to end and answered through the
          governed Calyx pipeline. Every statement is grounded in a stored claim
          with passage-level provenance, the answer passes a post-generation
          verification gate, and protected locality is excluded. All state below
          is computed live and deterministically — nothing here is hand-entered.
        </p>
      </header>

      <div className="mb-6 space-y-3 rounded-lg border border-border/60 bg-muted/10 p-3">
        <label className="block text-xs font-semibold text-muted-foreground">
          Question
          <textarea
            className="mt-1 w-full rounded-md border border-border/60 bg-background/60 p-2 text-sm"
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Access</span>
            <select
              className="rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs"
              value={access}
              onChange={(e) => setAccess(e.target.value as "public" | "research")}
            >
              <option value="public">public</option>
              <option value="research">research</option>
            </select>
          </label>
          <button
            type="button"
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15"
            onClick={() => setNonce((n) => n + 1)}
          >
            Re-run slice
          </button>
        </div>
      </div>

      <ScientificEvidencePanel
        answer={run.answer}
        verification={run.verification}
        claims={run.claims}
        metrics={run.metrics}
      />
    </main>
  );
}
