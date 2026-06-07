/**
 * /pollinators/[taxa] — pollinator relationship page.
 */

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bug, Loader2, ImageOff, Network } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import AtlasMiniMap from '@/components/orchid/AtlasMiniMap';
import { Awaiting, SourceCitation } from '@/components/orchid/SourceBadges';
import {
  fetchAtlasOccurrencePoints,
  fetchPollinator,
  fetchPollinatorAggregates,
  type AtlasOccurrencePoint,
  type PollinatorAggregate,
} from '@/lib/orchidContinuum';

const PollinatorProfile: React.FC = () => {
  const { taxa } = useParams();
  const [loading, setLoading] = useState(true);
  const [pollinator, setPollinator] = useState<PollinatorAggregate | null>(null);
  const [all, setAll] = useState<PollinatorAggregate[]>([]);
  const [points, setPoints] = useState<AtlasOccurrencePoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (taxa) {
        const [p, list, allPoints] = await Promise.all([
          fetchPollinator(taxa),
          fetchPollinatorAggregates(),
          fetchAtlasOccurrencePoints(),
        ]);
        if (cancelled) return;
        setPollinator(p);
        setAll(list);
        if (p) {
          const sciSet = new Set(p.species.map((s) => s.scientificName));
          setPoints(allPoints.filter((pt) => sciSet.has(pt.canonicalName)));
        }
      } else {
        const list = await fetchPollinatorAggregates();
        if (cancelled) return;
        setAll(list);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [taxa]);

  return (
    <div className="min-h-screen bg-[#04050d] text-[#f5f0e8]" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <style>{`
        .font-display { font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      `}</style>
      <Navbar />

      <main className="pt-20">
        {loading && (
          <div className="min-h-[50vh] flex items-center justify-center">
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/70 inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading pollinator data…
            </div>
          </div>
        )}

        {!loading && !taxa && (
          <PollinatorIndex all={all} />
        )}

        {!loading && taxa && pollinator && (
          <PollinatorView pollinator={pollinator} points={points} />
        )}

        {!loading && taxa && !pollinator && (
          <div className="max-w-3xl mx-auto px-6 py-20 text-center">
            <Bug className="h-9 w-9 text-[#c9a24a]/50 mx-auto mb-4" strokeWidth={1.2} />
            <div className="font-display text-2xl text-[#faf7f2] mb-3">Pollinator relationship not yet linked</div>
            <Awaiting what="Pollinator linkage" />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

const PollinatorIndex: React.FC<{ all: PollinatorAggregate[] }> = ({ all }) => (
  <section className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12">
    <Link to="/atlas" className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] mb-6">
      <ArrowLeft className="h-3.5 w-3.5" /> Atlas
    </Link>
    <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85 mb-3">
      Pollinator intelligence
    </div>
    <h1 className="font-display leading-[1] tracking-[-0.012em] mb-8" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
      Known orchid <span className="italic text-[#c9a24a]">pollinators</span>
    </h1>

    {all.length === 0 ? (
      <Awaiting what="Pollinator data" />
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {all.map((p) => (
          <Link
            key={p.slug}
            to={`/pollinators/${encodeURIComponent(p.slug)}`}
            className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-5 hover:border-[#c9a24a]/50 transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <Bug className="h-4 w-4 text-[#c9a24a]" />
              <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-[#7a7466]">
                {p.speciesCount} species
              </span>
            </div>
            <div className="font-display text-[18px] text-[#faf7f2] group-hover:text-[#c9a24a] transition-colors">
              {p.taxon}
            </div>
            {p.mechanism && (
              <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#cfc8b8]/65 mt-1">
                {p.mechanism}
              </div>
            )}
          </Link>
        ))}
      </div>
    )}
  </section>
);

const PollinatorView: React.FC<{ pollinator: PollinatorAggregate; points: AtlasOccurrencePoint[] }> = ({ pollinator, points }) => (
  <>
    <section className="border-b border-white/[0.05]">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12">
        <Link to="/pollinators" className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] mb-5">
          <ArrowLeft className="h-3.5 w-3.5" /> All pollinators
        </Link>
        <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85 mb-3">
          Pollinator profile
        </div>
        <h1 className="font-display italic" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.4rem)' }}>
          {pollinator.taxon}
        </h1>
        {pollinator.mechanism && (
          <div className="mt-3 max-w-2xl text-[14px] text-[#cfc8b8]/80 leading-relaxed">
            {pollinator.mechanism}
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-3 font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/70">
          <span className="px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.02]">
            {pollinator.speciesCount} orchid species
          </span>
          <span className="px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.02]">
            {pollinator.occurrenceCount.toLocaleString()} occurrences
          </span>
        </div>
      </div>
    </section>

    <section className="max-w-[1400px] mx-auto px-6 lg:px-10 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-7">
        <AtlasMiniMap
          points={points}
          pointColor="#86efac"
          title="Pollinator overlap"
          atlasHref={`/atlas?pollinatorTaxa=${encodeURIComponent(pollinator.taxon)}`}
        />
      </div>
      <div className="lg:col-span-5">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Network className="h-3.5 w-3.5 text-[#c9a24a]" />
            <div className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a]">
              Linked orchid species
            </div>
          </div>
          <ul className="divide-y divide-white/[0.06]">
            {pollinator.species.map((s) => (
              <li key={s.id}>
                <Link to={`/species/${encodeURIComponent(s.slug)}`} className="flex items-center gap-3 py-3 hover:bg-white/[0.03] -mx-2 px-2 rounded-lg">
                  <div className="w-10 h-10 rounded bg-[#06091a] border border-[#c9a24a]/20 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {s.imageUrl ? <img src={s.imageUrl} alt="" className="w-full h-full object-cover" /> : <ImageOff className="h-3.5 w-3.5 text-[#c9a24a]/40" />}
                  </div>
                  <div className="font-display italic text-[14px] text-[#faf7f2] truncate">{s.scientificName}</div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4">
          <SourceCitation dataset="Orchid Continuum" sourceRecordId={pollinator.slug} />
        </div>
      </div>
    </section>
  </>
);

export default PollinatorProfile;
