/**
 * /climate — climate / elevation overlay landing page.
 * Shows elevation distribution histogram from real occurrence records.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mountain, Loader2 } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import AtlasMiniMap from '@/components/orchid/AtlasMiniMap';
import { Awaiting } from '@/components/orchid/SourceBadges';
import {
  fetchAtlasOccurrencePoints,
  type AtlasOccurrencePoint,
} from '@/lib/orchidContinuum';

const BANDS: { label: string; min: number; max: number; color: string }[] = [
  { label: 'Lowland (0–500 m)', min: 0, max: 500, color: '#86efac' },
  { label: 'Montane (500–1500 m)', min: 500, max: 1500, color: '#c9a24a' },
  { label: 'Upper montane (1500–2500 m)', min: 1500, max: 2500, color: '#ff9b6a' },
  { label: 'Cloud forest (2500–3500 m)', min: 2500, max: 3500, color: '#c084fc' },
  { label: 'Paramo / alpine (>3500 m)', min: 3500, max: 9999, color: '#9ad6ff' },
];

const Climate: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<AtlasOccurrencePoint[]>([]);
  const [activeBand, setActiveBand] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAtlasOccurrencePoints().then((p) => { if (!cancelled) { setPoints(p); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const bandCounts = useMemo(() => BANDS.map((b) => points.filter((p) => typeof p.elevation_m === 'number' && p.elevation_m >= b.min && p.elevation_m < b.max).length), [points]);
  const filteredPoints = useMemo(() => {
    if (activeBand == null) return points.filter((p) => typeof p.elevation_m === 'number');
    const b = BANDS[activeBand];
    return points.filter((p) => typeof p.elevation_m === 'number' && p.elevation_m >= b.min && p.elevation_m < b.max);
  }, [points, activeBand]);

  const withElevation = points.filter((p) => typeof p.elevation_m === 'number').length;

  return (
    <div className="min-h-screen bg-[#04050d] text-[#f5f0e8]" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <style>{`
        .font-display { font-family: 'Playfair Display', Georgia, serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>
      <Navbar />
      <main className="pt-20">
        <section className="border-b border-white/[0.05]">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12">
            <Link to="/atlas" className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] mb-5">
              <ArrowLeft className="h-3.5 w-3.5" /> Atlas
            </Link>
            <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85 mb-3">
              Climate & elevation
            </div>
            <h1 className="font-display leading-[0.95]" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.4rem)' }}>
              The vertical <span className="italic text-[#c9a24a]">orchid world</span>
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] text-[#cfc8b8]/80 leading-relaxed">
              Real elevation profile across the Continuum's georeferenced records.{' '}
              <span className="text-[#c9a24a]">{withElevation.toLocaleString()}</span> of{' '}
              {points.length.toLocaleString()} records carry steward-validated elevation. The rest are
              shown explicitly as awaiting elevation data.
            </p>
          </div>
        </section>

        <section className="max-w-[1400px] mx-auto px-6 lg:px-10 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-3">
            <div className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a] mb-2">
              Elevation bands
            </div>
            {BANDS.map((b, i) => {
              const count = bandCounts[i];
              const max = Math.max(...bandCounts, 1);
              return (
                <button
                  key={b.label}
                  onClick={() => setActiveBand(activeBand === i ? null : i)}
                  className={[
                    'w-full text-left rounded-xl border p-3 transition-colors',
                    activeBand === i ? 'border-[#c9a24a]/60 bg-[#c9a24a]/[0.06]' : 'border-white/[0.08] bg-[#0a0d1c]/70 hover:border-[#c9a24a]/40',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: b.color }} />
                      <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#cfc8b8]/85">{b.label}</span>
                    </div>
                    <span className="font-mono text-[10px] text-[#c9a24a]">{count}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full" style={{ width: `${(count / max) * 100}%`, background: b.color, opacity: 0.7 }} />
                  </div>
                </button>
              );
            })}
            {withElevation === 0 && (
              <div className="pt-2">
                <Awaiting what="Elevation records" />
              </div>
            )}
          </div>

          <div className="lg:col-span-8">
            {loading ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#06091a] p-12 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#c9a24a]/70 mx-auto" />
              </div>
            ) : (
              <AtlasMiniMap
                points={filteredPoints}
                pointColor={activeBand != null ? BANDS[activeBand].color : '#9ad6ff'}
                title={activeBand != null ? BANDS[activeBand].label : 'All records with elevation'}
                atlasHref="/atlas?occurrence="
              />
            )}

            <div className="mt-4 flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase text-[#7a7466]">
              <Mountain className="h-3 w-3 text-[#c9a24a]" />
              Live elevation pulled from GBIF · steward verification ongoing
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Climate;
