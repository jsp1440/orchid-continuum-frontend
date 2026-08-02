import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Database,
  FileSearch,
  GitCompareArrows,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Footer from '@/components/orchid/Footer';
import Navbar from '@/components/orchid/Navbar';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

type TaxonomyReleaseReport = {
  release_id: string;
  snapshot?: {
    filename?: string;
    version_label?: string;
    acquired_at?: string;
    sha256?: string;
    row_count?: number;
  };
  inspection?: {
    rows?: number;
    issues?: number;
    source_encoding?: string;
    photo_references?: number;
  };
};

type BackendGate = {
  name: string;
  status: 'passed' | 'blocked';
  evidence: string;
  checked_at: string;
  blocking_reason?: string | null;
};

type ReadinessReport = {
  ready_for_upload: boolean;
  ready_for_promotion: boolean;
  gates: BackendGate[];
  checked_at: string;
  instruction: string;
  read_only: boolean;
};

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : `Request failed (${response.status})`;
    throw new Error(detail);
  }
  return body;
}

const gateLabels: Record<string, string> = {
  owner_authentication: 'Owner authentication',
  persistent_intake_storage: 'Persistent intake storage',
  database_connection: 'Database connection',
  staging_schema: 'Persistent staging schema',
  deployed_routes: 'Deployed Mission Control routes',
  smoke_fixture: 'Harmless fixture upload and readback',
  comparison_engine: 'Release comparison and crosswalk',
  downstream_impact_audit: 'Downstream impact audit',
  rollback_certification: 'Promotion and rollback certification',
  owner_promotion_approval: 'Owner promotion approval',
};

export default function TaxonomyOperations() {
  const [releases, setReleases] = useState<TaxonomyReleaseReport[]>([]);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [releaseResponse, readinessResponse] = await Promise.all([
        fetch(`${CALYX_BACKEND_BASE_URL}/api/mission-control/taxonomy/releases`, {
          credentials: 'include',
        }),
        fetch(`${CALYX_BACKEND_BASE_URL}/api/mission-control/taxonomy/readiness`, {
          credentials: 'include',
        }),
      ]);
      const releaseBody = await parseResponse(releaseResponse);
      const readinessBody = await parseResponse(readinessResponse);
      setReleases(
        Array.isArray(releaseBody.releases)
          ? (releaseBody.releases as TaxonomyReleaseReport[])
          : [],
      );
      setReadiness(readinessBody as unknown as ReadinessReport);
    } catch (err) {
      setReadiness(null);
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load live taxonomy readiness evidence.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latest = releases[0] ?? null;
  const gates = readiness?.gates ?? [];
  const passedCount = useMemo(
    () => gates.filter((gate) => gate.status === 'passed').length,
    [gates],
  );

  return (
    <div className="min-h-screen bg-[#06110b] text-[#f5f0e8]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-5 pb-20 pt-28 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d4b34a]">
              <ShieldCheck className="h-3.5 w-3.5" /> Live Calyx readiness
            </div>
            <h1 className="mt-5 text-4xl md:text-6xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
              Taxonomy <span className="italic text-[#d4b34a]">Operations</span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#cfc8b8]/85">
              Deployed evidence for World Plants intake, staging, comparison, impact analysis, rollback certification, and owner approval.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/mission-control?view=taxonomy-releases" className="rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#12170d]">
              Open uploader
            </Link>
            <Link to="/mission-control" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em]">
              <ArrowLeft className="h-4 w-4" /> Mission Control
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">
            <AlertTriangle className="mr-2 inline h-4 w-4" /> {error} Readiness remains blocked until live evidence can be retrieved.
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-[2rem] border border-white/10 bg-[#0b1c11]/90 p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-[#d4b34a]" />
                <h2 className="text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Readiness</h2>
              </div>
              <button onClick={() => void load()} disabled={loading} className="rounded-full border border-white/15 p-2" aria-label="Refresh readiness">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="mt-6 text-5xl font-semibold text-[#d4b34a]">{passedCount}/{gates.length || '—'}</div>
            <p className="mt-2 text-sm text-[#cfc8b8]/70">Live operational gates passed</p>
            <div className={`mt-6 rounded-2xl border p-4 text-sm ${readiness?.ready_for_upload ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/25 bg-amber-300/10 text-amber-100'}`}>
              {readiness?.instruction ?? 'Do not upload the production taxonomy file until live readiness evidence is available.'}
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4 text-xs leading-6 text-[#cfc8b8]/75">
              Promotion readiness: <strong className={readiness?.ready_for_promotion ? 'text-emerald-200' : 'text-amber-200'}>{readiness?.ready_for_promotion ? 'approved' : 'blocked'}</strong>. Upload readiness and canonical promotion are intentionally separate decisions.
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/15 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d4b34a]">Staged releases</div>
              <div className="mt-2 text-3xl">{releases.length}</div>
              {latest ? (
                <div className="mt-4 space-y-2 text-xs text-[#cfc8b8]/75">
                  <p>Latest: {latest.snapshot?.version_label ?? latest.release_id}</p>
                  <p>Rows: {latest.inspection?.rows ?? latest.snapshot?.row_count ?? '—'}</p>
                  <p>Issues: {latest.inspection?.issues ?? '—'}</p>
                </div>
              ) : (
                <p className="mt-4 text-xs text-[#cfc8b8]/65">No staged releases were returned.</p>
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-[#0b1c11]/90 p-6 shadow-2xl">
            <h2 className="text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Operational gates</h2>
            <div className="mt-6 space-y-3">
              {gates.length ? gates.map((gate) => (
                <article key={gate.name} className="flex gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
                  {gate.status === 'passed' ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  )}
                  <div>
                    <h3 className="font-medium">{gateLabels[gate.name] ?? gate.name}</h3>
                    <p className="mt-1 text-xs leading-6 text-[#cfc8b8]/70">{gate.evidence}</p>
                    {gate.blocking_reason ? <p className="mt-2 text-xs leading-6 text-amber-200/90">Blocker: {gate.blocking_reason}</p> : null}
                  </div>
                </article>
              )) : (
                <article className="flex gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
                  <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-[#cfc8b8]/60" />
                  <p className="text-xs leading-6 text-[#cfc8b8]/70">Live readiness evidence has not been returned.</p>
                </article>
              )}
            </div>
          </section>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <OperationCard icon={FileSearch} title="Inspect" text="Validate encoding, width, ranks, photos, checksum, and source issues." />
          <OperationCard icon={GitCompareArrows} title="Compare" text="Generate exact-evidence crosswalks and block ambiguous mappings." />
          <OperationCard icon={RotateCcw} title="Certify rollback" text="Prove restoration and historical preservation before promotion." />
        </section>
      </main>
      <Footer />
    </div>
  );
}

function OperationCard({ icon: Icon, title, text }: { icon: typeof FileSearch; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#0b1c11]/90 p-5">
      <Icon className="h-5 w-5 text-[#d4b34a]" />
      <h3 className="mt-4 text-lg">{title}</h3>
      <p className="mt-2 text-xs leading-6 text-[#cfc8b8]/70">{text}</p>
    </article>
  );
}
