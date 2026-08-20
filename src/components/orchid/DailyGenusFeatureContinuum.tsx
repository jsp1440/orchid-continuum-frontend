import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bug, Database, Globe2, ImageOff, MessageCircle, Sprout } from 'lucide-react';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import type { ContinuumDomainState } from '@/lib/featuredTaxonContinuum';
import { featuredTaxonAtlasHref, featuredTaxonCalyxHref } from '@/lib/featuredTaxonNavigation';
import type { WebNodeData } from '@/lib/ocBackend';

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

function RelationshipCard({
  label,
  question,
  node,
  icon,
}: {
  label: string;
  question: string;
  node: WebNodeData | null | undefined;
  icon: React.ReactNode;
}) {
  const hasData = Boolean(node?.hasData);
  return (
    <article className="rounded-xl border border-[#d1bd8e] bg-[#fffaf0] p-5">
      <div className="flex items-center gap-2 text-[#755f29]">
        {icon}
        <p className="font-mono text-[9px] uppercase tracking-[0.2em]">{label}</p>
      </div>
      <h3 className="mt-2 font-serif text-2xl leading-tight text-[#24321f]">{question}</h3>
      {hasData ? (
        <>
          <p className="mt-3 text-sm font-medium text-[#3d4936]">{node?.summary}</p>
          {node?.items?.length ? (
            <ul className="mt-3 space-y-1 text-sm leading-6 text-[#5d684c]">
              {node.items.slice(0, 3).map((item) => <li key={item}>• {item}</li>)}
            </ul>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-[#747d68]">
            Shown only because the Continuum relationship endpoint returned linked evidence for this featured genus.
          </p>
        </>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-[#c9b37e] bg-[#fbf5e6] p-3">
          <p className="text-sm font-medium text-[#4a5542]">Not yet documented in the current Continuum view.</p>
          <p className="mt-1 text-xs leading-5 text-[#747d68]">This is a knowledge gap, not evidence that the relationship is biologically absent.</p>
        </div>
      )}
    </article>
  );
}

const DailyGenusFeatureContinuum: React.FC = () => {
  const { genus, continuum, continuumStatus } = useDailyGenus();
  const media = continuum?.media.items ?? [];
  const hero = media[0] ?? null;
  const relationships = continuum?.relationships ?? null;
  const atlasHref = featuredTaxonAtlasHref(genus);
  const calyxHref = featuredTaxonCalyxHref(genus);

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
              Follow this orchid outward through the evidence the Orchid Continuum actually links. Missing relationships remain visible instead of being filled with generic scientific claims.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start md:self-auto">
            <Link
              to={atlasHref}
              className="inline-flex items-center gap-2 rounded-lg border border-[#b59a58] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#665321] hover:bg-[#fff7df]"
            >
              Explore in Atlas <Globe2 className="h-3.5 w-3.5" />
            </Link>
            <Link
              to={calyxHref}
              className="inline-flex items-center gap-2 rounded-lg border border-[#b59a58] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#665321] hover:bg-[#fff7df]"
            >
              Ask Calyx <MessageCircle className="h-3.5 w-3.5" />
            </Link>
            <Link
              to={`/genus/${encodeURIComponent(genus)}`}
              className="inline-flex items-center gap-2 rounded-lg border border-[#b59a58] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#665321] hover:bg-[#fff7df]"
            >
              Research profile <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
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

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <RelationshipCard
            label="Pollination"
            question="Who is linked to its pollination story?"
            node={relationships?.pollinators}
            icon={<Bug className="h-4 w-4" />}
          />
          <RelationshipCard
            label="Mycorrhizae"
            question="Which fungal partnerships are documented?"
            node={relationships?.fungi}
            icon={<Sprout className="h-4 w-4" />}
          />
          <RelationshipCard
            label="Place"
            question="Where has the Continuum recorded it?"
            node={relationships?.geography}
            icon={<Globe2 className="h-4 w-4" />}
          />
        </div>
      </div>
    </section>
  );
};

export default DailyGenusFeatureContinuum;
