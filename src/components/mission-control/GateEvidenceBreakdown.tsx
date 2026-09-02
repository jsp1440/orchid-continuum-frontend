import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

import {
  GATE_EVIDENCE_REQUIRED,
  GATE_LABELS,
  computeGateCoverage,
  demonstratedWeightFraction,
  evidencedWeightFraction,
  thinlyEvidencedGates,
} from '@/lib/completion-graph/gateCoverage';
import type { CompletionNode } from '@/lib/completion-graph/types';

/**
 * What the headline percentage is a percentage of.
 *
 * The Observatory's overall figure is renormalised per leaf over the gates
 * that leaf was scored on. That arithmetic is right — an unevaluated gate is
 * UNKNOWN, and scoring it zero would report failures nobody observed — but it
 * is silent, and the silence flatters. A leaf audited for architecture and
 * implementation alone reports 100% without anyone having opened a browser.
 *
 * So this panel publishes the bracket rather than a single number:
 *
 *   the headline    — of the evidence actually gathered
 *   evidenced       — how much of the full weighting that evidence covers
 *   demonstrated    — how much has been evaluated AND met
 *
 * The gap between the last two is the size of what nobody has checked. Neither
 * end is "the" completion figure, and the panel says so: an unevaluated gate is
 * not a failed one, so `demonstrated` is a floor, not a score.
 *
 * IT DOES NOT BORROW FROM SERVICE HEALTH. Mission Control renders live health
 * panels a few sections away, and a green one is not deployment evidence: it
 * reports that a service answered a request, not that a scientist completed a
 * journey. Filling this gate from that signal would convert an honest UNKNOWN
 * into a fabricated pass, which is the failure the gate exists to catch.
 */
export default function GateEvidenceBreakdown({ root }: { root: CompletionNode }) {
  const rows = useMemo(() => computeGateCoverage(root), [root]);
  const evidenced = useMemo(() => evidencedWeightFraction(rows), [rows]);
  const demonstrated = useMemo(() => demonstratedWeightFraction(rows), [rows]);
  const thin = useMemo(() => thinlyEvidencedGates(rows), [rows]);

  return (
    <section
      className="rounded-lg border border-[#d4b34a]/25 bg-[#0d1d13]/90 p-4"
      data-testid="gate-evidence-breakdown"
    >
      <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">
        What the percentage is a percentage of
      </h3>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-[#d4b34a]/20 bg-[#102819]/60 p-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#cfc8b8]/50">
            Weighting evidenced
          </div>
          <div className="mt-1 text-2xl font-semibold text-[#f5f0e8]" data-testid="evidenced-weight">
            {Math.round(evidenced * 100)}%
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[#cfc8b8]/55">
            Share of the full acceptance weighting any leaf has actually been evaluated against. The
            headline percentage is renormalised over this much and no more.
          </p>
        </div>
        <div className="rounded border border-[#d4b34a]/20 bg-[#102819]/60 p-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#cfc8b8]/50">
            Weighting demonstrated
          </div>
          <div className="mt-1 text-2xl font-semibold text-[#f5f0e8]" data-testid="demonstrated-weight">
            {Math.round(demonstrated * 100)}%
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[#cfc8b8]/55">
            Evaluated <em>and</em> met. A floor, not a score — an unevaluated gate is unknown, not
            failed, so the true figure sits between this and the headline.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2" data-testid="gate-rows">
        {rows.map((row) => {
          const share = row.scoredLeaves === 0 ? 0 : row.evaluatedLeaves / row.scoredLeaves;
          const isThin = thin.some((candidate) => candidate.gate === row.gate);
          return (
            <li
              key={row.gate}
              className="rounded border border-[#d4b34a]/15 bg-[#102819]/40 p-3"
              data-testid={`gate-row-${row.gate}`}
              data-thin={isThin ? 'true' : 'false'}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[12px] text-[#f5f0e8]">{GATE_LABELS[row.gate]}</span>
                <span className="font-mono text-[10px] text-[#cfc8b8]/60">
                  evaluated {row.evaluatedLeaves}/{row.scoredLeaves} · met {row.metLeaves} ·{' '}
                  {Math.round(row.weight * 100)}% weight
                </span>
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded bg-[#0d1d13]">
                <div
                  className={isThin ? 'h-1 bg-[#d4b34a]' : 'h-1 bg-emerald-400/70'}
                  style={{ width: `${Math.round(share * 100)}%` }}
                />
              </div>
              {isThin ? (
                <p className="mt-2 text-[11px] leading-relaxed text-[#f6dc82]/80">
                  {GATE_EVIDENCE_REQUIRED[row.gate]}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 rounded border border-[#d4b34a]/30 bg-[#241c08]/50 p-3">
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#f6dc82]">
          <AlertTriangle className="h-3 w-3" /> Health is not completion
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[#cfc8b8]/60" data-testid="health-disclaimer">
          The service-health panels elsewhere on this page report that a service answered a request.
          They are not evidence for the deployed-and-operational gate, which asks whether a scientist
          completed a journey against the production stack. No figure above is derived from them.
        </p>
      </div>
    </section>
  );
}
