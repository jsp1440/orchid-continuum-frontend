import React from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Globe2,
  Sprout,
  Mountain,
  Bug,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';

/**
 * Explore — the planned faceted entry points into the Continuum.
 *
 * None of these facets filter anything yet. The `/api/explore/*` routes they
 * were written against are not served, and no page reads the `facet` or `oftd`
 * query parameters, so a card that navigated to `/species?facet=country` would
 * silently return the unfiltered species list. Each facet therefore states that
 * it is in development rather than implying a working gallery.
 *
 * Nothing on this page asserts a count, a coverage figure, or an external data
 * linkage. Those are claims about production state, and this page has no source
 * for them; the Species browser is the one surface here backed by live data.
 */

interface Facet {
  key: string;
  title: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
}

const FACETS: Facet[] = [
  {
    key: 'oftd',
    title: 'Orchid of the Day',
    blurb: 'A single curated species each day, drawn from the Continuum.',
    icon: Sparkles,
  },
  {
    key: 'country',
    title: 'Orchids by Country',
    blurb: 'Browse the flora of any nation, from Madagascar to Ecuador to Borneo.',
    icon: Globe2,
  },
  {
    key: 'genus',
    title: 'Orchids by Genus',
    blurb: 'Bulbophyllum, Dendrobium, Pleurothallis — explore the great radiations.',
    icon: Sprout,
  },
  {
    key: 'habitat',
    title: 'Orchids by Habitat',
    blurb: 'Cloud forest, lithophyte cliffs, lowland swamps, montane grasslands.',
    icon: Mountain,
  },
  {
    key: 'pollinator',
    title: 'Orchids by Pollinator',
    blurb: 'Filter species by their documented pollinator partners.',
    icon: Bug,
  },
  {
    key: 'iucn',
    title: 'Conservation Status',
    blurb: 'Species grouped by published conservation assessment.',
    icon: ShieldCheck,
  },
];

const Explore: React.FC = () => {
  return (
    <PageShell
      eyebrow="Discovery surface"
      title="Explore the Continuum"
      titleAccent="by what matters to you."
      intro="These are the faceted galleries the Continuum is being built toward. None of them filter anything yet; the Species browser below is the surface that works today."
      /* PageShell's hero badge reads "Live data · Orchid Continuum + GBIF" and
         defaults to on. Nothing on this page is fed by live data or by GBIF, so
         leaving it would reinstate by inheritance the external-linkage claim the
         rest of this page removes. Partners.tsx opts out the same way. */
      showDemoBanner={false}
    >
      {/* What works today */}
      <section className="py-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#142a1f] to-[#0f2218] p-8 md:p-10">
            <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-emerald-300/80 mb-3">
              <Sparkles className="h-3.5 w-3.5" />
              Available now
            </div>
            <h2 className="font-serif text-3xl md:text-4xl">Species browser</h2>
            <p className="text-sm text-white/65 mt-4 max-w-xl leading-relaxed">
              Search the Continuum&rsquo;s species records and open any species for its
              taxonomy, evidence receipts and governed Atlas layers. Faceted browsing by
              country, habitat and pollinator is still being built.
            </p>
            <Link
              to="/species"
              data-testid="explore-species-browser"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-300/90 text-[#0d1f17] hover:bg-emerald-200 transition-colors font-medium text-sm"
            >
              <ArrowUpRight className="h-4 w-4" /> Browse species
            </Link>
          </div>
        </div>
      </section>

      {/* Planned facets — in development, deliberately not interactive */}
      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/70 mb-6">
            Planned facets
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FACETS.map(facet => {
              const Icon = facet.icon;
              return (
                <li
                  key={facet.key}
                  data-testid="explore-facet"
                  data-facet={facet.key}
                  className="rounded-2xl border border-white/10 bg-[#142a1f] p-6"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-300/10 border border-emerald-300/20 flex items-center justify-center text-emerald-200 mb-4">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="font-serif text-2xl mb-2">{facet.title}</div>
                  <p className="text-sm text-white/60 leading-relaxed mb-4">{facet.blurb}</p>
                  <div className="pt-3 border-t border-white/10">
                    <span
                      data-testid="explore-facet-unavailable"
                      className="text-[10px] tracking-[0.2em] uppercase text-[#c9a24a]"
                    >
                      In development
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </PageShell>
  );
};

export default Explore;
