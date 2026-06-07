/**
 * OACS — Greenhouse environmental monitoring concept page.
 * --------------------------------------------------------
 * Demonstrates how the public site will surface curated greenhouse
 * sensor data (SensorPush, Govee, custom PAR meters, etc.) once the
 * /api/oacs/* endpoints are implemented.
 *
 * Until then, this page renders clearly-labeled DEMO snapshots and a
 * habitat-vs-greenhouse comparison so growers and curators can see
 * how the module will feel.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Thermometer,
  Droplets,
  Sun,
  Wind,
  Cpu,
  Loader2,
  CircleDashed,
  Sparkles,
} from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import {
  oacsApi,
  OACS_DEMO_SITES,
  OACS_DEMO_SNAPSHOTS,
  OACS_PLACEHOLDER_MESSAGE,
  METRIC_META,
  type SiteSummary,
  type SnapshotReading,
} from '@/lib/oacs';

const OACS: React.FC = () => {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSiteId, setActiveSiteId] = useState<string>(
    OACS_DEMO_SITES[0].site_id,
  );
  const [snapshot, setSnapshot] = useState<SnapshotReading | null>(null);
  const [snapshotLive, setSnapshotLive] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    oacsApi.sites(c.signal).then(r => {
      if (c.signal.aborted) return;
      if (r.data && r.data.length > 0) {
        setSites(r.data);
        setLive(true);
        setActiveSiteId(r.data[0].site_id);
      } else {
        setSites(OACS_DEMO_SITES);
        setLive(false);
      }
      setLoading(false);
    });
    return () => c.abort();
  }, []);

  useEffect(() => {
    if (!activeSiteId) return;
    const c = new AbortController();
    oacsApi.snapshot(activeSiteId, c.signal).then(r => {
      if (c.signal.aborted) return;
      if (r.data) {
        setSnapshot(r.data);
        setSnapshotLive(true);
      } else {
        setSnapshot(OACS_DEMO_SNAPSHOTS[activeSiteId] || null);
        setSnapshotLive(false);
      }
    });
    return () => c.abort();
  }, [activeSiteId]);

  const activeSite = sites.find(s => s.site_id === activeSiteId);

  return (
    <div
      className="min-h-screen bg-[#0d1f17] text-white antialiased"
      style={{ fontFamily: '"Inter", system-ui, -apple-system, sans-serif' }}
    >
      <style>{`
        .font-serif { font-family: 'Cormorant Garamond', 'Playfair Display', Georgia, serif; font-weight: 500; letter-spacing: -0.01em; }
      `}</style>
      <Navbar />

      <main className="pt-24">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/5">
          <div className="absolute inset-0 opacity-30 pointer-events-none">
            <div className="absolute top-1/3 left-10 w-96 h-96 rounded-full bg-emerald-400/15 blur-3xl" />
            <div className="absolute bottom-1/4 right-10 w-96 h-96 rounded-full bg-sky-300/10 blur-3xl" />
          </div>
          <div className="relative max-w-7xl mx-auto px-6 lg:px-10 py-20">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-emerald-200 transition-colors mb-10"
            >
              <ArrowLeft className="h-4 w-4" /> Return to Continuum
            </Link>

            <div className="text-xs tracking-[0.3em] uppercase text-emerald-200/80 mb-5">
              OACS · Orchid Adaptive Cultivation Sensors
            </div>
            <h1 className="font-serif text-5xl md:text-7xl leading-[1.05] max-w-4xl">
              Greenhouse intelligence,<br />
              <span className="italic text-emerald-200/95">
                grounded in habitat envelopes.
              </span>
            </h1>
            <p className="text-lg text-white/70 mt-8 max-w-2xl leading-relaxed font-light">
              OACS connects greenhouse environmental sensors — temperature,
              humidity, PAR, and VPD — with each species' ecological
              envelope, so growers and curators can see how closely a
              cultivated environment matches a taxon's natural range.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full border border-white/15 text-white/55">
              <CircleDashed className="h-3 w-3" />
              {OACS_PLACEHOLDER_MESSAGE}
            </div>
          </div>
        </section>

        {/* Site picker + snapshot */}
        <section className="py-16 border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Site list */}
            <div className="lg:col-span-4 space-y-3">
              <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-2">
                Greenhouse sites
              </div>
              {loading && (
                <div className="rounded-xl border border-white/10 bg-[#142a1f] p-5 flex items-center gap-3 text-white/55 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading sites…
                </div>
              )}
              {!loading &&
                sites.map(s => (
                  <button
                    key={s.site_id}
                    onClick={() => setActiveSiteId(s.site_id)}
                    className={
                      'w-full text-left rounded-xl border p-4 transition-colors ' +
                      (activeSiteId === s.site_id
                        ? 'border-emerald-300/50 bg-emerald-300/10'
                        : 'border-white/10 bg-[#142a1f] hover:border-emerald-300/30')
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-serif text-lg">{s.name}</div>
                      <span
                        className={
                          'text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full ' +
                          (s.status === 'online'
                            ? 'bg-emerald-300/15 border border-emerald-300/40 text-emerald-100'
                            : s.status === 'stale'
                            ? 'bg-amber-300/10 border border-amber-300/40 text-amber-100'
                            : 'bg-white/5 border border-white/15 text-white/55')
                        }
                      >
                        {s.status || 'unknown'}
                      </span>
                    </div>
                    <div className="text-xs text-white/55 mt-1">
                      {s.location}
                    </div>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-white/40 mt-2">
                      {s.greenhouse_type || '—'} · {s.sensors ?? '—'} sensors
                    </div>
                  </button>
                ))}
              <div className="text-[10px] tracking-[0.2em] uppercase text-white/40 pt-2">
                {live ? 'Live · /api/oacs/sites' : 'Demo · awaiting /api/oacs/sites'}
              </div>
            </div>

            {/* Snapshot */}
            <div className="lg:col-span-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80">
                    Latest snapshot
                  </div>
                  <div className="font-serif text-2xl mt-1">
                    {activeSite?.name || '—'}
                  </div>
                </div>
                <span
                  className={
                    'text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border ' +
                    (snapshotLive
                      ? 'border-emerald-300/40 text-emerald-200 bg-emerald-300/10'
                      : 'border-white/15 text-white/55 bg-white/5')
                  }
                >
                  {snapshotLive ? 'Live' : 'Demo data'}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Metric
                  icon={<Thermometer className="h-4 w-4" />}
                  meta={METRIC_META.temp_c}
                  value={snapshot?.temp_c}
                />
                <Metric
                  icon={<Droplets className="h-4 w-4" />}
                  meta={METRIC_META.rh_pct}
                  value={snapshot?.rh_pct}
                />
                <Metric
                  icon={<Sun className="h-4 w-4" />}
                  meta={METRIC_META.par_umol}
                  value={snapshot?.par_umol}
                />
                <Metric
                  icon={<Wind className="h-4 w-4" />}
                  meta={METRIC_META.vpd_kpa}
                  value={snapshot?.vpd_kpa}
                />
                <Metric
                  icon={<Cpu className="h-4 w-4" />}
                  meta={METRIC_META.co2_ppm}
                  value={snapshot?.co2_ppm}
                />
                <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-xs text-white/55 leading-relaxed">
                  Series, alarms, and policy-envelope deviations will
                  populate once /api/oacs/sites/{'{id}'}/series is online.
                </div>
              </div>

              {snapshot?.observed_at && (
                <div className="mt-3 text-[10px] tracking-[0.2em] uppercase text-white/40">
                  Observed {new Date(snapshot.observed_at).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Habitat vs greenhouse comparison */}
        <section className="py-20 border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 lg:px-10">
            <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-3">
              Comparison concept
            </div>
            <h2 className="font-serif text-3xl md:text-4xl mb-8 max-w-3xl">
              Match cultivation to habitat — without guessing.
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CompareCard
                label="Habitat envelope"
                source="Derived from /api/species/{id}.environmental"
                rows={[
                  ['Temperature', '15 – 24 °C'],
                  ['Humidity', '78 – 92 %'],
                  ['PAR', '120 – 320 µmol·m⁻²·s⁻¹'],
                  ['VPD', '0.30 – 0.65 kPa'],
                ]}
              />
              <CompareCard
                label="Greenhouse current"
                source={
                  snapshotLive
                    ? '/api/oacs/sites/{id}/snapshot'
                    : 'Demo snapshot'
                }
                rows={[
                  ['Temperature', fmtVal(snapshot?.temp_c, '°C')],
                  ['Humidity', fmtVal(snapshot?.rh_pct, '%')],
                  ['PAR', fmtVal(snapshot?.par_umol, 'µmol')],
                  ['VPD', fmtVal(snapshot?.vpd_kpa, 'kPa')],
                ]}
              />
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-5">
                <div className="flex items-center gap-2 text-emerald-200 text-xs tracking-[0.2em] uppercase mb-2">
                  <Sparkles className="h-3.5 w-3.5" />
                  Fit score
                </div>
                <div className="font-serif text-5xl text-emerald-100">—</div>
                <p className="text-sm text-white/65 mt-2 leading-relaxed">
                  A 0–100 fit score will be returned by{' '}
                  <code className="text-emerald-200/85">/api/oacs/compare</code>{' '}
                  once habitat envelopes and live snapshots are joined
                  server-side. Recommendations (raise humidity, lower PAR,
                  etc.) will appear here.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Hardware bench */}
        <section className="py-20 bg-[#0a1812]">
          <div className="max-w-7xl mx-auto px-6 lg:px-10">
            <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-3">
              Hardware bench
            </div>
            <h2 className="font-serif text-3xl md:text-4xl mb-10">
              Sensors the OACS pipeline will ingest
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  title: 'SensorPush HT1 / HTP.xw',
                  desc: 'Temperature & humidity. Bluetooth gateway uploads to vendor cloud; Continuum ingests via webhook.',
                },
                {
                  title: 'Apogee MQ-500 PAR meter',
                  desc: 'Quantum sensor for PAR (400–700 nm). Logged at canopy height; integrated daily light integral computed server-side.',
                },
                {
                  title: 'Custom VPD model',
                  desc: 'VPD computed from temp + RH using Tetens equation; surfaced in /api/oacs snapshot payloads.',
                },
              ].map(b => (
                <div
                  key={b.title}
                  className="rounded-xl border border-white/10 bg-[#142a1f] p-5"
                >
                  <div className="font-serif text-lg">{b.title}</div>
                  <p className="text-sm text-white/60 mt-2 leading-relaxed">
                    {b.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

// ---------------------------------------------------------------------------

const Metric: React.FC<{
  icon: React.ReactNode;
  meta: { label: string; unit: string; help: string };
  value?: number;
}> = ({ icon, meta, value }) => (
  <div className="rounded-xl border border-white/10 bg-[#142a1f] p-4">
    <div className="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-emerald-300/80">
      {icon}
      {meta.label}
    </div>
    <div className="font-serif text-2xl text-emerald-100 mt-2 tabular-nums">
      {value == null ? '—' : value.toLocaleString()}
      <span className="text-xs text-white/55 ml-1">{meta.unit}</span>
    </div>
    <div className="text-[10px] text-white/45 mt-1 leading-relaxed">
      {meta.help}
    </div>
  </div>
);

const CompareCard: React.FC<{
  label: string;
  source: string;
  rows: [string, string][];
}> = ({ label, source, rows }) => (
  <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-5">
    <div className="text-xs tracking-[0.2em] uppercase text-emerald-300/80 mb-3">
      {label}
    </div>
    <dl className="divide-y divide-white/5">
      {rows.map(([k, v]) => (
        <div key={k} className="py-2 flex justify-between text-sm">
          <dt className="text-white/55">{k}</dt>
          <dd className="text-white/85 tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
    <div className="text-[10px] tracking-[0.2em] uppercase text-white/40 mt-3 break-words">
      {source}
    </div>
  </div>
);

function fmtVal(v: number | undefined, unit: string): string {
  return v == null ? '—' : `${v} ${unit}`;
}

export default OACS;
