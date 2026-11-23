import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ExternalLink, LockKeyhole, RefreshCw, Search } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import ScientificCapabilityPanel from '@/components/command-center/ScientificCapabilityPanel';
import { validateOwnerSession } from '@/lib/ownerOperationsConsole';
import {
  dependencyNeighbours,
  evidenceLink,
  fetchHealth,
  fetchRegistry,
  MATURITY_LEVELS,
  maturityLabel,
  searchModules,
  STATUSES,
  statusCounts,
  type CommandCenterHealth,
  type CommandCenterRegistry,
  type ModuleStatus,
} from '@/lib/commandCenter';

const STATUS_TONE: Record<ModuleStatus, string> = {
  DONE: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  RUNNING: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  BLOCKED: 'border-red-300/30 bg-red-300/10 text-red-100',
  NEXT: 'border-sky-300/30 bg-sky-300/10 text-sky-100',
  UNASSESSED: 'border-white/15 bg-white/5 text-[#cfc8b8]',
};

type Auth = 'checking' | 'signed-out' | 'owner';
type Load =
  | { state: 'idle' | 'loading' }
  | { state: 'ready'; registry: CommandCenterRegistry }
  | { state: 'unauthorized' }
  | { state: 'error'; message: string };

function StatusBadge({ status }: { status: ModuleStatus }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${STATUS_TONE[status]}`}>
      {status}
    </span>
  );
}

function EvidenceRef({ value }: { value: string }) {
  const href = evidenceLink(value);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#d4b34a] underline">
      {value}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  ) : (
    <span>{value}</span>
  );
}

const CommandCenter: React.FC = () => {
  const [auth, setAuth] = useState<Auth>('checking');
  const [load, setLoad] = useState<Load>({ state: 'idle' });
  const [health, setHealth] = useState<CommandCenterHealth | { error: string } | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ModuleStatus | 'ALL'>('ALL');
  const [params, setParams] = useSearchParams();
  const selected = params.get('module');

  useEffect(() => {
    void validateOwnerSession()
      .then((s) => setAuth(s.authenticated ? 'owner' : 'signed-out'))
      .catch(() => setAuth('signed-out'));
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoad({ state: 'loading' });
    const result = await fetchRegistry(signal);
    if (signal?.aborted) return;
    if (result.kind === 'ok') setLoad({ state: 'ready', registry: result.data });
    else if (result.kind === 'unauthorized') setLoad({ state: 'unauthorized' });
    else setLoad({ state: 'error', message: result.message });
  }, []);

  useEffect(() => {
    if (auth !== 'owner') return;
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [auth, refresh]);

  const runProbe = async () => {
    const result = await fetchHealth();
    setHealth(result.kind === 'ok' ? result.data : { error: result.kind === 'error' ? result.message : 'Not authorized' });
  };

  const registry = load.state === 'ready' ? load.registry : null;
  const visible = useMemo(() => (registry ? searchModules(registry.modules, query, status) : []), [registry, query, status]);
  const counts = useMemo(() => (registry ? statusCounts(registry.modules) : null), [registry]);
  const detail = useMemo(() => (registry && selected ? dependencyNeighbours(registry.modules, selected) : null), [registry, selected]);
  const select = (name: string) => setParams({ module: name });

  if (auth !== 'owner') {
    return (
      <div className="min-h-screen bg-[#07140d] text-[#f5f0e8]">
        <Navbar />
        <main className="flex min-h-screen items-center justify-center px-6 pt-28">
          <section className="w-full max-w-xl rounded-2xl border border-[#d4b34a]/25 bg-[#0d1d13]/90 p-8">
            <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
              <LockKeyhole className="h-3.5 w-3.5" /> Owner session required
            </div>
            <h1 className="mt-4 text-3xl">Command Center</h1>
            <p className="mt-3 text-sm text-[#cfc8b8]/85">
              {auth === 'checking'
                ? 'Checking your session…'
                : 'The Command Center reads engineering status from the backend and requires an owner session. Sign in through Mission Control, then return here.'}
            </p>
            {auth === 'signed-out' ? (
              <Link to="/mission-control" className="mt-5 inline-block rounded-full bg-[#d4b34a] px-5 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#12170d]">
                Go to Mission Control
              </Link>
            ) : null}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06110b] text-[#f5f0e8]">
      <Navbar />
      <main className="mx-auto max-w-[1500px] px-5 pb-16 pt-24 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Command Center</h1>
            <p className="mt-2 max-w-3xl text-sm text-[#cfc8b8]/85">
              Read-only engineering registry. Statuses come from a reviewed evidence snapshot, not live monitoring.
              A module with no evidence record reads UNASSESSED. Nothing here is scientific health.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#12170d]"
          >
            <RefreshCw className={`h-4 w-4 ${load.state === 'loading' ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        <ScientificCapabilityPanel />

        {load.state === 'unauthorized' ? (
          <p role="alert" className="mt-5 rounded-lg border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">
            The backend rejected this session. Registry not shown.
          </p>
        ) : null}
        {load.state === 'error' ? (
          <p role="alert" className="mt-5 rounded-lg border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            Registry unavailable: {load.message}. Nothing is shown rather than a guess.
          </p>
        ) : null}

        {registry && counts ? (
          <>
            <p className="mt-4 text-[12px] text-[#cfc8b8]/72" data-testid="snapshot-note">
              Evidence is a {registry.evidence_kind} retrieved {registry.evidence_retrieved_at}. {registry.caveat}
            </p>

            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
              <button type="button" onClick={() => setStatus('ALL')} aria-pressed={status === 'ALL'} className="rounded-full border border-white/15 px-3 py-1 text-xs">
                All ({registry.modules.length})
              </button>
              {STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s} className={`rounded-full border px-3 py-1 text-xs ${STATUS_TONE[s]}`}>
                  {s} ({counts[s]})
                </button>
              ))}
            </div>

            <label className="mt-4 flex max-w-md items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2">
              <Search className="h-4 w-4" aria-hidden />
              <input
                aria-label="Search modules"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search modules"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="overflow-x-auto rounded-lg border border-white/10 bg-[#0d1d13]/90">
                <table className="w-full text-left text-[13px]">
                  <thead className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#c9a24a]">
                    <tr><th className="p-3">Module</th><th className="p-3">Status</th><th className="p-3">Routes</th><th className="p-3">Why</th></tr>
                  </thead>
                  <tbody>
                    {visible.map((m) => (
                      <tr key={m.name} className={`border-t border-white/5 ${selected === m.name ? 'bg-white/5' : ''}`}>
                        <td className="p-3">
                          <button type="button" onClick={() => select(m.name)} className="text-[#d4b34a] underline">{m.name}</button>
                        </td>
                        <td className="p-3"><StatusBadge status={m.status} /></td>
                        <td className="p-3">{m.mounted_routes}{m.unmounted_router_files.length ? ` (+${m.unmounted_router_files.length} unmounted)` : ''}</td>
                        <td className="p-3 text-[#cfc8b8]/80">{m.status_reason}</td>
                      </tr>
                    ))}
                    {visible.length === 0 ? <tr><td colSpan={4} className="p-4">No modules match.</td></tr> : null}
                  </tbody>
                </table>
              </section>

              <aside className="space-y-5">
                <section className="rounded-lg border border-white/10 bg-[#0d1d13]/90 p-4" aria-label="Module detail">
                  {detail ? (
                    <>
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg">{detail.module.name}</h2>
                        <StatusBadge status={detail.module.status} />
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-[#cfc8b8]/70">{detail.module.path}</p>
                      <p className="mt-2 text-sm">{detail.module.status_reason}</p>
                      <p className="mt-2 text-sm">
                        Evidence: {detail.module.status_refs.length ? detail.module.status_refs.map((r) => <span key={r} className="mr-2"><EvidenceRef value={r} /></span>) : 'none recorded (UNASSESSED)'}
                      </p>
                      <ul className="mt-3 text-sm" aria-label="Maturity">
                        {MATURITY_LEVELS.map((level) => (
                          <li key={level}>{level}: {maturityLabel(detail.module.maturity[level])}</li>
                        ))}
                      </ul>
                      <p className="mt-3 text-[12px] text-[#cfc8b8]/70">
                        Test files import this module: {detail.module.test_files.length}. That does not mean they pass.
                      </p>
                      <h3 className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#c9a24a]">Depends on</h3>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {detail.dependsOn.length ? detail.dependsOn.map((n) => <button key={n} type="button" onClick={() => select(n)} className="underline">{n}</button>) : <span className="text-sm">none found</span>}
                      </div>
                      <h3 className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#c9a24a]">Used by</h3>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {detail.dependedOnBy.length ? detail.dependedOnBy.map((n) => <button key={n} type="button" onClick={() => select(n)} className="underline">{n}</button>) : <span className="text-sm">none found</span>}
                      </div>
                      {detail.module.unmounted_router_files.length ? (
                        <p className="mt-3 text-[12px] text-amber-100">Unmounted router files: {detail.module.unmounted_router_files.join(', ')}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm">{selected ? `Unknown module "${selected}".` : 'Select a module to see its status, evidence and dependencies.'}</p>
                  )}
                </section>

                <section className="rounded-lg border border-white/10 bg-[#0d1d13]/90 p-4" aria-label="Backend health probe">
                  <h2 className="text-lg">Backend health probe</h2>
                  <p className="mt-1 text-[12px] text-[#cfc8b8]/72">Three separate questions. An HTTP answer is not scientific health.</p>
                  <button type="button" onClick={() => void runProbe()} className="mt-2 rounded-full border border-white/20 px-3 py-1 text-xs">Run probe</button>
                  {health && 'error' in health ? <p role="alert" className="mt-2 text-sm text-red-100">Probe failed: {health.error}</p> : null}
                  {health && 'reachable' in health ? (
                    <dl className="mt-2 text-sm">
                      <dt>Service reachable</dt><dd>{health.reachable.state}</dd>
                      <dt>Application ready</dt><dd>{health.application_ready.state}{health.application_ready.reasons?.length ? ` (${health.application_ready.reasons.join(', ')})` : ''}</dd>
                      <dt>Scientific functionality</dt><dd>{health.scientific.state}</dd>
                      <dt>Deployed commit</dt><dd className="font-mono text-[11px]">{health.deployed_commit_sha ?? 'not attested'}</dd>
                    </dl>
                  ) : null}
                </section>
              </aside>
            </div>

            <section className="mt-6 overflow-x-auto rounded-lg border border-white/10 bg-[#0d1d13]/90 p-4" aria-label="Pull requests">
              <h2 className="text-lg">Pull requests and validation evidence</h2>
              <table className="mt-2 w-full text-left text-[13px]">
                <thead className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#c9a24a]">
                  <tr><th className="p-2">PR</th><th className="p-2">Head</th><th className="p-2">Local</th><th className="p-2">Hosted CI</th><th className="p-2">Independent</th><th className="p-2">CI</th><th className="p-2">Blocker</th></tr>
                </thead>
                <tbody>
                  {registry.pull_requests.map((pr) => (
                    <tr key={pr.number} className="border-t border-white/5">
                      <td className="p-2"><EvidenceRef value={`#${pr.number}`} /> {pr.title}</td>
                      <td className="p-2 font-mono text-[11px]">{pr.head.slice(0, 8)}</td>
                      <td className="p-2">{pr.verification.local ? 'yes' : 'no'}</td>
                      <td className="p-2">{pr.verification.hosted ? 'yes' : 'not verified'}</td>
                      <td className="p-2">{pr.verification.independent ? 'yes' : 'not verified'}</td>
                      <td className="p-2">{pr.ci ? pr.ci.state : 'not refreshed'}{pr.ci?.needs ? ` (needs ${pr.ci.needs.join(', ')})` : ''}</td>
                      <td className="p-2">{pr.blocker ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <section className="rounded-lg border border-white/10 bg-[#0d1d13]/90 p-4" aria-label="Previously unsuccessful approaches">
                <h2 className="text-lg">Previously unsuccessful approaches</h2>
                <ul className="mt-2 space-y-2 text-sm">
                  {registry.unsuccessful_approaches.map((u) => (
                    <li key={u.approach}>{u.approach} — {u.result} (<EvidenceRef value={u.ref} />)</li>
                  ))}
                </ul>
              </section>
              <section className="rounded-lg border border-white/10 bg-[#0d1d13]/90 p-4" aria-label="Memory references">
                <h2 className="text-lg">Shared memory and recovery records</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {registry.memory.map((m) => (
                    <li key={m.path}>{m.path} — {m.role} {m.exists_in_checkout ? '' : '(MISSING in backend checkout)'}</li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        ) : null}
      </main>
      <Footer />
    </div>
  );
};

export default CommandCenter;
