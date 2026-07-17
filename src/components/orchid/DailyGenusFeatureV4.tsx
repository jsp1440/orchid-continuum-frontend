import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, Database, Leaf, ShieldCheck } from 'lucide-react';

import { useDailyGenus } from '@/lib/dailyGenusContext';
import { featuredGenusEntry } from '@/lib/featuredGenus';
import { lookupGenus } from '@/lib/genusData';
import { fetchCalyxGenusMedia, type GenusMediaResponse } from '@/lib/genusMediaResolver';

const EMPTY: GenusMediaResponse = {
  status: 'service_error',
  requested_genus: '',
  accepted_genus: null,
  generated_at: null,
  items: [],
  summary: { eligible_count: 0, returned_count: 0, exclusion_counts: {} },
};

const ScientificName: React.FC<{ name: string }> = ({ name }) => <span className="italic">{name}</span>;

const DailyGenusFeatureV4: React.FC = () => {
  // Use the context-driven genus so all homepage sections stay in sync,
  // including when the curator overrides via the daily_genus_snapshot table.
  const { genus: contextGenus } = useDailyGenus();
  const entry = useMemo(() => {
    const local = lookupGenus(contextGenus);
    return local ?? featuredGenusEntry();
  }, [contextGenus]);
  const [media, setMedia] = useState<GenusMediaResponse>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetchCalyxGenusMedia(entry.genus, controller.signal)
      .then(setMedia)
      .catch(() => setMedia({ ...EMPTY, requested_genus: entry.genus }))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [entry.genus]);

  const hero = media.items[0];
  const gallery = media.items.slice(1, 9);

  return (
    <section className="rounded-xl border border-[#d9caa8] bg-[#fffaf0]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Featured Genus</p>
          <h2 className="mt-1 font-serif text-4xl leading-tight text-[#24321f] italic">{entry.genus}</h2>
          <p className="mt-2 text-sm leading-6 text-[#5d684c]">{entry.description}</p>
        </div>
        <Link
          to={`/genus/${encodeURIComponent(entry.genus)}`}
          className="inline-flex items-center gap-2 rounded-lg border border-[#c7b27a] bg-[#f8ecc8] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5b4b21] hover:bg-[#efdca7]"
        >
          Open research profile <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading && (
        <div className="mt-5 flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-[#c7b27a] bg-[#f6f0df] text-center">
          <div><Camera className="mx-auto h-8 w-8 text-[#8a6f2d]" /><p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6b664f]">Loading verified Orchid Continuum media</p></div>
        </div>
      )}

      {!loading && media.status === 'ok' && hero && (
        <>
          <figure className="mt-5 overflow-hidden rounded-lg border border-[#d9caa8] bg-[#1a2e1a]">
            <img src={hero.image_url} alt={hero.scientific_name} className="h-[360px] w-full object-cover" loading="eager" />
            <figcaption className="bg-[#fffaf0] px-4 py-3 text-sm text-[#4c5841]">
              <p className="font-serif text-lg text-[#24321f]"><ScientificName name={hero.scientific_name} /></p>
              <p className="mt-1 text-xs">Source: {hero.source_name}{hero.attribution ? ` · ${hero.attribution}` : ''}{hero.license ? ` · ${hero.license}` : ''}</p>
            </figcaption>
          </figure>
          {gallery.length > 0 && <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {gallery.map((item) => (
              <figure key={item.media_id} className="overflow-hidden rounded-lg border border-[#d9caa8] bg-[#fffaf0]">
                <img src={item.thumbnail_url || item.image_url} alt={item.scientific_name} className="h-44 w-full object-cover" loading="lazy" />
                <figcaption className="p-3"><p className="font-serif text-base text-[#24321f]"><ScientificName name={item.scientific_name} /></p><p className="mt-1 text-[10px] text-[#6b664f]">{item.source_name}</p></figcaption>
              </figure>
            ))}
          </div>}
        </>
      )}

      {!loading && media.status === 'no_approved_media' && <div className="mt-5 flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-[#c7b27a] bg-[#f6f0df] p-6 text-center"><div className="max-w-md"><Leaf className="mx-auto h-9 w-9 text-[#8a6f2d]" /><p className="mt-3 font-serif text-xl text-[#24321f]">No verified Orchid Continuum photograph is available yet for {entry.genus}.</p><p className="mt-2 text-sm leading-6 text-[#5d684c]">The site will not substitute an unrelated orchid, herbarium sheet, or external fallback image.</p></div></div>}
      {!loading && media.status === 'invalid_genus' && <div className="mt-5 rounded-lg border border-[#d9caa8] bg-[#f6f0df] p-5 text-center text-sm text-[#5d684c]">The current Featured Genus could not be resolved by Calyx.</div>}
      {!loading && media.status === 'service_error' && <div className="mt-5 rounded-lg border border-[#d9caa8] bg-[#f6f0df] p-5 text-center"><Database className="mx-auto h-7 w-7 text-[#8a6f2d]" /><p className="mt-2 font-serif text-lg text-[#24321f]">Calyx media service is temporarily unavailable.</p><p className="mt-1 text-sm text-[#5d684c]">No external image fallback is used.</p></div>}

      <div className="mt-5 flex items-center gap-2 text-[10px] text-[#6b664f]"><ShieldCheck className="h-3.5 w-3.5 text-[#8a6f2d]" /><span>Featured Genus media is resolved by Calyx from Orchid Continuum-linked taxon records.</span></div>
    </section>
  );
};

export default DailyGenusFeatureV4;
