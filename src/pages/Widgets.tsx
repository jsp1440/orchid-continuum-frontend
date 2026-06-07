/**
 * Widgets gallery page (/widgets).
 * --------------------------------
 * Showcases the six embeddable Orchid Continuum widgets so partner
 * sites and curators can preview them. Each widget pulls live data
 * from the Continuum API (or its declared placeholder when the API
 * is not yet configured).
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Code2 } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import {
  SpeciesSnapshotWidget,
  OrchidOfTheDayWidget,
  AtlasTeaserWidget,
  EcologicalInteractionCardWidget,
  ZooReviewCardWidget,
  OacsGreenhouseSnapshotWidget,
} from '@/components/widgets';

const WIDGETS: {
  id: string;
  title: string;
  desc: string;
  embed: string;
  Component: React.FC<any>;
  props?: Record<string, unknown>;
}[] = [
  {
    id: 'species-snapshot',
    title: 'Species Snapshot',
    desc: 'Compact species card with thumbnail, taxonomy, and ecological pills. Use it to embed any Orchid Continuum taxon on a partner page.',
    embed: '<oc-widget kind="species-snapshot" taxonomy-id="…" />',
    Component: SpeciesSnapshotWidget,
  },
  {
    id: 'orchid-of-the-day',
    title: 'Orchid of the Day',
    desc: 'A daily-rotating featured species, deterministic per calendar day so partner pages stay in sync.',
    embed: '<oc-widget kind="orchid-of-the-day" />',
    Component: OrchidOfTheDayWidget,
  },
  {
    id: 'atlas-teaser',
    title: 'Atlas Teaser',
    desc: 'Brand-consistent link card for partner sites pointing into the live Atlas with all geospatial layers.',
    embed: '<oc-widget kind="atlas-teaser" />',
    Component: AtlasTeaserWidget,
  },
  {
    id: 'ecological-interaction-card',
    title: 'Ecological Interaction Card',
    desc: 'Pollinator and visitor counts plus ecological badges, sourced from oc_api.species_page_globi_interaction_panel_v1.',
    embed: '<oc-widget kind="ecological-interaction" taxonomy-id="…" />',
    Component: EcologicalInteractionCardWidget,
    props: { taxonomyId: 'demo-taxonomy-id' },
  },
  {
    id: 'orchid-zoo-review-card',
    title: 'Orchid Zoo Review Card',
    desc: 'Queue depth and active reviewers — useful as a citizen-science recruitment widget on partner blogs.',
    embed: '<oc-widget kind="zoo-review" />',
    Component: ZooReviewCardWidget,
  },
  {
    id: 'oacs-greenhouse-snapshot',
    title: 'OACS Greenhouse Snapshot',
    desc: 'Latest temperature, humidity, and PAR for an OACS site. Falls back to clearly-labeled demo data until /api/oacs is online.',
    embed: '<oc-widget kind="oacs-snapshot" site-id="…" />',
    Component: OacsGreenhouseSnapshotWidget,
  },
];

const Widgets: React.FC = () => {
  return (
    <div
      className="min-h-screen bg-[#0d1f17] text-white antialiased"
      style={{ fontFamily: '"Inter", system-ui, -apple-system, sans-serif' }}
    >
      <style>{`
        .font-serif { font-family: 'Cormorant Garamond', 'Playfair Display', Georgia, serif; font-weight: 500; letter-spacing: -0.01em; }
      `}</style>
      <Navbar />

      <main className="pt-24">
        <section className="border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-emerald-200 transition-colors mb-10"
            >
              <ArrowLeft className="h-4 w-4" /> Return to Continuum
            </Link>
            <div className="text-xs tracking-[0.3em] uppercase text-emerald-200/80 mb-5">
              Embeddable Widgets · v0
            </div>
            <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] max-w-4xl">
              Drop Continuum intelligence{' '}
              <span className="italic text-emerald-200/95">
                into any page.
              </span>
            </h1>
            <p className="text-lg text-white/70 mt-6 max-w-2xl leading-relaxed font-light">
              Six modular widgets compiled against the public Orchid
              Continuum API. Use them as React components today, or as
              web-components / iframes once the embed bundle ships.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {WIDGETS.map(w => {
              const Comp = w.Component;
              return (
                <div
                  key={w.id}
                  className="rounded-2xl border border-white/10 bg-[#0a1812] p-5"
                >
                  <div className="font-serif text-2xl mb-1">{w.title}</div>
                  <p className="text-sm text-white/60 leading-relaxed mb-4">
                    {w.desc}
                  </p>
                  <div className="rounded-xl bg-[#0d1f17] p-3 border border-white/5">
                    <Comp {...(w.props || {})} />
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-white/45">
                    <Code2 className="h-3 w-3" />
                    <code className="text-emerald-200/80 font-mono break-all">
                      {w.embed}
                    </code>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Widgets;
