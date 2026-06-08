import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { featuredGenusName } from '@/lib/featuredGenus';
import { supabase } from '@/lib/supabase';
import { BACKEND_BASE_URL, IMAGES_BACKEND_BASE_URL } from '@/lib/backendConfig';
import { OC_BACKEND_BASE, ATLAS_OCCURRENCES_URL } from '@/lib/ocBackend';

type CheckStatus = 'pending' | 'ok' | 'empty' | 'error';

interface DiagnosticCheck {
  key: string;
  label: string;
  url?: string;
  status: CheckStatus;
  httpStatus?: number;
  count?: number;
  elapsedMs?: number;
  error?: string;
  sample?: unknown;
  notes?: string;
}

function countRows(payload: unknown): number | undefined {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== 'object') return undefined;
  const o = payload as Record<string, unknown>;
  for (const key of ['images', 'occurrences', 'species', 'results', 'data', 'items', 'records', 'partners']) {
    const v = o[key];
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === 'object') {
      const nested = v as Record<string, unknown>;
      for (const nestedKey of ['images', 'occurrences', 'species', 'results', 'items', 'records', 'partners']) {
        const nv = nested[nestedKey];
        if (Array.isArray(nv)) return nv.length;
      }
    }
  }
  if (typeof o.count === 'number') return o.count;
  if (typeof o.total === 'number') return o.total;
  return undefined;
}

function samplePayload(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload.slice(0, 3);
  if (!payload || typeof payload !== 'object') return payload;
  const o = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(o)) {
    if (Array.isArray(value)) out[key] = value.slice(0, 3);
    else if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      const nestedOut: Record<string, unknown> = {};
      for (const [nestedKey, nestedValue] of Object.entries(nested)) {
        nestedOut[nestedKey] = Array.isArray(nestedValue) ? nestedValue.slice(0, 3) : nestedValue;
      }
      out[key] = nestedOut;
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function fetchCheck(key: string, label: string, url: string, notes?: string): Promise<DiagnosticCheck> {
  const started = performance.now();
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const elapsedMs = Math.round(performance.now() - started);
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = await res.text();
    }
    const count = countRows(payload);
    return {
      key,
      label,
      url,
      status: !res.ok ? 'error' : count === 0 ? 'empty' : 'ok',
      httpStatus: res.status,
      count,
      elapsedMs,
      sample: samplePayload(payload),
      notes,
    };
  } catch (err) {
    return {
      key,
      label,
      url,
      status: 'error',
      elapsedMs: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : String(err),
      notes,
    };
  }
}

function statusClass(status: CheckStatus): string {
  switch (status) {
    case 'ok':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30';
    case 'empty':
      return 'bg-amber-500/15 text-amber-200 border-amber-400/30';
    case 'error':
      return 'bg-red-500/15 text-red-200 border-red-400/30';
    default:
      return 'bg-slate-500/15 text-slate-200 border-slate-400/30';
  }
}

const DailyGenusDiagnostics: React.FC = () => {
  const [genusInput, setGenusInput] = useState(featuredGenusName());
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [snapshot, setSnapshot] = useState<DiagnosticCheck | null>(null);
  const [running, setRunning] = useState(false);

  const genus = useMemo(() => genusInput.trim() || featuredGenusName(), [genusInput]);
  const encoded = encodeURIComponent(genus);
  const today = new Date().toISOString().slice(0, 10);

  const run = async () => {
    setRunning(true);
    setChecks([]);
    setSnapshot(null);

    const localGenus = featuredGenusName();

    try {
      const started = performance.now();
      const { data, error, status } = await supabase
        .from('daily_genus_snapshot')
        .select('*')
        .eq('snapshot_date', today)
        .maybeSingle();

      setSnapshot({
        key: 'snapshot',
        label: 'Supabase daily_genus_snapshot row',
        status: error ? 'error' : data ? 'ok' : 'empty',
        httpStatus: status,
        elapsedMs: Math.round(performance.now() - started),
        count: data ? 1 : 0,
        sample: data ?? null,
        error: error?.message,
        notes: `Local deterministic featuredGenusName() = ${localGenus}`,
      });
    } catch (err) {
      setSnapshot({
        key: 'snapshot',
        label: 'Supabase daily_genus_snapshot row',
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        notes: `Local deterministic featuredGenusName() = ${localGenus}`,
      });
    }

    const planned: Array<[string, string, string, string?]> = [
      [
        'ocDaily',
        'OC backend /api/genus/daily',
        `${OC_BACKEND_BASE}/api/genus/daily`,
        'This should agree with the homepage genus, or it must only be treated as supplemental.',
      ],
      [
        'deadBackendProbe',
        'backendConfig BACKEND_BASE_URL species search probe',
        `${BACKEND_BASE_URL}/api/search?q=${encoded}&limit=10`,
        'If this fails while OC backend works, old code is still pointing to the dead host.',
      ],
      [
        'speciesSearch',
        'OC species search',
        `${OC_BACKEND_BASE}/api/search?q=${encoded}&limit=10`,
        'SpeciesInFocus depends on this returning binomial species names.',
      ],
      [
        'speciesSearchAlt',
        'OC /api/species/search genus query',
        `${OC_BACKEND_BASE}/api/species/search?genus=${encoded}&limit=10`,
        'DailyGenusFeature validated-species backbone depends on this shape.',
      ],
      [
        'genusImages',
        'Harvester genus images',
        `${IMAGES_BACKEND_BASE_URL}/images/genus/${encoded}?limit=20`,
        'DailyGenusFeature image grid depends on this returning images with genus+species or scientific_name.',
      ],
      [
        'atlasHarvester',
        'Harvester atlas occurrences for genus',
        `${ATLAS_OCCURRENCES_URL}?genus=${encoded}&limit=25`,
        'Knowledge wheel geography node and atlas data path should be able to consume this.',
      ],
      [
        'knowledgeFungi',
        'Knowledge wheel fungi endpoint',
        `${OC_BACKEND_BASE}/api/species/mycorrhizal?genus=${encoded}`,
      ],
      [
        'knowledgePollinators',
        'Knowledge wheel pollinator endpoint',
        `${OC_BACKEND_BASE}/api/species/pollinators?genus=${encoded}`,
      ],
      [
        'knowledgeClimate',
        'Knowledge wheel climate endpoint',
        `${OC_BACKEND_BASE}/api/species/climate?genus=${encoded}`,
      ],
      [
        'knowledgeConservation',
        'Knowledge wheel conservation endpoint',
        `${OC_BACKEND_BASE}/api/species/conservation?genus=${encoded}`,
      ],
      [
        'knowledgeCultivation',
        'Knowledge wheel cultivation endpoint',
        `${OC_BACKEND_BASE}/api/species/cultivation?genus=${encoded}`,
      ],
      [
        'knowledgeLiterature',
        'Knowledge wheel literature endpoint',
        `${OC_BACKEND_BASE}/api/species/literature?genus=${encoded}`,
      ],
    ];

    const results: DiagnosticCheck[] = [];
    for (const [key, label, url, notes] of planned) {
      const result = await fetchCheck(key, label, url, notes);
      results.push(result);
      setChecks([...results]);
    }
    setRunning(false);
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allChecks = snapshot ? [snapshot, ...checks] : checks;

  return (
    <main className="min-h-screen bg-[#060914] text-[#f7f2e8] px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#c9a24a]">
              Orchid Continuum diagnostics
            </p>
            <h1 className="mt-2 text-3xl md:text-5xl font-serif">Daily Genus Pipeline</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#d7cfbf]/75">
              Hidden diagnostic page. It checks the snapshot, taxonomy backend, image harvester,
              atlas harvester, and knowledge-wheel endpoints for the same genus.
            </p>
          </div>
          <Link to="/" className="rounded-full border border-[#c9a24a]/40 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-[#c9a24a]">
            Home
          </Link>
        </div>

        <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <label className="block font-mono text-[10px] uppercase tracking-[0.22em] text-[#c9a24a]">
            Genus under test
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              value={genusInput}
              onChange={(e) => setGenusInput(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-lg text-white outline-none focus:border-[#c9a24a]/60"
              placeholder="Oncidium"
            />
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="rounded-xl bg-[#c9a24a] px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#102015] disabled:opacity-60"
            >
              {running ? 'Running…' : 'Run checks'}
            </button>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-[#d7cfbf]/75 md:grid-cols-2">
            <div>Current test genus: <span className="text-white">{genus}</span></div>
            <div>Deterministic featuredGenusName(): <span className="text-white">{featuredGenusName()}</span></div>
            <div>OC backend: <span className="text-white">{OC_BACKEND_BASE}</span></div>
            <div>Image backend: <span className="text-white">{IMAGES_BACKEND_BASE_URL}</span></div>
          </div>
        </section>

        <section className="grid gap-4">
          {allChecks.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-[#d7cfbf]/70">
              No checks have run yet.
            </div>
          )}
          {allChecks.map((check) => (
            <article key={check.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{check.label}</h2>
                  {check.url && (
                    <p className="mt-1 break-all font-mono text-[11px] text-[#c9a24a]/80">{check.url}</p>
                  )}
                  {check.notes && <p className="mt-2 text-xs text-[#d7cfbf]/65">{check.notes}</p>}
                </div>
                <div className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${statusClass(check.status)}`}>
                  {check.status}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 font-mono text-[11px] text-[#d7cfbf]/75">
                {check.httpStatus != null && <span>HTTP {check.httpStatus}</span>}
                {check.count != null && <span>count {check.count}</span>}
                {check.elapsedMs != null && <span>{check.elapsedMs} ms</span>}
                {check.error && <span className="text-red-200">{check.error}</span>}
              </div>
              <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-black/45 p-3 text-[11px] leading-5 text-[#d7cfbf]">
                {JSON.stringify(check.sample ?? null, null, 2)}
              </pre>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
};

export default DailyGenusDiagnostics;
