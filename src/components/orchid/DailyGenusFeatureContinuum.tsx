import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Database, ImageOff } from 'lucide-react';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import type { ContinuumDomainState } from '@/lib/featuredTaxonContinuum';

const DOMAIN_LABELS: Record<ContinuumDomainState['domain'], string> = {
  taxonomy: 'Taxonomy',
  media: 'Media',
  occurrences: 'Occurrences',
  traits: 'Traits',
  literature: 'Literature',
  pollinators: 'Pollinators',
  conservation: 'Conservation',
};

function EvidenceBadge({ item }: { item: ContinuumDomainState }) {
  const detail = item.nodes == null || item.edges == null
    ? 'Continuum unavailable'
    : item.state === 'known'
      ? `${item.nodes} nodes · ${item.edges} relationships`
      : 'No linked evidence in the current Continuum graph';

  return (
    <div className="rounded-lg border border-[#d9caa8] bg-[#fffaf0]/95 p-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a8062]">
        {DOMAIN_LABELS[item.domain]}
      </p>
      <p className="mt-1 text-sm font-medium text-[#24321f]">
        {item.state === 'known' ? 'Documented' : item.state === 'unknown' ? 'Not yet linked' : 'Unavailable'}
      </p>
      <p className="mt-1 text-xs leading-5 text-[#5d684c]">{detail}</p>
    </div>
  );
}

const DailyGenusFeatureContinuum: React.FC = () => {
  const { genus, continuum, continuumStatus } = useDailyGenus();
  const media = continuum?.media.items ?? [];
  const hero = media[0] ?? null;

  return (
    <section className="bg-[#f3ead4] px-4 py-10 sm:px-6 lg:px-8" aria-labelledby="featured-genus-title">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#806c39]">Genus of the Day · Continuum evidence</p>
            <h2 id="featured-genus-title" className="mt-2 font-serif text-4xl italic text-[#24321f] sm:text-5xl">
              {genus}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#526046]">
              This view is rendered from Orchid Continuum services. Missing relationships remain visible as knowledge gaps rather than being replaced with generic scientific claims.
            </p>
          </div>
          <Link
            to={`/genus/${encodeURIComponent(genus)}`}
            className="inline-flex items-center gap-2 self-start rounded-lg border border-[#b59a58] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#665321] hover:bg-[#fff7df] md:self-auto"
          >
            Research profile <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-xl border border-[#d1bd8e] bg-[#fffaf0]">
            {hero ? (
              <figure>
                <img src={hero.image_url} alt={hero.scientific_name} className="aspect-[4/3] w-full object-cover" />
                <figcaption className="border-t border-[#e4d8bb] p-4">
                  <p className="font-serif text-xl italic text-[#24321f]">{hero.scientific_name}</p>
                  <p className="mt-2 text-xs leading-5 text-[#5d684c]">
                    Source: {hero.source_name}
                    {hero.license ? ` · ${hero.license}` : ''}
                    {hero.attribution ? ` · ${hero.attribution}` : ' · photographer attribution not supplied by source'}
                  </p>
                </figcaption>
              </figure>
            ) : (
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 p-8 text-center text-[#657057]">
                <ImageOff className="h-8 w-8" />
                <p className="font-serif text-xl text-[#24321f]">No approved Continuum photograph available</p>
                <p className="max-w-md text-sm leading-6">
                  The page will not substitute an uncontrolled third-party image. Media remains an explicit evidence gap until an approved record is returned.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#d1bd8e] bg-[#f8f0dc] p-5">
            <div className="flex items-center gap-2 text-[#6f5c2a]">
              <Database className="h-4 w-4" />
              <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Knowledge graph coverage</p>
            </div>

            {continuumStatus === 'loading' && (
              <p className="mt-4 text-sm leading-6 text-[#5d684c]">Loading the connected Continuum evidence…</p>
            )}
            {continuumStatus === 'unavailable' && (
              <p className="mt-4 text-sm leading-6 text-[#5d684c]">
                The Continuum evidence service is temporarily unavailable. Scientific fallback claims are intentionally not substituted.
              </p>
            )}
            {continuum && (
              <>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {continuum.domains.map((item) => <EvidenceBadge key={item.domain} item={item} />)}
                </div>
                {continuum.gaps.length > 0 && (
                  <div className="mt-4 rounded-lg border border-dashed border-[#bca56e] bg-[#fffaf0] p-4">
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#806c39]">What we do not know yet</p>
                    <p className="mt-2 text-sm leading-6 text-[#4d5944]">
                      Current graph gaps: {continuum.gaps.map((domain) => DOMAIN_LABELS[domain]).join(', ')}. These mean “not linked in the current Continuum evidence,” not biological absence.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default DailyGenusFeatureContinuum;
