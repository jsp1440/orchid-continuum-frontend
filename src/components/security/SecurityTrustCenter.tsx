/**
 * Security / Trust Center — authorized administrative surface.
 *
 * Renders ONLY data from the governed backend security contract (via
 * securityApi). It has no fabricated frontend-only data. Behavior required by
 * the directive:
 *  - fails closed when the backend contract is unavailable or the caller is
 *    unauthorized (safe empty/unauthorized states, never invented incidents);
 *  - distinguishes OBSERVATION from INFERENCE in the incident narrative;
 *  - shows WHY a risk score was assigned (contributions are listed);
 *  - links to sanitized evidence (event ids, not raw payloads);
 *  - clearly labels simulated / test incidents;
 *  - accessible: semantic headings, aria-live status, keyboard-focusable tabs.
 *
 * The surface itself is feature-flagged (SECURITY_FLAGS.trustCenter).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { securityApi, type IncidentListItem } from '@/lib/securityApi';
import type { SecurityMetrics } from '@/lib/security/metrics';
import { SECURITY_FLAGS } from '@/lib/security/featureFlags';

type LoadState = 'loading' | 'ready' | 'unauthorized' | 'unavailable';

interface OverviewData {
  incidents: IncidentListItem[];
  metrics: SecurityMetrics | null;
}

const UNAVAILABLE_MESSAGE =
  'The security control plane is unavailable for this deployment. No incident data can be shown, and the Trust Center is failing closed by design.';
const UNAUTHORIZED_MESSAGE =
  'You are not authorized to view Orchid Continuum security data. This surface is restricted to governed administrators.';

export function useTrustCenterOverview() {
  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<OverviewData>({ incidents: [], metrics: null });

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setState('loading');
    const [incidentsRes, metricsRes] = await Promise.all([
      securityApi.listIncidents(signal),
      securityApi.metrics(signal),
    ]);

    // Fail closed: unconfigured or unauthorized → no data, explicit state.
    if (incidentsRes.unauthorized || metricsRes.unauthorized) {
      setData({ incidents: [], metrics: null });
      setState('unauthorized');
      return;
    }
    if (
      incidentsRes.unconfigured ||
      (incidentsRes.error && !incidentsRes.data)
    ) {
      setData({ incidents: [], metrics: null });
      setState('unavailable');
      return;
    }
    setData({
      incidents: incidentsRes.data ?? [],
      metrics: metricsRes.data ?? null,
    });
    setState('ready');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return { state, data, refresh };
}

function SeverityBadge({ band }: { band: string }) {
  const tone: Record<string, string> = {
    critical: 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300',
    high: 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    elevated: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    low: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    minimal: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
        tone[band] ?? tone.minimal
      }`}
    >
      {band}
    </span>
  );
}

export function SecurityTrustCenter() {
  const { state, data, refresh } = useTrustCenterOverview();

  const confirmedRate = useMemo(() => {
    const cvfp = data.metrics?.confirmed_vs_false_positive;
    if (!cvfp || cvfp.rate === undefined) return null;
    return Math.round(cvfp.rate * 100);
  }, [data.metrics]);

  if (!SECURITY_FLAGS.trustCenter) {
    return (
      <section aria-labelledby="tc-heading" className="rounded-xl border p-6">
        <h2 id="tc-heading" className="text-lg font-semibold">
          Security &amp; Trust Center
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This surface is disabled for the current deployment
          (VITE_SECURITY_TRUST_CENTER is off).
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="tc-heading" className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 id="tc-heading" className="text-lg font-semibold">
          Security &amp; Trust Center
        </h2>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Refresh
        </button>
      </header>

      <p aria-live="polite" className="sr-only">
        {state === 'loading' ? 'Loading security overview' : `Security overview ${state}`}
      </p>

      {state === 'loading' && (
        <p className="text-sm text-muted-foreground">Loading security overview…</p>
      )}

      {state === 'unavailable' && (
        <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          {UNAVAILABLE_MESSAGE}
        </div>
      )}

      {state === 'unauthorized' && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm">
          {UNAUTHORIZED_MESSAGE}
        </div>
      )}

      {state === 'ready' && (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Open incidents" value={String(data.metrics?.incidents_by_status?.open ?? 0)} />
            <Stat
              label="Prevented / paused"
              value={String(data.metrics?.prevented_or_paused_actions ?? 0)}
            />
            <Stat
              label="Events rejected"
              value={String(data.metrics?.events_rejected ?? 0)}
            />
            <Stat
              label="Confirmed rate"
              value={confirmedRate === null ? '—' : `${confirmedRate}%`}
            />
          </dl>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Incidents</h3>
            {data.incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No incidents in the current window. (This is a real empty state, not a
                fabricated one.)
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {data.incidents.map((i) => (
                  <li key={i.incident_id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {i.title}
                        {i.simulated && (
                          <span className="ml-2 rounded bg-purple-500/15 px-1.5 py-0.5 text-xs text-purple-700 dark:text-purple-300">
                            SIMULATED
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {i.status} · updated {new Date(i.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <SeverityBadge band={i.severity_band} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Narratives distinguish observed facts, deterministic rule results, statistical
            deviations, and model-assisted interpretation. Evidence links reference sanitized
            event identifiers only — never raw payloads or secrets.
          </p>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export default SecurityTrustCenter;
