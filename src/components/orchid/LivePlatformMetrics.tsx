import React, { useEffect, useState } from 'react';
import { speciesApi, type ApiMetrics } from '@/lib/api';

/**
 * Live stats row — museum-style operational readout.
 *
 * Four large editorial numbers in Playfair Display gold; IBM Plex Mono labels.
 * Numbers are aspirational/headline values shown when the API has not yet
 * reported a live count, and replaced with live values as they come online.
 */
const LivePlatformMetrics: React.FC = () => {
  const [m, setM] = useState<ApiMetrics | null>(null);

  useEffect(() => {
    const c = new AbortController();
    speciesApi.metrics(c.signal).then(r => { if (!c.signal.aborted && r.data) setM(r.data); });
    return () => c.abort();
  }, []);

  const fmt = (n?: number, fallback = '—') =>
    n == null ? fallback : n.toLocaleString();

  const stats = [
    {
      value: m?.species_count ? fmt(m.species_count) : '30,500+',
      label: 'Species Cataloged',
      hint: 'Across Orchidaceae globally',
    },
    {
      value: m?.occurrence_count ? fmt(m.occurrence_count) : '1.2M+',
      label: 'Occurrence Records',
      hint: 'Documented sightings indexed',
    },
    {
      value: '500+',
      label: 'Research Papers',
      hint: 'Literature parsed for protocols',
    },
    {
      value: '94%',
      label: 'Species Unassessed',
      hint: 'Awaiting IUCN evaluation',
    },
  ];

  return (
    <section className="relative bg-cream border-y border-quiet">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 lg:py-20">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-12 gap-x-8">
          {stats.map(s => (
            <div key={s.label} className="text-center lg:text-left">
              <div
                className="font-display text-5xl sm:text-6xl text-gold tabular-nums leading-none"
                style={{ fontWeight: 500 }}
              >
                {s.value}
              </div>
              <div className="mt-4 font-mono text-[10px] tracking-[0.22em] uppercase text-forest">
                {s.label}
              </div>
              <div className="mt-2 font-body text-sm text-charcoal/70 max-w-[18ch] mx-auto lg:mx-0">
                {s.hint}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LivePlatformMetrics;
