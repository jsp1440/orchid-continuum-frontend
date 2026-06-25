import React, { useEffect, useState } from 'react';
import {
  fetchReleaseHomepageData,
  type ReleaseHomepageData,
} from '@/lib/releaseApi';

/**
 * Live stats row — release-facing operational readout.
 *
 * FRONTEND-R1 rule: prefer live backend values, but label fallback values
 * transparently so the v0.1 preview does not imply data is more complete than it
 * really is.
 */
const LivePlatformMetrics: React.FC = () => {
  const [data, setData] = useState<ReleaseHomepageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetchReleaseHomepageData(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setData(next);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const fmt = (n?: number | null, fallback = '—') =>
    n == null ? fallback : n.toLocaleString();

  const atlas = data?.atlasStats;
  const literature = data?.literatureStats;
  const dailyGenus = data?.dailyGenus;

  const stats = [
    {
      value: fmt(
        atlas?.species_count,
        dailyGenus?.species_count ? fmt(dailyGenus.species_count) : '30,500+',
      ),
      label: atlas?.species_count ? 'Species Cataloged' : 'Species Signal',
      hint: atlas?.species_count
        ? 'Live Atlas taxonomy summary'
        : dailyGenus?.genus
          ? `Live daily genus: ${dailyGenus.genus}`
          : 'Fallback until Atlas stats respond',
      live: Boolean(atlas?.species_count || dailyGenus?.genus),
    },
    {
      value: fmt(atlas?.occurrence_count ?? atlas?.occurrences_count, '1.2M+'),
      label: 'Occurrence Records',
      hint: atlas?.occurrence_count || atlas?.occurrences_count
        ? 'Live Atlas occurrence summary'
        : 'Fallback until occurrence stats respond',
      live: Boolean(atlas?.occurrence_count || atlas?.occurrences_count),
    },
    {
      value: fmt(
        literature?.literature_count ??
          literature?.article_count ??
          literature?.reference_count,
        '500+',
      ),
      label: 'Research Records',
      hint: literature
        ? 'Live literature summary'
        : 'Fallback until literature stats endpoint is confirmed',
      live: Boolean(literature),
    },
    {
      value: fmt(data?.mycorrhizalAssociations, '462'),
      label: 'Mycorrhizal Links',
      hint: data?.mycorrhizalAssociations
        ? 'Live or backend-confirmed association count'
        : 'Fallback from current Continuum profile',
      live: Boolean(data?.mycorrhizalAssociations),
    },
  ];

  return (
    <section className="relative bg-cream border-y border-quiet">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 lg:py-20">
        <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-forest/70">
              Orchid Continuum Preview Release v0.1
            </p>
            <h2 className="mt-2 font-display text-3xl text-forest">
              Live platform signals
            </h2>
          </div>
          <p className="max-w-2xl font-body text-sm text-charcoal/70">
            {loading
              ? 'Checking live Continuum services…'
              : failed
                ? 'Some services are unavailable; release-safe fallbacks are shown.'
                : 'Live values are used where available; fallback values are labelled transparently.'}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-12 gap-x-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center lg:text-left">
              <div
                className="font-display text-5xl sm:text-6xl text-gold tabular-nums leading-none"
                style={{ fontWeight: 500 }}
              >
                {loading ? '…' : s.value}
              </div>
              <div className="mt-4 font-mono text-[10px] tracking-[0.22em] uppercase text-forest">
                {s.label}
              </div>
              <div className="mt-2 font-body text-sm text-charcoal/70 max-w-[22ch] mx-auto lg:mx-0">
                {loading ? 'Loading live value' : s.hint}
              </div>
              {!loading && (
                <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-charcoal/50">
                  {s.live ? 'Live / verified' : 'Fallback'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LivePlatformMetrics;
