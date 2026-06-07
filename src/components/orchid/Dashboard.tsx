import React, { useEffect, useState } from 'react';
import { Activity, Camera, Globe, Microscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { speciesApi, type ApiMetrics } from '@/lib/api';

const ATLAS_BG = 'https://d64gsuwffb70l.cloudfront.net/69fa6c8ae577acf1894f7208_1778020003351_77af073b.png';
const MICRO = 'https://d64gsuwffb70l.cloudfront.net/69fa6c8ae577acf1894f7208_1778019955000_5dc07fdb.jpg';

// Visual trend (illustrative until /api/atlas/temporal is online)
const trend = [12, 18, 22, 28, 26, 34, 41, 47, 52, 58, 63, 69, 78, 84, 91, 96];

const Dashboard: React.FC = () => {
  const max = Math.max(...trend);
  const points = trend
    .map((v, i) => `${(i / (trend.length - 1)) * 100},${100 - (v / max) * 90}`)
    .join(' ');

  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [metricsLive, setMetricsLive] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    speciesApi.metrics(controller.signal).then(r => {
      if (controller.signal.aborted) return;
      if (r.data) {
        setMetrics(r.data);
        setMetricsLive(true);
      }
    });
    return () => controller.abort();
  }, []);

  const fmt = (n?: number) => (n == null ? '—' : n.toLocaleString());

  return (
    <section id="atlas" className="relative py-28 bg-[#0d1f17] text-white border-t border-white/5">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
          <div>
            <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-4 flex items-center gap-3">
              <span>Living Atlas</span>
              <span
                className={
                  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] ' +
                  (metricsLive
                    ? 'border-emerald-300/40 text-emerald-200 bg-emerald-300/10'
                    : 'border-white/20 text-white/55')
                }
              >
                <span
                  className={
                    'w-1.5 h-1.5 rounded-full ' +
                    (metricsLive ? 'bg-emerald-300 animate-pulse' : 'bg-white/40')
                  }
                />
                {metricsLive ? 'Live' : 'Refreshing'}
              </span>
            </div>
            <h2 className="font-serif text-4xl md:text-5xl leading-tight max-w-2xl">
              A living portrait of<br />
              <span className="italic text-emerald-200/90">orchid life across continents.</span>
            </h2>
            <Link
              to="/atlas"
              className="inline-flex items-center gap-2 mt-5 text-sm text-emerald-300 hover:text-emerald-200"
            >
              Open the Atlas workspace →
            </Link>
          </div>
          <p className="max-w-md text-white/60 leading-relaxed">
            A continuous signal woven from herbarium specimens, field
            observers, satellite climate data, and AI-assisted image
            analysis — unified into one cohesive view of the orchid world.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* Map panel */}
          <div className="lg:col-span-7 rounded-2xl overflow-hidden border border-white/10 bg-[#142a1f] relative min-h-[360px]">
            <img src={ATLAS_BG} alt="Global biodiversity hotspots" className="absolute inset-0 w-full h-full object-cover opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d1f17] via-[#0d1f17]/40 to-transparent" />
            <div className="relative z-10 p-6 h-full flex flex-col">
              <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-emerald-300/80">
                <Globe className="h-3.5 w-3.5" />
                Mapping Layers
              </div>

              {/* Pulsing pins */}
              <div className="relative flex-1 mt-4">
                {[
                  { x: '22%', y: '55%', label: 'Andes' },
                  { x: '48%', y: '40%', label: 'Cameroon' },
                  { x: '72%', y: '52%', label: 'Borneo' },
                  { x: '85%', y: '70%', label: 'New Guinea' },
                  { x: '30%', y: '28%', label: 'Appalachia' },
                  { x: '60%', y: '34%', label: 'Himalaya' },
                ].map(p => (
                  <div key={p.label} className="absolute" style={{ left: p.x, top: p.y }}>
                    <div className="relative">
                      <div className="absolute -inset-3 rounded-full bg-emerald-300/30 animate-ping" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-300 ring-2 ring-emerald-300/40" />
                    </div>
                    <div className="absolute left-4 top-0 text-[10px] tracking-[0.2em] uppercase text-white/80 whitespace-nowrap">
                      {p.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-px mt-4 bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                {[
                  { l: 'Hotspots', v: '36' },
                  { l: 'Endemic Spp.', v: '4,217' },
                  { l: 'Layers', v: '18' },
                ].map(s => (
                  <div key={s.l} className="bg-[#0d1f17]/80 px-4 py-3">
                    <div className="font-serif text-lg text-emerald-100">{s.v}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/55 mt-0.5">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Trend chart */}
          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#142a1f] p-6 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-emerald-300/80">
                <Activity className="h-3.5 w-3.5" />
                Documented Sightings
              </div>
              <div className="text-[10px] text-white/40 tracking-widest uppercase">Last 16 yrs</div>
            </div>
            <div className="mt-6 flex-1 min-h-[180px]">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#86efac" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#86efac" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline points={`0,100 ${points} 100,100`} fill="url(#g1)" />
                <polyline points={points} fill="none" stroke="#86efac" strokeWidth="0.6" />
                {trend.map((v, i) => (
                  <circle
                    key={i}
                    cx={(i / (trend.length - 1)) * 100}
                    cy={100 - (v / max) * 90}
                    r="0.7"
                    fill="#d1fae5"
                  />
                ))}
              </svg>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              <div>
                <div className="font-serif text-2xl text-emerald-100 tabular-nums">
                  {metricsLive ? fmt(metrics?.occurrence_count) : '—'}
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/55">
                  Total sightings
                </div>
              </div>
              <div>
                <div className="font-serif text-2xl text-emerald-100 tabular-nums">
                  {metricsLive ? fmt(metrics?.species_count) : '—'}
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/55">
                  Recognized species
                </div>
              </div>
            </div>
          </div>

          {/* Photo & image archive */}
          <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#142a1f] p-6">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-emerald-300/80">
              <Camera className="h-3.5 w-3.5" />
              Photo &amp; Image Archive
            </div>
            <div className="mt-6 space-y-4">
              {[
                { l: 'Specimen photographs', v: 78, c: '482k' },
                { l: 'Habitat imagery', v: 64, c: '212k' },
                { l: 'Microscopy slides', v: 38, c: '47k' },
                { l: 'Pollinator moments', v: 22, c: '18k' },
              ].map(b => (
                <div key={b.l}>
                  <div className="flex justify-between text-xs text-white/65 mb-1.5">
                    <span>{b.l}</span>
                    <span className="text-white/40">{b.c}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-200"
                      style={{ width: `${b.v}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Genus breadth */}
          <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#142a1f] p-6">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-emerald-300/80">
              <Microscope className="h-3.5 w-3.5" />
              Taxonomic Breadth
            </div>
            <div className="mt-6 space-y-3">
              {[
                { g: 'Bulbophyllum', n: 2034 },
                { g: 'Pleurothallis', n: 1240 },
                { g: 'Dendrobium', n: 1820 },
                { g: 'Epidendrum', n: 1500 },
                { g: 'Habenaria', n: 880 },
              ].map(g => (
                <div key={g.g} className="flex items-center justify-between text-sm">
                  <span className="italic text-white/80">{g.g}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-300/80" style={{ width: `${(g.n / 2034) * 100}%` }} />
                    </div>
                    <span className="text-white/50 text-xs tabular-nums">{g.n.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Microscopy */}
          <div className="lg:col-span-4 rounded-2xl border border-white/10 overflow-hidden relative min-h-[240px]">
            <img src={MICRO} alt="Mycorrhizal microscopy" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d1f17] via-[#0d1f17]/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/90 mb-2">
                AI-assisted analysis
              </div>
              <h3 className="font-serif text-xl">Velamen &amp; Mycorrhizal Imaging</h3>
              <p className="text-xs text-white/60 mt-2 leading-relaxed">
                Automated tissue segmentation across 47k microscopy slides.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Dashboard;
