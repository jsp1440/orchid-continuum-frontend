import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  FileCheck2,
  FileUp,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import { validateOwnerSession } from '@/lib/ownerOperationsConsole';
import HasslerReleaseLifecyclePanel from '@/components/mission-control/HasslerReleaseLifecyclePanel';
import {
  fetchHasslerReleaseStatus,
  type HasslerReleaseStatusResult,
} from '@/lib/hasslerReleaseLifecycle';

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
    rank_counts?: Record<string, number>;
    photo_references?: number;
  };
  canonical_promotion?: string;
  automatic_promotion?: boolean;
  notes?: string | null;
};

type TaxonomyReadiness = {
  ready_for_upload?: boolean;
  ready_for_promotion?: boolean;
  instruction?: string;
  gates?: Array<{
    name?: string;
    status?: string;
    blocking_reason?: string | null;
  }>;
};

type ConnectionState = 'checking' | 'ready' | 'blocked' | 'offline';
type UploadStage = 'idle' | 'selected' | 'uploading' | 'inspecting' | 'staged' | 'failed';

function detailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (detail && typeof detail === 'object') {
    const record = detail as Record<string, unknown>;
    for (const key of ['message', 'detail', 'code', 'reason']) {
      if (typeof record[key] === 'string' && String(record[key]).trim()) return String(record[key]);
    }
  }
  return fallback;
}

function inferReleaseLabel(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '').trim();
  const explicit = stem.match(/(?:^|\D)(\d{2})[-_. ](\d{2})(?:\D|$)/);
  if (explicit) return `${explicit[1]}-${explicit[2]}`;

  const compact = stem.match(/(?:^|\D)(\d{4})(?:\D|$)/);
  if (compact) return `${compact[1].slice(0, 2)}-${compact[1].slice(2)}`;

  return stem || 'world-plants-release';
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(detailMessage(body.detail, `Request failed (${response.status})`));
  }
  return body;
}

export default function TaxonomyReleases() {
  const [releases, setReleases] = useState<TaxonomyReleaseReport[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [versionLabel, setVersionLabel] = useState('');
  const [acquiredAt, setAcquiredAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestReport, setLatestReport] = useState<TaxonomyReleaseReport | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [ownerAuthenticated, setOwnerAuthenticated] = useState(false);
  const [readiness, setReadiness] = useState<TaxonomyReadiness | null>(null);
  const [stage, setStage] = useState<UploadStage>('idle');
  const [hasslerStatus, setHasslerStatus] = useState<HasslerReleaseStatusResult | null>(null);
  const [hasslerLoading, setHasslerLoading] = useState(true);

  const uploadEnabled = connection === 'ready' && ownerAuthenticated && Boolean(selectedFile) && !uploading;

  const blockedGates = useMemo(
    () => (readiness?.gates ?? []).filter((gate) => gate.status !== 'passed' && gate.name !== 'owner_promotion_approval'),
    [readiness],
  );

  const checkAccessAndReadiness = useCallback(async () => {
    setConnection('checking');
    try {
      const session = await validateOwnerSession();
      setOwnerAuthenticated(session.authenticated === true);
      if (!session.authenticated) {
        setConnection('blocked');
        setError('Your Mission Control owner session is not active. Return to Mission Control and refresh the session.');
        return false;
      }

      const response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/mission-control/taxonomy/readiness`, {
        credentials: 'include',
      });
      const body = (await parseResponse(response)) as TaxonomyReadiness;
      setReadiness(body);
      setConnection(body.ready_for_upload ? 'ready' : 'blocked');
      if (!body.ready_for_upload) {
        setError(body.instruction || 'Taxonomy intake is not ready. Resolve the blocked readiness checks before uploading.');
      } else {
        setError(null);
      }
      return body.ready_for_upload === true;
    } catch (err) {
      setConnection('offline');
      setOwnerAuthenticated(false);
      setError(err instanceof Error ? err.message : 'Unable to reach the live Calyx backend.');
      return false;
    }
  }, []);

  const loadReleases = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/mission-control/taxonomy/releases`, {
        credentials: 'include',
      });
      const body = await parseResponse(response);
      setReleases(Array.isArray(body.releases) ? (body.releases as TaxonomyReleaseReport[]) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load taxonomy releases.');
    } finally {
      setLoading(false);
    }
  }, []);

  // The exact-release lifecycle is a read-only view. It is fetched independently
  // of upload readiness: an owner may inspect where the release stands even when
  // intake is blocked, and the consumer fails closed if the backend cannot answer.
  const loadHasslerStatus = useCallback(async () => {
    setHasslerLoading(true);
    try {
      setHasslerStatus(await fetchHasslerReleaseStatus());
    } finally {
      setHasslerLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const ready = await checkAccessAndReadiness();
      if (ready) await loadReleases();
      await loadHasslerStatus();
    })();
  }, [checkAccessAndReadiness, loadReleases, loadHasslerStatus]);

  const uploadRelease = async () => {
    if (!selectedFile) {
      setError('Choose the Hassler taxonomy file first.');
      return;
    }

    const ready = await checkAccessAndReadiness();
    if (!ready) return;

    setUploading(true);
    setStage('uploading');
    setError(null);
    try {
      const resolvedVersionLabel = versionLabel.trim() || inferReleaseLabel(selectedFile.name);
      const resolvedAcquiredAt = acquiredAt || new Date().toISOString().slice(0, 10);

      const form = new FormData();
      form.append('file', selectedFile);
      form.append('version_label', resolvedVersionLabel);
      form.append('acquired_at', resolvedAcquiredAt);
      if (notes.trim()) form.append('notes', notes.trim());

      const response = await fetch(
        `${CALYX_BACKEND_BASE_URL}/api/mission-control/taxonomy/releases/inspect`,
        {
          method: 'POST',
          body: form,
          credentials: 'include',
        },
      );
      setStage('inspecting');
      const report = (await parseResponse(response)) as TaxonomyReleaseReport;
      setLatestReport(report);
      setStage('staged');
      setSelectedFile(null);
      setVersionLabel('');
      setNotes('');
      await loadReleases();
    } catch (err) {
      setStage('failed');
      setError(err instanceof Error ? err.message : 'Taxonomy upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const selectFile = (file: File | null) => {
    setSelectedFile(file);
    setVersionLabel(file ? inferReleaseLabel(file.name) : '');
    setStage(file ? 'selected' : 'idle');
    setError(null);
  };

  const statusLabel = connection === 'checking'
    ? 'Checking live access…'
    : connection === 'ready'
      ? 'Ready to upload'
      : connection === 'offline'
        ? 'Live backend unavailable'
        : ownerAuthenticated
          ? 'Taxonomy intake blocked'
          : 'Owner authorization required';

  return (
    <div className="min-h-screen bg-[#06110b] text-[#f5f0e8]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-5 pb-20 pt-28 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d4b34a]">
              <ShieldCheck className="h-3.5 w-3.5" /> Owner-gated taxonomy intake
            </div>
            <h1 className="mt-5 text-4xl md:text-6xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
              Taxonomy <span className="italic text-[#d4b34a]">Releases</span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#cfc8b8]/85">
              Choose the World Plants file, then upload it for inspection. The release label and date are filled automatically.
            </p>
          </div>
          <Link to="/mission-control" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] hover:border-[#d4b34a]/60 hover:text-[#d4b34a]">
            <ArrowLeft className="h-4 w-4" /> Mission Control
          </Link>
        </div>

        <div className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm ${connection === 'ready' ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/25 bg-amber-300/10 text-amber-100'}`}>
          <span className="flex items-center gap-2">
            {connection === 'offline' ? <WifiOff className="h-4 w-4" /> : connection === 'ready' ? <CheckCircle2 className="h-4 w-4" /> : <RefreshCw className={`h-4 w-4 ${connection === 'checking' ? 'animate-spin' : ''}`} />}
            {statusLabel}
          </span>
          <button onClick={() => void checkAccessAndReadiness()} className="rounded-full border border-current/25 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em]">
            Check again
          </button>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">
            <AlertTriangle className="mr-2 inline h-4 w-4" /> {error}
            {blockedGates.length ? (
              <ul className="mt-3 space-y-1 pl-6 text-xs">
                {blockedGates.map((gate) => <li key={gate.name}>• {gate.blocking_reason || gate.name}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="mb-6">
          <HasslerReleaseLifecyclePanel result={hasslerStatus} loading={hasslerLoading} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[2rem] border border-white/10 bg-[#0b1c11]/90 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <FileUp className="h-5 w-5 text-[#d4b34a]" />
              <h2 className="text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Upload New World Plants Release</h2>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {['Selected', 'Uploading', 'Saved', 'Inspected', 'Staged'].map((label, index) => {
                const stageIndex = stage === 'idle' ? -1 : stage === 'selected' ? 0 : stage === 'uploading' ? 1 : stage === 'inspecting' ? 3 : stage === 'staged' ? 4 : -1;
                const active = index <= stageIndex;
                return <div key={label} className={`rounded-lg border px-2 py-2 text-center font-mono text-[9px] uppercase tracking-[0.12em] ${active ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100' : 'border-white/10 text-white/35'}`}>{label}</div>;
              })}
            </div>

            <label className="mt-6 block">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d4b34a]">Choose taxonomy file</span>
              <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-[#d4b34a] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-[#12170d]" />
            </label>

            {selectedFile ? (
              <div className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                  <FileCheck2 className="h-4 w-4" />
                  {selectedFile.name}
                </div>
                <p className="mt-1 text-xs text-emerald-100/70">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · release {versionLabel || inferReleaseLabel(selectedFile.name)} · ready to inspect
                </p>
                <button onClick={() => void uploadRelease()} disabled={!uploadEnabled} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#d4b34a] px-5 py-4 font-mono text-sm font-bold uppercase tracking-[0.16em] text-[#12170d] shadow-lg disabled:cursor-not-allowed disabled:opacity-40">
                  {uploading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5" />}
                  {stage === 'uploading' ? 'Uploading…' : stage === 'inspecting' ? 'Inspecting…' : 'Upload & Inspect'}
                </button>
                {!uploadEnabled && !uploading ? (
                  <p className="mt-2 text-center text-xs text-emerald-100/65">
                    {connection === 'checking' ? 'Checking upload access…' : connection === 'ready' ? 'Preparing upload…' : 'Upload access must be ready before this file can be sent.'}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#cfc8b8]/70">Choose the file. No release label, date, or notes are required from you.</p>
            )}

            <details className="mt-5 rounded-xl border border-white/10 bg-black/15 p-4">
              <summary className="cursor-pointer text-xs font-semibold text-[#cfc8b8]/80">Advanced details (optional)</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d4b34a]">Release label</span>
                  <input value={versionLabel} onChange={(event) => { setVersionLabel(event.target.value); setError(null); }} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" />
                </label>
                <label>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d4b34a]">Acquired date</span>
                  <input type="date" value={acquiredAt} onChange={(event) => { setAcquiredAt(event.target.value); setError(null); }} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" />
                </label>
                <label className="sm:col-span-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d4b34a]">Source notes</span>
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" />
                </label>
              </div>
            </details>

            <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-xs leading-6 text-amber-100/85">
              Uploading stores and inspects the release only. It does not replace the active taxonomy.
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-[#0b1c11]/90 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-[#d4b34a]" />
              <h2 className="text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Latest Inspection</h2>
            </div>
            {latestReport ? (
              <div className="mt-6 space-y-4 text-sm">
                <div className="flex items-center gap-2 text-emerald-200"><FileCheck2 className="h-4 w-4" /> Saved, inspected, and staged</div>
                <ReportSummary report={latestReport} />
              </div>
            ) : (
              <p className="mt-6 text-sm leading-7 text-[#cfc8b8]/70">The saved release ID, checksum, row count, and inspection result will appear here after upload.</p>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-[#0b1c11]/90 p-6 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Received Releases</h2>
            <button onClick={() => void loadReleases()} disabled={loading || !ownerAuthenticated} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] hover:border-[#d4b34a]/60 disabled:opacity-40">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {releases.length ? releases.map((report) => (
              <article key={report.release_id} className="rounded-2xl border border-white/10 bg-black/15 p-5">
                <ReportSummary report={report} />
              </article>
            )) : <p className="text-sm text-[#cfc8b8]/70">No taxonomy releases have been staged yet.</p>}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function ReportSummary({ report }: { report: TaxonomyReleaseReport }) {
  const snapshot = report.snapshot ?? {};
  const inspection = report.inspection ?? {};
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      <dt className="text-[#cfc8b8]/65">Release ID</dt><dd className="font-mono text-xs">{report.release_id}</dd>
      <dt className="text-[#cfc8b8]/65">Release</dt><dd>{snapshot.version_label ?? report.release_id}</dd>
      <dt className="text-[#cfc8b8]/65">File</dt><dd className="truncate" title={snapshot.filename}>{snapshot.filename ?? '—'}</dd>
      <dt className="text-[#cfc8b8]/65">Rows</dt><dd>{inspection.rows ?? snapshot.row_count ?? '—'}</dd>
      <dt className="text-[#cfc8b8]/65">Issues</dt><dd>{inspection.issues ?? '—'}</dd>
      <dt className="text-[#cfc8b8]/65">Encoding</dt><dd>{inspection.source_encoding ?? '—'}</dd>
      <dt className="text-[#cfc8b8]/65">Photos</dt><dd>{inspection.photo_references ?? '—'}</dd>
      <dt className="text-[#cfc8b8]/65">Promotion</dt><dd className="text-amber-200">{report.canonical_promotion ?? 'blocked'}</dd>
      <dt className="text-[#cfc8b8]/65">Checksum</dt><dd className="truncate font-mono text-xs" title={snapshot.sha256}>{snapshot.sha256 ?? '—'}</dd>
    </dl>
  );
}
