import { AlertTriangle, CircleDashed, GitBranch, Lock, ShieldCheck } from 'lucide-react';
import type {
  HasslerLifecycleState,
  HasslerReleaseStatusResult,
} from '@/lib/hasslerReleaseLifecycle';

const STATE_LABEL: Record<HasslerLifecycleState, string> = {
  UNAVAILABLE: 'Evidence unavailable',
  ABSENT: 'Absent',
  UPLOADED_INSPECTED: 'Uploaded & inspected',
  SMOKE_VERIFIED: 'Smoke-verified',
  STAGING_IN_PROGRESS: 'Staging in progress',
  STAGED_COMPLETE: 'Staged (complete)',
  SUPERSEDED: 'Superseded',
  ACTIVATED: 'Activated',
};

const ACTIVE_VS_STAGED_LABEL: Record<string, string> = {
  exact_release_is_active: 'The exact release is the active canonical taxonomy.',
  active_release_differs_from_exact_release:
    'The active canonical taxonomy is a different release from the exact one.',
  no_active_canonical_release: 'No active canonical release is in force.',
};

function stateLabel(state: string): string {
  return STATE_LABEL[state as HasslerLifecycleState] ?? state.replaceAll('_', ' ').toLowerCase();
}

function activeVsStagedLabel(value: string | null): string | null {
  if (!value) return null;
  return ACTIVE_VS_STAGED_LABEL[value] ?? value.replaceAll('_', ' ');
}

/**
 * Read-only Mission Control view of the exact Hassler / World Plants release
 * lifecycle. Fails closed: when the backend cannot answer, it says the status
 * is unavailable rather than asserting the release is absent, and it never
 * renders a withheld downstream count as zero. It carries no control that could
 * upload, stage, activate, or publish anything.
 */
export default function HasslerReleaseLifecyclePanel({
  result,
  loading,
}: {
  result: HasslerReleaseStatusResult | null;
  loading?: boolean;
}) {
  return (
    <section
      className="rounded-2xl border border-white/10 bg-black/20 p-5"
      data-testid="hassler-release-lifecycle"
    >
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-amber-300" />
        <h3 className="text-sm font-semibold tracking-wide">Exact release lifecycle</h3>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          Reading the exact-release lifecycle…
        </p>
      ) : !result || result.kind === 'unreachable' ? (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
          data-testid="hassler-unreachable"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm text-muted-foreground">
            {result?.kind === 'unreachable'
              ? result.reason
              : 'Exact-release lifecycle status is not available.'}{' '}
            This says nothing about whether the release has been uploaded, staged, or activated.
          </p>
        </div>
      ) : (
        <LifecycleBody status={result.status} />
      )}
    </section>
  );
}

function LifecycleBody({ status }: { status: Extract<HasslerReleaseStatusResult, { kind: 'available' }>['status'] }) {
  const active = activeVsStagedLabel(status.activeVsStaged);
  return (
    <div className="mt-3 space-y-4" data-testid="hassler-available">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {status.expectedRelease.filename || 'Exact release'}
          {status.expectedRelease.versionLabel ? ` · ${status.expectedRelease.versionLabel}` : ''}
        </p>
        <p className="mt-1 text-lg font-semibold" data-testid="hassler-state">
          {stateLabel(status.lifecycleState)}
        </p>
        {status.rationale ? (
          <p className="mt-1 text-sm text-muted-foreground">{status.rationale}</p>
        ) : null}
      </div>

      {/* The ladder, current rung marked. Ordering comes from the backend. */}
      <ol className="flex flex-wrap gap-1.5" aria-label="Lifecycle ladder">
        {status.lifecycleStates.map((step) => {
          const current = step === status.lifecycleState;
          return (
            <li
              key={step}
              data-current={current || undefined}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                current
                  ? 'border-amber-400/60 bg-amber-400/15 font-medium text-amber-200'
                  : 'border-white/10 text-muted-foreground'
              }`}
            >
              {stateLabel(step)}
            </li>
          );
        })}
      </ol>

      {active ? (
        <p className="text-sm" data-testid="hassler-active-vs-staged">
          {active}
        </p>
      ) : null}

      {status.superseded && status.supersededBy ? (
        <p className="text-sm text-muted-foreground">Superseded by {status.supersededBy}.</p>
      ) : null}

      {/* Evidence the pipeline could not establish — stated as such, never as a
          false or a zero. */}
      {status.unavailableEvidence.length ? (
        <div data-testid="hassler-unavailable-evidence">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CircleDashed className="h-3.5 w-3.5" /> Evidence not yet established
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
            {status.unavailableEvidence.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Downstream relink/backfill surfaces. Counts appear only when observed. */}
      {status.relinkDomains.length ? (
        <div data-testid="hassler-relink">
          <p className="text-xs font-medium text-muted-foreground">
            Downstream relink impact{status.relinkCountsComplete ? '' : ' (some counts not yet observed)'}
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {status.relinkDomains.map((domain) => (
              <li key={domain.surface} className="flex justify-between gap-3">
                <span>{domain.surface.replaceAll('_', ' ')}</span>
                <span className="text-muted-foreground" data-testid={`hassler-relink-${domain.surface}`}>
                  {domain.countObserved && domain.count !== null ? domain.count.toLocaleString() : 'not observed'}
                </span>
              </li>
            ))}
          </ul>
          {status.relinkUnresolvedBlockers.length ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-300/80">
              {status.relinkUnresolvedBlockers.map((blocker, index) => (
                <li key={`${blocker}-${index}`}>{blocker}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Governance invariants. This surface reads state; it cannot change it. */}
      <div className="flex flex-wrap gap-3 border-t border-white/10 pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3.5 w-3.5" /> {status.readOnly ? 'Read-only' : 'Read-only status not confirmed'}
        </span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          {status.automaticPromotion ? 'Automatic promotion REPORTED — review' : 'No automatic promotion'}
        </span>
        <span>Activation requires explicit owner approval.</span>
      </div>
    </div>
  );
}
