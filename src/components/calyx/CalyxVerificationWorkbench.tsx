import React, { useMemo, useState } from "react";

import GovernedEvidenceSearch from "@/components/calyx/GovernedEvidenceSearch";
import type { BrainMission, MissionConclusion } from "@/lib/calyxWorkspace";
import {
  checkCalyxMissionClaim,
  type CalyxVerificationCheckStatus,
} from "@/lib/calyxVerification";

const STATUS_CLASS: Record<CalyxVerificationCheckStatus, string> = {
  pass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  needs_review: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  fail: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
};

const STATUS_LABEL: Record<CalyxVerificationCheckStatus, string> = {
  pass: "Pass",
  needs_review: "Review",
  fail: "Fail",
};

const VERDICT_LABEL = {
  structurally_verified: "Traceability checks passed",
  contested: "Contested evidence",
  provisional: "Provisional — review required",
  insufficient_evidence: "Insufficient evidence",
  verification_failed: "Verification failed",
} as const;

function labelForStep(kind: string): string {
  return {
    question: "Question",
    evidence: "Supporting evidence",
    counterevidence: "Counterevidence",
    inference: "Reasoning rationale",
    claim: "Calyx claim",
    gap: "Unresolved evidence gap",
  }[kind] ?? kind;
}

export default function CalyxVerificationWorkbench({
  mission,
  conclusion,
}: {
  mission: BrainMission;
  conclusion: MissionConclusion;
}) {
  const [open, setOpen] = useState(false);
  const result = useMemo(
    () => checkCalyxMissionClaim(mission, conclusion),
    [mission, conclusion],
  );

  const passCount = result.checks.filter((item) => item.status === "pass").length;
  const reviewCount = result.checks.filter((item) => item.status === "needs_review").length;
  const failCount = result.checks.filter((item) => item.status === "fail").length;

  return (
    <div className="mt-3 rounded-lg border border-primary/20 bg-muted/20" data-testid="calyx-verification-workbench">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
        <div>
          <p className="text-xs font-semibold">Calyx Verification Workbench</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            Audit this claim against its evidence, counterevidence, provenance, and reasoning trail.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
        >
          {open ? "Close verification" : "Check Calyx"}
        </button>
      </div>

      {open ? (
        <div className="border-t px-3 py-3">
          <div className="rounded-lg border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                  Verification result
                </p>
                <p className="mt-1 text-sm font-semibold">{VERDICT_LABEL[result.verdict]}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {passCount} pass · {reviewCount} review · {failCount} fail
              </p>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              This operation verifies whether Calyx&apos;s claim is traceable to the evidence the
              mission actually used and whether the scientific argument can be audited. It does
              not declare a claim true merely because Calyx produced it.
            </p>
          </div>

          <section className="mt-3">
            <h4 className="text-xs font-semibold">System verification</h4>
            <ul className="mt-2 space-y-2">
              {result.checks.map((item) => (
                <li className="rounded-lg border bg-background px-3 py-2" key={item.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_CLASS[item.status]}`}
                    >
                      {STATUS_LABEL[item.status]}
                    </span>
                    <span className="text-xs font-medium">{item.label}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.summary}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-4 rounded-lg border bg-background p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-xs font-semibold">Auditable scientific argument</h4>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                No private chain-of-thought
              </span>
            </div>
            <ol className="mt-3 space-y-2">
              {result.scientificArgument.steps.map((step, index) => (
                <li className="grid grid-cols-[1.25rem_1fr] gap-2" key={`${step.kind}-${index}`}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border text-[10px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                      {labelForStep(step.kind)}
                    </p>
                    <p className="mt-0.5 text-xs leading-5">{step.text}</p>
                    {step.evidenceIds?.length ? (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Evidence IDs: {step.evidenceIds.join(", ")}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-4">
            <h4 className="text-xs font-semibold">Evidence & reasoning</h4>
            {result.evidence.length ? (
              <div className="mt-2 space-y-3">
                {result.evidence.map((item, index) => (
                  <article className="rounded-lg border bg-background p-3" key={`${item.role}-${item.candidateId}-${index}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium">
                        {item.role === "support" ? "Supporting evidence" : "Counterevidence"}
                      </p>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {item.candidateId}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5">{item.statement}</p>
                    {item.exactExcerpt ? (
                      <>
                        <blockquote className="mt-2 border-l-2 border-primary/30 pl-3 text-xs leading-5 text-muted-foreground">
                          {item.exactExcerpt}
                        </blockquote>
                        {/* An unhashed summary must not read as authoritatively
                            as a hash-anchored canonical record. */}
                        {item.excerptSource === "source_summary" ? (
                          <p className="mt-1 text-[10px] leading-4 text-amber-700 dark:text-amber-300">
                            From the mission&apos;s source summary, not the hash-anchored canonical
                            record. Nothing here confirms it matches the source text.
                          </p>
                        ) : null}
                      </>
                    ) : item.excerptAbsence === "withheld_by_policy" ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        Excerpt withheld by display policy
                        {item.displayPolicy ? ` (${item.displayPolicy})` : ""}. The evidence record
                        exists and its text is not releasable here — this is not an absence of
                        evidence.
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        No canonical evidence record resolved to this citation, so no exact excerpt
                        can be shown. This is a traceability gap, not a statement about the source.
                      </p>
                    )}
                    <dl className="mt-3 grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
                      <div><dt className="inline font-medium text-foreground">Source: </dt><dd className="inline">{item.sourceTitle ?? "not supplied"}</dd></div>
                      <div><dt className="inline font-medium text-foreground">Revision: </dt><dd className="inline">{item.sourceRevisionId ?? "not supplied"}</dd></div>
                      <div><dt className="inline font-medium text-foreground">Anchors: </dt><dd className="inline">{item.anchorIds.join(", ") || "not supplied"}</dd></div>
                      <div><dt className="inline font-medium text-foreground">Content hash: </dt><dd className="inline break-all">{item.contentHash ?? "not surfaced"}</dd></div>
                      <div><dt className="inline font-medium text-foreground">Display policy: </dt><dd className="inline">{item.displayPolicy ?? "not supplied"}</dd></div>
                    </dl>
                    {item.locator ? (
                      <details className="mt-2 text-[10px] text-muted-foreground">
                        <summary className="cursor-pointer">Exact source locator</summary>
                        <pre className="mt-1 overflow-auto rounded bg-muted p-2">{JSON.stringify(item.locator, null, 2)}</pre>
                      </details>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                No evidence records resolved to this claim. The claim should not be treated as research-grade.
              </p>
            )}
          </section>

          {/*
            The objections the mission raised against itself. "Not validated"
            and "not publishable" are conclusions the backend reached for
            reasons it supplied; reporting the conclusion and discarding the
            reasons answers "why should I believe this" with a shrug.
          */}
          {!result.objections.validationValid ||
          !result.objections.publicationEligible ||
          result.objections.mission.length ? (
            <section className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3" data-testid="stated-objections">
              <h4 className="text-xs font-semibold">Stated objections</h4>

              {!result.objections.validationValid ? (
                <div className="mt-2">
                  <p className="text-[11px] font-medium">Failed structural validation</p>
                  {result.objections.validation.length ? (
                    <ul className="mt-1 list-disc pl-5 text-[11px] leading-5 text-muted-foreground">
                      {result.objections.validation.map((reason, index) => (
                        <li key={`validation-${index}`}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    // An unexplained failure is less trustworthy than an
                    // explained one. It must not read as "no objections".
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      The mission reported the failure but supplied no reason. Absence of a stated
                      reason is not evidence that the claim is sound.
                    </p>
                  )}
                </div>
              ) : null}

              {result.objections.mission.length ? (
                <div className="mt-3">
                  <p className="text-[11px] font-medium">Blocked during the run</p>
                  <ul className="mt-1 space-y-1 text-[11px] leading-5 text-muted-foreground">
                    {result.objections.mission.map((blocker, index) => (
                      <li key={`blocker-${index}`}>
                        <span className="font-mono text-[10px] uppercase tracking-wide">
                          {blocker.code || "unspecified"}
                        </span>
                        {blocker.stage ? ` · ${blocker.stage}` : ""}
                        {blocker.detail ? ` — ${blocker.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!result.objections.publicationEligible ? (
                <div className="mt-3">
                  <p className="text-[11px] font-medium">Not eligible for publication</p>
                  {result.objections.publication.length ? (
                    <ul className="mt-1 list-disc pl-5 text-[11px] leading-5 text-muted-foreground">
                      {result.objections.publication.map((reason, index) => (
                        <li key={`publication-${index}`}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      No publication blocker was supplied. This is not a statement that the claim is
                      publishable.
                    </p>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}

          {result.gaps.length ? (
            <section className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <h4 className="text-xs font-semibold">What still has to be checked</h4>
              <ul className="mt-2 list-disc pl-5 text-xs leading-5 text-muted-foreground">
                {result.gaps.map((gap, index) => <li key={`${gap}-${index}`}>{gap}</li>)}
              </ul>
            </section>
          ) : null}

          {/*
            Corpus search sits below the mission's own evidence and above
            provenance, matching the order a scientist actually asks in: what was
            claimed, what did the mission cite, what else does the corpus hold,
            and can any of it be traced.
          */}
          <GovernedEvidenceSearch claimText={result.claimText} />

          <section className="mt-4 rounded-lg border bg-background p-3">
            <h4 className="text-xs font-semibold">Reproducibility & provenance</h4>
            <dl className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
              <div><dt className="inline font-medium text-foreground">Mission: </dt><dd className="inline break-all">{result.provenance.missionId}</dd></div>
              <div><dt className="inline font-medium text-foreground">Reasoning ledger: </dt><dd className="inline break-all">{result.provenance.reasoningLedgerId ?? "not supplied"}{result.provenance.reasoningLedgerVersion ? ` · v${result.provenance.reasoningLedgerVersion}` : ""}</dd></div>
              <div className="sm:col-span-2">
                <dt className="inline font-medium text-foreground">Mission confidence: </dt>
                <dd className="inline">
                  {result.provenance.missionConfidence === null
                    ? "not supplied"
                    : `${result.provenance.missionConfidence} — the mission's own self-assessment, not a probability that the claim is true and not a measure of evidence strength`}
                </dd>
              </div>
              <div><dt className="inline font-medium text-foreground">Review state: </dt><dd className="inline">{result.provenance.reviewStatus.replace(/_/g, " ")}</dd></div>
              <div><dt className="inline font-medium text-foreground">Publication eligible: </dt><dd className="inline">{result.provenance.publicationEligible ? "yes" : "no"}</dd></div>
              <div className="sm:col-span-2"><dt className="inline font-medium text-foreground">Source revisions: </dt><dd className="inline">{result.provenance.sourceRevisionIds.join(", ") || "not supplied"}</dd></div>
            </dl>
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
              Automatic publication is disabled. Human scientific review remains authoritative.
            </p>
            {/* The ledger id proves a reasoning record was kept. It does not
                make the reasoning readable from here, and a verification
                surface that implies otherwise is the failure it exists to
                prevent. */}
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              The reasoning ledger is identified but cannot be retrieved from this surface. Its
              existence is verified; its contents are not.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
