import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Database, FileUp, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
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
    rank_counts?: Record<string, number>;
    photo_references?: number;
  };
  canonical_promotion?: string;
  automatic_promotion?: boolean;
  notes?: string | null;
};

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : `Request failed (${response.status})`;
    throw new Error(detail);
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

  const loadReleases = useCallback(async () => {
    setLoading(true);
    setError(null);
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

  useEffect(() => {
    void loadReleases();
  }, [loadReleases]);

  const uploadRelease = async () => {
    if (!selectedFile || !versionLabel.trim() || !acquiredAt) {
      setError('Choose the Hassler taxonomy file and enter its release label and acquisition date.');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      form.append('version_label', versionLabel.trim());
      form.append('acquired_at', acquiredAt);
      if (notes.trim()) form.append('notes', notes.trim());

      const response = await fetch(
        `${CALYX_BACKEND_BASE_URL}/api/mission-control/taxonomy/releases/inspect`,
        {
          method: 'POST',
          body: form,
          credentials: 'include',
        },
      );
      const report = (await parseResponse(response)) as TaxonomyReleaseReport;
      setLatestReport(report);
      setSelectedFile(null);
      setNotes('');
      await loadReleases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Taxonomy upload failed.');
    } finally {
      setUploading(false);
    }
  };

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
              Upload Michael Hassler’s World Plants orchid taxonomy for inspection and immutable staging. Uploading never replaces the active canonical taxonomy.
            </p>
          </div>
          <Link
            to="/mission-control"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] hover:border-[#d4b34a]/60 hover:text-[#d4b34a]"
          >
            <ArrowLeft className="h-4 w-4" /> Mission Control
          </Link>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">
            <AlertTriangle className="mr-2 inline h-4 w-4" /> {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[2rem] border border-white/10 bg-[#0b1c11]/90 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <FileUp className="h-5 w-5 text-[#d4b34a]" />
              <h2 className="text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Upload New World Plants Release</h2>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d4b34a]">Taxonomy file</span>
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  className="mt-2 block w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-[#d4b34a] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-[#12170d]"
                />
              </label>
              <label>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d4b34a]">Release label</span>
                <input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="26-08" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" />
              </label>
              <label>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d4b34a]">Acquired date</span>
                <input type="date" value={acquiredAt} onChange={(event) => setAcquiredAt(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" />
              </label>
              <label className="sm:col-span-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d4b34a]">Source notes</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Received directly from Michael Hassler by email…" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" />
              </label>
            </div>

            <button onClick={() => void uploadRelease()} disabled={uploading} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#12170d] disabled:opacity-50">
              {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {uploading ? 'Inspecting release' : 'Upload and Inspect'}
            </button>

            <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-xs leading-6 text-amber-100/85">
              This action only stores the original bytes by checksum and creates an inspection report. Canonical promotion, production relinking, and fuzzy mapping remain blocked.
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-[#0b1c11]/90 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-[#d4b34a]" />
              <h2 className="text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Latest Inspection</h2>
            </div>
            {latestReport ? (
              <div className="mt-6 space-y-4 text-sm">
                <div className="flex items-center gap-2 text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Release inspected and staged</div>
                <ReportSummary report={latestReport} />
              </div>
            ) : (
              <p className="mt-6 text-sm leading-7 text-[#cfc8b8]/70">The inspection summary will appear here after upload.</p>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-[#0b1c11]/90 p-6 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Received Releases</h2>
            <button onClick={() => void loadReleases()} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] hover:border-[#d4b34a]/60">
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
