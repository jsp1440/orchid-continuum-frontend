import React from 'react';

import CalyxVerificationWorkbench from '@/components/calyx/CalyxVerificationWorkbench';
import type { BrainMission, MissionConclusion } from '@/lib/calyxWorkspace';

/**
 * ScientificSynthesis — the Brain's bounded conclusions, shown as synthesis.
 *
 * The mission contract already carries `conclusions`, their `claim_ids`,
 * `confidence` and `partial`, but nothing rendered them: the research details
 * showed sources, evidence, gaps and governance only, so the Brain's actual
 * scientific synthesis was invisible in the workspace.
 *
 * This component renders ONLY what the mission supplied. It must never:
 *   • generate or reword a conclusion client-side;
 *   • infer, default or rescale confidence;
 *   • promote an evidence gap into a conclusion;
 *   • present the user's own question as evidence or as a finding.
 *
 * Synthesis is deliberately kept visually and semantically distinct from the
 * evidence sections that follow it. A conclusion is the Brain's interpretation
 * of evidence, not another evidence record, and the two must not read as the
 * same kind of claim.
 */

function claimIdsOf(conclusion: MissionConclusion): string[] {
  if (!Array.isArray(conclusion.claim_ids)) return [];
  return conclusion.claim_ids
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0);
}

/** The reported confidence, or null when the mission supplied none. */
function formatMissionConfidence(confidence: number | null | undefined): string | null {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  return confidence.toFixed(2);
}

const ScientificSynthesis: React.FC<{ mission: BrainMission }> = ({ mission }) => {
  const conclusions = Array.isArray(mission.conclusions) ? mission.conclusions : [];
  const confidence = formatMissionConfidence(mission.confidence);
  // Strict: only an explicit `true` marks the result partial. An absent or
  // unknown flag is not evidence that the mission completed.
  const partial = mission.partial === true;

  return (
    <section className="rounded-xl border-2 border-primary/30 bg-primary/[0.03] p-5" data-testid="scientific-synthesis">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Scientific synthesis</h3>
        <p className="text-xs text-muted-foreground">
          The Brain&rsquo;s interpretation of the evidence below — not evidence itself.
        </p>
      </div>

      {partial ? (
        <p
          className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm leading-6"
          role="status"
          data-testid="partial-warning"
        >
          This mission returned a <strong>partial result</strong>. It did not complete every
          planned step, so the synthesis below is incomplete and may change once the remaining
          evidence is retrieved.
        </p>
      ) : null}

      {conclusions.length ? (
        <ol className="mt-3 space-y-3" data-testid="conclusion-list">
          {conclusions.map((conclusion, index) => {
            const claimIds = claimIdsOf(conclusion);
            return (
              <li
                className="rounded-lg bg-background p-3 text-sm"
                key={`conclusion-${index}`}
                data-testid="conclusion"
              >
                {conclusion.type ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {String(conclusion.type).replace(/_/g, ' ')}
                  </p>
                ) : null}
                <p className="mt-0.5 leading-6">{conclusion.text}</p>
                {claimIds.length ? (
                  <p className="mt-2 text-xs text-muted-foreground" data-testid="claim-ids">
                    Claims: {claimIds.join(', ')}
                  </p>
                ) : null}
                <CalyxVerificationWorkbench mission={mission} conclusion={conclusion} />
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed px-3 py-2" data-testid="no-conclusions">
          <p className="text-sm leading-6">
            This mission did not produce a conclusion.
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            The evidence and gaps below stand on their own. An evidence gap is not a
            conclusion, and none has been composed here in place of one.
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground" data-testid="mission-confidence">
        {confidence === null
          ? 'Mission confidence: not supplied by the Brain for this mission.'
          : `Mission confidence as reported by the Brain: ${confidence}.`}
      </p>
    </section>
  );
};

export default ScientificSynthesis;
