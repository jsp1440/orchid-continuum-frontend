import React, { useEffect, useState } from 'react';
import {
  fetchVisionEvidence,
  isVisionConceptId,
  type VisionEvidenceResult,
  type VisionEvidenceSummary as Summary,
} from '@/lib/visionEvidence';

/**
 * Vision Lab evidence summary for one Lexicon concept.
 *
 * Renders the Calyx Vision-Lexicon evidence summary exactly as returned. Each
 * failure mode has its own wording: an outage or a malformed body is never
 * shown as "no evidence". No image is rendered — the contract returns image
 * identifiers only, and this surface never constructs an image URL.
 *
 * When the entry has no UUID concept id, nothing is requested and `fallback`
 * (the existing static Vision Lab note) is rendered unchanged.
 */

type ViewState = { state: 'loading' } | VisionEvidenceResult;

const Count: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-stone-100 py-1 text-sm">
    <dt className="text-stone-600">{label}</dt>
    <dd className="font-mono text-stone-900">{value}</dd>
  </div>
);

const SummaryBody: React.FC<{ summary: Summary }> = ({ summary }) => {
  const analysisCount = summary.aggregate_summary?.analysis_count;
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-stone-500">
        Review state: <span data-testid="vision-evidence-review-state" className="font-mono text-stone-700">{summary.review_state}</span>
      </p>
      <dl data-testid="vision-evidence-counts">
        <Count label="Reference sets" value={summary.reference_sets.length} />
        <Count label="Reference images" value={summary.reference_images.length} />
        <Count label="Vision observations" value={summary.vision_observations.length} />
        <Count label="Morphometrics" value={summary.morphometrics.length} />
        <Count label="Figure specifications" value={summary.figure_specifications.length} />
        <Count label="Validation runs" value={summary.validation_runs.length} />
        {typeof analysisCount === 'number' ? <Count label="Analyses (first reference set)" value={analysisCount} /> : null}
      </dl>
      {summary.reference_sets.length ? (
        <ul className="space-y-1 text-sm text-stone-700" data-testid="vision-evidence-reference-sets">
          {summary.reference_sets.map((set, index) => (
            <li key={typeof set.reference_set_id === 'string' ? set.reference_set_id : index}>
              {typeof set.title === 'string' ? set.title : 'Untitled reference set'}
            </li>
          ))}
        </ul>
      ) : null}
      {summary.limitations.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-stone-500">Limitations reported by the Vision service</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-stone-600" data-testid="vision-evidence-limitations">
            {summary.limitations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-stone-500">Machine-generated vision evidence is not reviewed scientific knowledge unless its review state says otherwise.</p>
    </div>
  );
};

export const VisionEvidenceSummary: React.FC<{ conceptId?: string | null; fallback: React.ReactNode }> = ({ conceptId, fallback }) => {
  const applicable = isVisionConceptId(conceptId);
  const [view, setView] = useState<ViewState>(applicable ? { state: 'loading' } : { state: 'not_applicable' });

  useEffect(() => {
    if (!isVisionConceptId(conceptId)) {
      setView({ state: 'not_applicable' });
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setView({ state: 'loading' });
    fetchVisionEvidence(conceptId, { signal: controller.signal }).then((result) => {
      if (active) setView(result);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [conceptId]);

  if (view.state === 'not_applicable') return <>{fallback}</>;

  return (
    <div data-testid="vision-evidence" data-state={view.state} aria-live="polite">
      {view.state === 'loading' ? <p className="mt-3 text-sm text-stone-500">Loading Vision-Lexicon evidence…</p> : null}
      {view.state === 'unavailable' ? (
        <p className="mt-3 text-sm leading-relaxed text-amber-800">
          Vision-Lexicon evidence is unavailable right now ({view.status === 0 ? 'no response' : `HTTP ${view.status}`}
          {view.code ? `, ${view.code}` : ''}). This is not a finding that no evidence exists.
        </p>
      ) : null}
      {view.state === 'malformed' ? (
        <p className="mt-3 text-sm leading-relaxed text-amber-800">
          The Vision service returned a response that does not match the evidence contract, so it is not shown. This is not a finding that no evidence exists.
        </p>
      ) : null}
      {view.state === 'empty' ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            The Vision service holds no reference sets, images, observations, morphometrics, figures or validation runs for this concept yet.
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Review state: <span data-testid="vision-evidence-review-state" className="font-mono text-stone-700">{view.summary.review_state}</span>
          </p>
        </>
      ) : null}
      {view.state === 'ready' ? <SummaryBody summary={view.summary} /> : null}
    </div>
  );
};

export default VisionEvidenceSummary;
