import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Globe2,
  Sprout,
  Mountain,
  Bug,
  ShieldCheck,
  Camera,
  ArrowUpRight,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';

/**
 * Explore — gallery hub for browsing the orchid universe by facet.
 *
 * Each card maps to a future faceted gallery endpoint. Until backend
 * routes are live, every card opens the Species Explorer with a
 * pre-applied query parameter, so the page is publishable today.
 */

interface Facet {
  key: string;
  title: string;
  blurb: string;
  count: string;
  icon: React.ComponentType<{ className?: string }>;
  endpoint: string;
  query: string; // species-page query params
}

const FACETS: Facet[] = [
  {
    key: 'oftd',
    title: 'Orchid of the Day',
    blurb:
      'A single curated species each day, drawn from the Continuum at sunrise UTC.',
    count: 'Updated daily',
    icon: Sparkles,
    endpoint: '/api/explore/orchid-of-the-day',
    query: 'oftd=1',
  },
  {
    key: 'country',
    title: 'Orchids by Country',
    blurb:
      'Browse the flora of any nation, from Madagascar to Ecuador to Borneo.',
    count: '180+ countries',
    icon: Globe2,
    endpoint: '/api/explore/by-country',
    query: 'facet=country',
  },
  {
    key: 'genus',
    title: 'Orchids by Genus',
    blurb:
      'Bulbophyllum, Dendrobium, Pleurothallis — explore the great radiations.',
    count: '850+ genera',
    icon: Sprout,
    endpoint: '/api/explore/by-genus',
    query: 'facet=genus',
  },
  {
    key: 'habitat',
    title: 'Orchids by Habitat',
    blurb:
      'Cloud forest, lithophyte cliffs, lowland swamps, montane grasslands.',
    count: '40+ habitats',
    icon: Mountain,
    endpoint: '/api/explore/by-habitat',
    query: 'facet=habitat',
  },
  {
    key: 'pollinator',
    title: 'Orchids by Pollinator',
    blurb:
      'Filter species by their documented pollinator partners — bees, moths, birds, flies.',
    count: 'GloBI-linked',
    icon: Bug,
    endpoint: '/api/explore/by-pollinator',
    query: 'facet=pollinator',
  },
  {
    key: 'iucn',
    title: 'Conservation Status',
    blurb:
      'IUCN-categorized species — vulnerable, endangered, critically endangered.',
    count: 'IUCN-aligned',
    icon: ShieldCheck,
    endpoint: '/api/explore/by-conservation',
    query: 'facet=conservation',
  },
];

const Explore: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageShell
      eyebrow="Discovery surface"
      title="Explore the Continuum"
      titleAccent="by what matters to you."
      intro="Every facet here is a gallery into the same living dataset. Pick a country, a pollinator, a habitat — the Continuum reorganises itself around your question."
    >
      {/* Featured Orchid of the Day band */}
      <section className="py-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#142a1f] to-[#0f2218] p-8 md:p-10 flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-emerald-300/80 mb-3">
                <Sparkles className="h-3.5 w-3.5" />
                Today's feature
              </div>
              <h2 className="font-serif text-3xl md:text-4xl">
                Orchid of the Day
              </h2>
              <p className="text-sm text-white/65 mt-4 max-w-xl leading-relaxed">
                A new species surfaces every day at sunrise UTC, complete with
                taxonomy, range, ecological partners, and conservation
                context. Powered by{' '}
                <code className="text-emerald-200/90">
                  /api/explore/orchid-of-the-day
                </code>
                .
              </p>
              <button
                type="button"
                onClick={() => navigate('/species?oftd=1')}
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-300/90 text-[#0d1f17] hover:bg-emerald-200 transition-colors font-medium text-sm"
              >
                <Camera className="h-4 w-4" /> View today's orchid
              </button>
            </div>
            <div className="w-full md:w-64 aspect-[4/5] rounded-xl border border-white/10 bg-[#0a1812] overflow-hidden flex items-center justify-center text-white/30 text-xs tracking-[0.2em] uppercase">
              Image · live API
            </div>
          </div>
        </div>
      </section>

      {/* Facets grid */}
      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/70 mb-6">
            Browse by facet
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FACETS.map(f => {
              const Icon = f.icon;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => navigate(`/species?${f.query}`)}
                  className="text-left rounded-2xl border border-white/10 bg-[#142a1f] hover:border-emerald-300/40 hover:bg-[#163024] transition-all p-6 group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg bg-emerald-300/10 border border-emerald-300/20 flex items-center justify-center text-emerald-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-white/30 group-hover:text-emerald-200 transition-colors" />
                  </div>
                  <div className="font-serif text-2xl mb-2">{f.title}</div>
                  <p className="text-sm text-white/60 leading-relaxed mb-4">
                    {f.blurb}
                  </p>
                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <span className="text-[10px] tracking-[0.2em] uppercase text-emerald-300/70">
                      {f.count}
                    </span>
                    <code className="text-[10px] text-white/40 truncate ml-2">
                      {f.endpoint}
                    </code>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </PageShell>
  );
};

export default Explore;
