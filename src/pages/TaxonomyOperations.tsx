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

type Gate = {
  name: string;
  detail: string;
  status: 'verified' | 'blocked' | 'pending';
};

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : `Request failed (${response.status})`;
    throw new Error(detail);
  }
  return body;
}

export default function TaxonomyOperations() {
  const [releases, setReleases] = useState<TaxonomyReleaseReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeVerified, setRouteVerified] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/mission-control/taxonomy/releases`, {
        credentials: 'include',
      });
      const body = await parseResponse(response);
      setReleases(Array.isArray(body.releases) ? (body.releases as TaxonomyReleaseReport[]) : []);
      setRouteVerified(true);
    } catch (err) {
      setRouteVerified(false);
      setError(err instanceof Error ? err.message : 'Unable to verify the taxonomy operations route.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latest = releases[0] ?? null;
  const gates = useMemo<Gate[]>(
    () => [
      {
        name: 'Governed intake code',
        detail: 'Parser, immutable checksum intake, and owner-gated upload contract are implemented.',
        status: 'verified',
      },
      {
        name: 'Deployed owner route',
        detail: routeVerified
          ? 'The authenticated taxonomy release listing route responded successfully.'
          : 'The deployed route has not yet been verified from this session.',
        status: routeVerified ? 'verified' : 'blocked',
      },
      {
        name: 'Persistent staging database',
        detail: 'Must be applied and verified against the deployed database before the real release is uploaded.',
        status: 'pending',
      },
      {
        name: 'Release comparison and crosswalk',
        detail: 'Deterministic comparison exists; production execution against two staged releases is still required.',
        status: 'pending',
      },
      {
        name: 'Downstream impact audit',
        detail: 'Read-only impact logic exists; deployed counts must be generated before promotion.',
        status: 'pending',
      },
      {
        name: 'Promotion and rollback certification',
        detail: 'Disposable rehearsal must pass and be recorded before production promotion is enabled.',
        status: 'pending',
      },
      {
        name: 'Owner approval',
        detail: 'Canonical promotion remains unavailable until every preceding gate is verified.',
        status: 'blocked',
      },
    ],
    [routeVerified],
  );

  const verifiedCount = gates.filter((gate) => gate.status === 'verified').length;
  const uploadRecommended = gates.every((gate) => gate.status === 'verified');

  return (
    <div className="min-h-screen bg-[#06110b] text-[#f5f0e8]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-5 pb-20 pt-28 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d4b34a]">
              <ShieldCheck className="h-3.5 w-3.5" /> Calyx governed operations
            </div>
            <h1 className="mt-5 text-4xl md:text-6xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
              Taxonomy <span className="italic text-[#d4b34a]">Operations</span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#cfc8b8]/85">
              A fail-closed view of World Plants intake, comparison, impact analysis, rollback readiness, and owner approval.
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
            <AlertTriangle className="mr-2 inline h-4 w-4" /> {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-[2rem] border border-white/10 bg-[#0b1c11]/90 p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-[#d4b34a]" />
                <h2 className="text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Readiness</h2>
              </div>
              <button onClick={() => void load()} disabled={loading} className="rounded-full border border-white/15 p-2">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="mt-6 text-5xl font-semibold text-[#d4b34a]">{verifiedCount}/{gates.length}</div>
            <p className="mt-2 text-sm text-[#cfc8b8]/70">Verified operational gates</p>
            <div className={`mt-6 rounded-2xl border p-4 text-sm ${uploadRecommended ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/25 bg-amber-300/10 text-amber-100'}`}>
              {uploadRecommended ? 'The real Hassler release is ready for upload.' : 'The real Hassler release should not be uploaded yet.'}
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
              {gates.map((gate) => (
                <article key={gate.name} className="flex gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
                  {gate.status === 'verified' ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                  ) : gate.status === 'blocked' ? (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  ) : (
                    <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-[#cfc8b8]/60" />
                  )}
                  <div>
                    <h3 className="font-medium">{gate.name}</h3>
                    <p className="mt-1 text-xs leading-6 text-[#cfc8b8]/70">{gate.detail}</p>
                  </div>
                </article>
              ))}
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
