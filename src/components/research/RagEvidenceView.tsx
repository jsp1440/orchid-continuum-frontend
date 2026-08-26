import React from 'react'

import type { EvidenceDisplayState, EvidenceViewModel } from '@/lib/scientific-intelligence/rag'

/**
 * RagEvidenceView — the user-visible evidence / provenance surface for the
 * event-driven scientific RAG slice.
 *
 * It renders ONLY the view-model produced by the backend pipeline. It never
 * composes, rewords, or rescales a claim, confidence, or verification state
 * client-side. The seven display states (verified, inferred, disputed,
 * ambiguous, quarantined, insufficient evidence, blocked) are shown distinctly
 * so a reader can never mistake an inference for a verified fact or a
 * quarantined claim for established evidence.
 *
 * Design tokens follow the existing scientific surfaces (see ScientificSynthesis).
 */

const STATE_STYLE: Record<EvidenceDisplayState, string> = {
  verified: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  inferred: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  disputed: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  ambiguous: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  quarantined: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  insufficient_evidence: 'border-muted-foreground/40 bg-muted/40 text-muted-foreground',
  blocked: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
}

function StateBadge({ state, label }: { state: EvidenceDisplayState; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${STATE_STYLE[state]}`}
      data-testid={`state-${state}`}
    >
      {label}
    </span>
  )
}

export default function RagEvidenceView({ view }: { view: EvidenceViewModel }) {
  return (
    <section className="rounded-xl border-2 border-primary/30 bg-primary/[0.03] p-5" data-testid="rag-evidence-view">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Evidence &amp; provenance</h3>
        <StateBadge state={view.answerState} label={view.answerStateLabel} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Run {view.correlationId}. Every statement below is traceable to a stored source passage; nothing is composed here.
      </p>

      {view.answerState === 'insufficient_evidence' ? (
        <p className="mt-3 rounded-lg border border-dashed px-3 py-2 text-sm leading-6" data-testid="insufficient-notice">
          The retrieval returned no authorised, source-supported evidence for this question. No scientific answer is
          presented — this is a fail-closed outcome, not an empty result to be filled in.
        </p>
      ) : null}

      {view.answerState === 'blocked' ? (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm leading-6" role="status" data-testid="blocked-notice">
          <p className="font-medium text-red-700 dark:text-red-300">This answer was blocked by post-generation verification.</p>
          {view.blockedReasons.length ? (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {view.blockedReasons.map((reason, index) => (
                <li key={`reason-${index}`}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {view.statements.length ? (
        <ol className="mt-4 space-y-3" data-testid="statement-list">
          {view.statements.map((statement) => (
            <li className="rounded-lg bg-background p-3 text-sm" key={statement.id} data-testid="statement">
              <div className="flex items-center gap-2">
                <StateBadge state={statement.kind === 'inferred' ? 'inferred' : 'verified'} label={statement.kind === 'inferred' ? 'Inferred' : 'Observed'} />
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {statement.scope.replace(/_/g, ' ')} · confidence {statement.confidence.toFixed(2)}
                </span>
              </div>
              <p className="mt-1 leading-6">{statement.text}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {view.rows.length ? (
        <div className="mt-4 space-y-3" data-testid="evidence-rows">
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Supporting evidence</h4>
          {view.rows.map((row) => (
            <article className="rounded-lg border bg-background p-3 text-sm" key={row.claimId} data-testid="evidence-row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{row.claim}</span>
                <StateBadge state={row.displayState} label={row.displayState.replace(/_/g, ' ')} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{row.acceptedName ?? row.originalName}</span>
                {row.acceptedName && row.acceptedName !== row.originalName ? (
                  <> · as published: <em>{row.originalName}</em></>
                ) : null}
                {' · '}{row.evidenceType} · {row.studyType} · confidence {row.confidence.toFixed(2)}
              </p>
              <blockquote className="mt-2 border-l-2 border-primary/30 pl-3 text-xs italic leading-5 text-muted-foreground">
                “{row.supportingPassage}”
              </blockquote>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {row.citation} · {row.locator} · taxonomy: {row.taxonomyStatus} · <span className="font-mono">{row.contentHash.slice(0, 22)}…</span>
              </p>
              {row.contradiction ? (
                <p className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300" data-testid="contradiction">
                  Contradictory evidence: {row.contradiction}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      <details className="mt-4" data-testid="verification-checks">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Verification checks</summary>
        <ul className="mt-2 space-y-1 text-xs">
          {view.checks.map((check) => (
            <li className="flex items-center gap-2" key={check.id}>
              <span className={check.status === 'pass' ? 'text-emerald-600 dark:text-emerald-400' : check.status === 'fail' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}>
                {check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '—'}
              </span>
              <span className="font-medium">{check.label}:</span>
              <span className="text-muted-foreground">{check.detail}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
