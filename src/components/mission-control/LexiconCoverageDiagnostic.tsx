import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { measureLexiconCoverage, type LexiconCoverageReport } from '@/lib/lexiconService';

type LoadState = 'loading' | 'loaded' | 'error';

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/**
 * Surfaces measureLexiconCoverage() -- the real, current ratio of canonical
 * backend-sourced Lexicon entries versus Famous AI Illustrated Orchid Lexicon
 * migration fallback entries actually served by lexiconService's
 * getEntries()/getEntry(). Never fabricates a percentage: an unavailable
 * measurement renders as "unavailable", not as 0% or blank.
 */
export default function LexiconCoverageDiagnostic() {
  const [state, setState] = useState<LoadState>('loading');
  const [report, setReport] = useState<LexiconCoverageReport | null>(null);

  const load = useCallback(() => {
    setState('loading');
    measureLexiconCoverage()
      .then((result) => {
        setReport(result);
        setState('loaded');
      })
      .catch(() => {
        setReport(null);
        setState('error');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <button
        type="button"
        onClick={load}
        className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/25 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] transition-colors hover:border-[#d4b34a]/60 hover:bg-[#d4b34a]/10"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${state === 'loading' ? 'animate-spin' : ''}`} /> Remeasure coverage
      </button>

      {state === 'loading' && !report ? (
        <p className="text-[12px] text-[#cfc8b8]/70">Measuring canonical-vs-fallback coverage...</p>
      ) : null}

      {state === 'error' || report?.status === 'unavailable' ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-[12px] leading-5 text-amber-100">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Coverage unavailable -- {report?.reason ?? 'the measurement could not be computed this pass.'} No
            percentage is reported rather than guessing one.
          </span>
        </div>
      ) : null}

      {report?.status === 'measured' ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a24a]">
              Canonical coverage
            </div>
            <div className="mt-2 text-3xl text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
              {report.canonicalCoverageRatio !== null ? formatPercent(report.canonicalCoverageRatio) : 'n/a'}
            </div>
            <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/70">
              {report.canonicalServedEntries} of {report.totalEntries} served entries are canonical-backed;{' '}
              {report.famousFallbackOnlyEntries} are Famous-fallback-only.
            </p>
          </div>
          <div className="text-[11px] text-[#cfc8b8]/55">
            Canonical API reachable this pass: {report.canonicalReachable ? 'yes' : 'no'}
            {report.reason ? <> -- {report.reason}</> : null}
            <br />
            Measured at: {report.measuredAt}
          </div>
        </div>
      ) : null}
    </div>
  );
}
