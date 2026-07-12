import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpenText, CheckCircle2, Database, FlaskConical, KeyRound, Layers3, Leaf, LockKeyhole, Network, RefreshCw, ShieldCheck } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import { createOwnerSession, endOwnerSession, validateOwnerSession } from '@/lib/ownerOperationsConsole';
import {
  fetchCalyxScienceDashboard,
  type CalyxScienceDashboard,
  type ScienceDepartment,
  type ScienceGap,
} from '@/lib/calyxScience';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

function formatFlag(value: unknown): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  if (value === undefined || value === null || value === '') return 'unknown';
  return String(value);
}

function priorityTone(priority?: number): string {
  if ((priority ?? 0) >= 95) return 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100';
  if ((priority ?? 0) >= 88) return 'border-sky-300/25 bg-sky-300/10 text-sky-100';
  return 'border-white/10 bg-white/5 text-[#cfc8b8]';
}

function Stat({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: typeof Network }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a24a]">{label}</div>
        <Icon className="h-4 w-4 text-[#d4b34a]" strokeWidth={1.5} />
      </div>
      <div className="mt-3 text-2xl text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>{value}</div>
    </div>
  );
}

function DepartmentRow({ department }: { department: ScienceDepartment }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>{department.display_name}</h3>
          <p className="mt-1 text-xs leading-5 text-[#cfc8b8]/72">{department.cadence_hint ?? 'Cadence pending review'}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${priorityTone(department.priority)}`}>
          priority {department.priority}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(department.primary_outputs ?? []).slice(0, 4).map((output) => (
          <span key={output} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-[#cfc8b8]/78">
            {output.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
    </div>
  );
}

function GapRow({ gap }: { gap: ScienceGap }) {
  return (
    <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-amber-200">{gap.department_id}</div>
          <p className="mt-2 text-sm leading-6 text-[#f5f0e8]/86">{gap.summary}</p>
        </div>
        <span className="rounded-full border border-amber-200/25 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-amber-100">
          {gap.review_status ?? 'needs_review'}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-[12px] text-[#cfc8b8]/78 sm:grid-cols-3">
        <div>Mission: {gap.recommended_mission ?? 'schema review'}</div>
        <div>Confidence: {gap.confidence ?? 'audit only'}</div>
        <div>Promoted claims: {formatFlag(gap.promoted_claims)}</div>
      </div>
    </div>
  );
}

const CalyxScienceStatus: React.FC = () => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [state, setState] = useState<LoadState>('idle');
  const [dashboard, setDashboard] = useState<CalyxScienceDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (signal?: AbortSignal) => {
    setState('loading');
    setError(null);
    try {
      const next = await fetchCalyxScienceDashboard(signal);
      setDashboard(next);
      setState('ready');
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Unknown Calyx science telemetry error');
      setState('error');
    }
  };

  const unlock = async () => {
    try {
      await createOwnerSession(accessCode.trim());
      setAccessCode('');
      setIsUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Owner session failed');
    }
  };

  const lock = async () => {
    await endOwnerSession().catch(() => undefined);
    setIsUnlocked(false);
    setAccessCode('');
    setDashboard(null);
    setState('idle');
  };

  useEffect(() => {
    void validateOwnerSession().then((session) => setIsUnlocked(session.authenticated)).catch(() => setIsUnlocked(false));
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [isUnlocked]);

  const topDepartments = useMemo(
    () => (dashboard?.summary.top_priorities?.length ? dashboard.summary.top_priorities : dashboard?.departments ?? []).slice(0, 8),
    [dashboard],
  );

  const topGaps = useMemo(
    () => (dashboard?.summary.highest_priority_gaps?.length ? dashboard.summary.highest_priority_gaps : dashboard?.gaps ?? []).slice(0, 6),
    [dashboard],
  );

  const safety = dashboard?.summary.safety ?? dashboard?.status.safety;

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#07140d] text-[#f5f0e8]">
        <Navbar />
        <main className="flex min-h-screen items-center justify-center px-6 pt-28">
          <section className="w-full max-w-xl rounded-[2rem] border border-[#d4b34a]/25 bg-[#0d1d13]/90 p-8 shadow-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
              <LockKeyhole className="h-3.5 w-3.5" /> Owner-only access
            </div>
            <h1 className="mt-6 text-4xl leading-tight md:text-5xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
              Science Mission Status
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#cfc8b8]/85">
              Calyx science telemetry is part of Mission Control and remains behind the owner gate until server-side roles are available.
            </p>
            <label className="mt-8 block font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">
              Access code
            </label>
            <input
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') unlock();
              }}
              type="password"
              className="mt-3 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-[#f5f0e8] outline-none focus:border-[#d4b34a]/60"
              placeholder="Enter owner code"
            />
            <button
              onClick={unlock}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#12170d] transition-colors hover:bg-[#e5c85c]"
            >
              <KeyRound className="h-3.5 w-3.5" /> Unlock
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06110b] text-[#f5f0e8]">
      <Navbar />
      <main className="pt-20">
        <section className="border-b border-white/[0.08] bg-[#0a170f]">
          <div className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
                  <FlaskConical className="h-3.5 w-3.5" /> BUILD-049 - Calyx science runtime
                </div>
                <h1 className="mt-5 text-4xl leading-tight md:text-6xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
                  Science mission status
                </h1>
                <p className="mt-4 max-w-3xl text-[15px] leading-7 text-[#cfc8b8]/88">
                  Read-only visibility into Calyx science priorities, coverage gaps, datasets, harvesters, and dossier queues. This view reports audit readiness only and does not promote unreviewed ecological claims.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => void load()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#12170d] transition-colors hover:bg-[#e5c85c]"
                >
                  <RefreshCw className={`h-4 w-4 ${state === 'loading' ? 'animate-spin' : ''}`} /> Refresh
                </button>
                <button
                  onClick={lock}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a]/60 hover:text-[#d4b34a]"
                >
                  <LockKeyhole className="h-4 w-4" /> Lock
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
          {state === 'error' ? (
            <div className="mb-5 rounded-lg border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">
              <AlertTriangle className="mr-2 inline h-4 w-4" /> {error}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Stat label="Runtime mode" value={dashboard?.summary.mode ?? dashboard?.status.mode ?? 'loading'} icon={Network} />
            <Stat label="Science departments" value={dashboard?.summary.department_count ?? dashboard?.departments.length ?? '-'} icon={Layers3} />
            <Stat label="Mission types" value={dashboard?.summary.mission_type_count ?? dashboard?.missions.length ?? '-'} icon={Leaf} />
            <Stat label="Known gaps" value={dashboard?.status.known_gap_count ?? dashboard?.gaps.length ?? '-'} icon={AlertTriangle} />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-5">
              <section className="rounded-lg border border-white/[0.08] bg-[#0d1d13]/90 p-5">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">
                  <ShieldCheck className="h-4 w-4" /> Priority model
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {topDepartments.map((department) => (
                    <DepartmentRow key={department.department_id} department={department} />
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-white/[0.08] bg-[#0d1d13]/90 p-5">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">
                  <AlertTriangle className="h-4 w-4" /> Highest-priority coverage gaps
                </div>
                <div className="mt-4 space-y-3">
                  {topGaps.length ? topGaps.map((gap) => <GapRow key={gap.gap_id} gap={gap} />) : (
                    <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4 text-sm text-[#cfc8b8]/76">
                      No gap telemetry loaded yet.
                    </div>
                  )}
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-lg border border-white/[0.08] bg-[#0d1d13]/90 p-5">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">
                  <CheckCircle2 className="h-4 w-4" /> Safety gates
                </div>
                <div className="mt-4 space-y-3 text-sm text-[#cfc8b8]/82">
                  <div>Destructive actions: {formatFlag(safety?.destructive_actions)}</div>
                  <div>External mutations: {formatFlag(safety?.external_mutations)}</div>
                  <div>Unsupported claims promoted: {formatFlag(safety?.unsupported_claims_promoted)}</div>
                  <div>Provenance required: {formatFlag(safety?.provenance_required_for_scientific_claims)}</div>
                </div>
              </section>

              <section className="rounded-lg border border-white/[0.08] bg-[#0d1d13]/90 p-5">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">
                  <Database className="h-4 w-4" /> Dataset readiness
                </div>
                <div className="mt-4 space-y-3">
                  {(dashboard?.datasets ?? []).slice(0, 6).map((dataset) => (
                    <div key={dataset.dataset_id} className="rounded-lg border border-white/[0.07] bg-black/18 p-3">
                      <div className="text-sm text-[#faf7f2]">{dataset.display_name}</div>
                      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a]">{dataset.integration_state ?? 'unknown'}</div>
                      <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/70">Next safe action: {dataset.next_safe_action ?? 'review source mapping'}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-white/[0.08] bg-[#0d1d13]/90 p-5">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">
                  <BookOpenText className="h-4 w-4" /> Dossier queues
                </div>
                <div className="mt-4 space-y-3">
                  {(dashboard?.dossiers ?? []).map((candidate) => (
                    <div key={candidate.queue_name} className="rounded-lg border border-white/[0.07] bg-black/18 p-3">
                      <div className="text-sm text-[#faf7f2]">{candidate.queue_name.replace(/_/g, ' ')}</div>
                      <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/70">{candidate.priority_reason ?? candidate.status ?? 'Candidate queue ready.'}</p>
                    </div>
                  ))}
                </div>
              </section>

              <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4 text-[12px] leading-5 text-[#cfc8b8]/72">
                Backend: {CALYX_BACKEND_BASE_URL}<br />
                Last fetched: {dashboard ? new Date(dashboard.fetchedAt).toLocaleString() : 'not loaded'}
              </div>
            </aside>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default CalyxScienceStatus;
