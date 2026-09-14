import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, ExternalLink, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '@/components/orchid/Navbar';

type LedgerStatus = 'complete' | 'running' | 'queued' | 'owner_gate' | 'blocked';

type LedgerItem = {
  id?: number;
  ref?: string;
  title: string;
  status: LedgerStatus;
  url?: string;
  updated_at?: string;
};

type LiveLedger = {
  schema_version: number;
  program: string;
  source_of_truth: string;
  hard_paid_ceiling_usd: number;
  paid_spend_usd: number;
  verified_complete_count: number;
  generated_at?: string;
  last_state_change_at?: string | null;
  completed: LedgerItem[];
  active: LedgerItem[];
};

const POLL_MS = 15000;

const statusMeta: Record<LedgerStatus, { label: string; className: string }> = {
  complete: { label: 'Complete', className: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' },
  running: { label: 'Running', className: 'border-sky-300/30 bg-sky-300/10 text-sky-100' },
  queued: { label: 'Queued', className: 'border-[#d4b34a]/35 bg-[#d4b34a]/10 text-[#f6dc82]' },
  owner_gate: { label: 'Owner gate', className: 'border-amber-300/35 bg-amber-300/10 text-amber-100' },
  blocked: { label: 'Blocked', className: 'border-red-300/35 bg-red-300/10 text-red-100' },
};

function StatusBadge({ status }: { status: LedgerStatus }) {
  const meta = statusMeta[status];
  return <span className={`inline-flex rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${meta.className}`}>{meta.label}</span>;
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#c9a24a]">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-[#f5f0e8]">{value}</div>
      {detail ? <div className="mt-1 text-[11px] text-[#cfc8b8]/65">{detail}</div> : null}
    </div>
  );
}

function RefCell({ item }: { item: LedgerItem }) {
  if (!item.ref) return <span className="text-[#cfc8b8]/35">—</span>;
  if (!item.url) return <span>{item.ref}</span>;
  return (
    <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
      {item.ref} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export default function LiveCompletionLedger() {
  const [ledger, setLedger] = useState<LiveLedger | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/data/oc-live-completion-ledger.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = (await response.json()) as LiveLedger;
      setLedger(next);
      setLastFetchedAt(new Date());
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unknown ledger error';
      setError(message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const counts = useMemo(() => {
    const active = ledger?.active ?? [];
    return {
      running: active.filter((item) => item.status === 'running').length,
      queued: active.filter((item) => item.status === 'queued').length,
      ownerGate: active.filter((item) => item.status === 'owner_gate').length,
      blocked: active.filter((item) => item.status === 'blocked').length,
    };
  }, [ledger]);

  const remainingBudget = ledger ? Math.max(0, ledger.hard_paid_ceiling_usd - ledger.paid_spend_usd) : 0;

  return (
    <div className="min-h-screen bg-[#06110b] text-[#f5f0e8]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-5 pb-16 pt-24 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c9a24a]">Mission Control · live telemetry</div>
            <h1 className="mt-3 text-4xl font-semibold sm:text-5xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Orchid Continuum Completion Ledger</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#cfc8b8]/80">
              GitHub-backed completion telemetry. This view polls the machine ledger every 15 seconds and never counts queued work as completed.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/mission-control" className="rounded-full border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#cfc8b8] hover:border-[#d4b34a]/50 hover:text-[#f6dc82]">Mission Control</Link>
            <button type="button" onClick={() => void load()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/50 bg-[#102819] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#f6dc82] disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh now
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-xs text-[#cfc8b8]/75">
          <Activity className="h-4 w-4 text-emerald-300" />
          <span>Source: {ledger?.source_of_truth ?? 'loading'}</span><span>·</span><span>Poll interval: 15s</span><span>·</span>
          <span>Last browser refresh: {lastFetchedAt ? lastFetchedAt.toLocaleTimeString() : 'waiting'}</span>
          {ledger?.generated_at ? <><span>·</span><span>Ledger generated: {new Date(ledger.generated_at).toLocaleString()}</span></> : null}
          {ledger?.last_state_change_at ? <><span>·</span><span>Last GitHub state change: {new Date(ledger.last_state_change_at).toLocaleString()}</span></> : null}
          {error ? <span className="ml-auto inline-flex items-center gap-1 text-red-200"><XCircle className="h-4 w-4" /> {error}</span> : null}
        </div>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Verified complete" value={ledger?.verified_complete_count ?? '—'} />
          <MetricCard label="Running" value={counts.running} detail="active execution" />
          <MetricCard label="Queued" value={counts.queued} detail="eligible reservoir" />
          <MetricCard label="Owner gates" value={counts.ownerGate} />
          <MetricCard label="Blocked" value={counts.blocked} />
          <MetricCard label="Paid budget left" value={ledger ? `$${remainingBudget.toFixed(3)}` : '—'} detail={ledger ? `$${ledger.paid_spend_usd.toFixed(6)} spent / $${ledger.hard_paid_ceiling_usd.toFixed(0)} ceiling` : undefined} />
        </section>

        <section className="mt-8 rounded-xl border border-white/10 bg-[#0b1c11]/85 p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2"><Clock3 className="h-5 w-5 text-sky-200" /><h2 className="text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Current execution</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
              <thead><tr className="border-b border-white/10 font-mono text-[9px] uppercase tracking-[0.12em] text-[#cfc8b8]/55"><th className="px-3 py-3">Status</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Work item</th><th className="px-3 py-3">Updated</th></tr></thead>
              <tbody>{(ledger?.active ?? []).map((item) => <tr key={`${item.ref ?? ''}-${item.title}`} className="border-b border-white/[0.06] last:border-0"><td className="px-3 py-3"><StatusBadge status={item.status} /></td><td className="px-3 py-3 font-mono text-xs text-[#f6dc82]"><RefCell item={item} /></td><td className="px-3 py-3 text-[#f5f0e8]/88">{item.title}</td><td className="px-3 py-3 text-xs text-[#cfc8b8]/55">{item.updated_at ? new Date(item.updated_at).toLocaleString() : '—'}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-emerald-300/15 bg-[#0b1c11]/85 p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><h2 className="text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Verified completion ledger</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-sm">
              <thead><tr className="border-b border-white/10 font-mono text-[9px] uppercase tracking-[0.12em] text-[#cfc8b8]/55"><th className="px-3 py-3">#</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Completed item</th></tr></thead>
              <tbody>{(ledger?.completed ?? []).map((item) => <tr key={item.id ?? item.title} className="border-b border-white/[0.06] last:border-0"><td className="px-3 py-3 font-mono text-xs text-[#cfc8b8]/65">{item.id ?? '—'}</td><td className="px-3 py-3"><StatusBadge status="complete" /></td><td className="px-3 py-3 font-mono text-xs text-[#f6dc82]"><RefCell item={item} /></td><td className="px-3 py-3 text-[#f5f0e8]/88">{item.title}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <div className="mt-8 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-4 text-xs leading-5 text-amber-100/80">
          <div className="mb-1 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-amber-100"><ShieldAlert className="h-4 w-4" /> Evidence rule</div>
          <p>A row enters the verified completion table only after its evidence is accepted. Queue admission, planning, or a draft alone does not increase the completed count.</p>
        </div>
      </main>
    </div>
  );
}
