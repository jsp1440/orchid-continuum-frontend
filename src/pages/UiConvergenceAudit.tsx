import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Layers3, RefreshCw, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '@/components/orchid/Navbar';

type Disposition = 'KEEP' | 'PORT' | 'CONVERGE' | 'SUPERSEDE' | 'ARCHIVE' | 'OWNER_REVIEW';
type Asset = {
  id: string;
  label: string;
  origin: string;
  availability: 'present' | 'referenced_only' | 'unavailable';
  source_repository: string | null;
  source_paths: string[];
  original_capability: string;
  canonical_equivalent: string;
  canonical_destination: string;
  canonical_data_authority: string;
  disposition: Disposition;
  duplication_or_staleness: string;
  representative_slice: boolean;
};
type Registry = {
  schema_version: number;
  audit_id: string;
  source_revision: string;
  generated_at: string;
  authority_rule: string;
  assets: Asset[];
};

const REGISTRY_URL = '/data/ui-convergence-registry.json';
const tone: Record<Disposition, string> = {
  KEEP: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  PORT: 'border-sky-300/30 bg-sky-300/10 text-sky-100',
  CONVERGE: 'border-[#d4b34a]/40 bg-[#d4b34a]/10 text-[#f6dc82]',
  SUPERSEDE: 'border-violet-300/30 bg-violet-300/10 text-violet-100',
  ARCHIVE: 'border-stone-300/25 bg-stone-300/10 text-stone-200',
  OWNER_REVIEW: 'border-amber-300/40 bg-amber-300/10 text-amber-100',
};

export default function UiConvergenceAudit() {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${REGISTRY_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setRegistry(await response.json() as Registry);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unknown registry error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const assets = registry?.assets ?? [];
    return {
      present: assets.filter((asset) => asset.availability === 'present').length,
      converged: assets.filter((asset) => asset.disposition === 'CONVERGE' || asset.disposition === 'KEEP').length,
      review: assets.filter((asset) => asset.disposition === 'OWNER_REVIEW').length,
      unavailable: assets.filter((asset) => asset.availability === 'unavailable').length,
    };
  }, [registry]);

  return (
    <div className="min-h-screen bg-[#06110b] text-[#f5f0e8]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-5 pb-16 pt-24 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c9a24a]">Mission Control · UI convergence</div>
            <h1 className="mt-3 text-4xl font-semibold sm:text-5xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Famous & Legacy Surface Audit</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#cfc8b8]/80">One registry for presentation assets, canonical destinations, scientific authority and unresolved owner review. Missing exports stay unavailable instead of becoming invented work.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/mission-control" className="rounded-full border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em]">Mission Control</Link>
            <button type="button" onClick={() => void load()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/50 bg-[#102819] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#f6dc82] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] p-4 text-sm text-emerald-50">{registry?.authority_rule ?? 'Loading authority boundary…'}</div>
        {error ? <div className="mt-4 rounded-lg border border-red-300/30 bg-red-300/10 p-4 text-sm text-red-100">{error}</div> : null}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[['Assets present', counts.present], ['Keep / converge', counts.converged], ['Owner review', counts.review], ['Source unavailable', counts.unavailable]].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-white/10 bg-white/[0.04] p-4"><div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#c9a24a]">{label}</div><div className="mt-2 text-3xl font-semibold">{value}</div></div>
          ))}
        </section>

        <section className="mt-8 space-y-4">
          {(registry?.assets ?? []).map((asset) => (
            <article key={asset.id} className="rounded-xl border border-white/10 bg-[#0b1c11]/85 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><div className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#cfc8b8]/55">{asset.origin} · {asset.availability}</div><h2 className="mt-2 text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>{asset.label}</h2></div>
                <span className={`rounded-full border px-3 py-1 font-mono text-[9px] tracking-[0.12em] ${tone[asset.disposition]}`}>{asset.disposition}</span>
              </div>
              <div className="mt-4 grid gap-4 text-sm lg:grid-cols-2">
                <div><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#c9a24a]">Canonical destination</div><p className="mt-1">{asset.canonical_destination}</p><p className="mt-2 text-xs leading-5 text-[#cfc8b8]/65">{asset.canonical_data_authority}</p></div>
                <div><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#c9a24a]">Duplication / staleness</div><p className="mt-1 text-[#cfc8b8]/80">{asset.duplication_or_staleness}</p></div>
              </div>
              {asset.source_paths.length ? <div className="mt-4 flex flex-wrap gap-2">{asset.source_paths.map((path) => <a key={path} href={`https://github.com/jsp1440/orchid-continuum-frontend/blob/${registry?.source_revision}/${path}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 font-mono text-[10px] text-[#f6dc82] hover:border-[#d4b34a]/50">{path}<ExternalLink className="h-3 w-3" /></a>)}</div> : <div className="mt-4 inline-flex items-center gap-2 text-xs text-amber-100"><ShieldAlert className="h-4 w-4" /> No auditable source export is present.</div>}
            </article>
          ))}
        </section>

        <div className="mt-8 flex items-start gap-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-4 text-xs leading-5 text-amber-100/85"><Layers3 className="mt-0.5 h-4 w-4 shrink-0" /><p>Bramble and Genus-of-the-Day may become optional presentation doorways only after their source material is available. They must resolve to the same canonical taxon, Lexicon, Matrix, Atlas, Literature and Calyx objects used by the scientific interface.</p></div>
      </main>
    </div>
  );
}
