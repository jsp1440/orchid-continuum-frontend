import React from 'react';
import { Link } from 'react-router-dom';

/**
 * HomeContinuumIntro — the first-screen explanation of the Orchid Continuum:
 * what it is, why it matters, how it was made, and what a visitor can do.
 *
 * The copy is the owner's original homepage wording, restored after the
 * HOMEPAGE-SLICE-1 hero (813c702e) unmounted HomeHero and WhyContinuumExists:
 *   - heading and "What it is" — WhyContinuumExists (d7d80840)
 *   - "Why it matters" — HomeHero (93f2e30f) and WhyContinuumExists (d7d80840)
 *   - "How it was made" — TheKnowledgeGraph (48477814) and its data sources
 *   - "What you can do" — TheKnowledgeGraph (48477814)
 * Sentences are trimmed to fit the first screen; no counts are stated.
 */

type IntroPart = {
  label: string;
  lead: string;
  detail?: string;
};

const PARTS: IntroPart[] = [
  {
    label: 'What it is',
    lead: 'An integrated platform for connecting taxonomy, images, maps, literature, ecology, cultivation, education, and conservation into one navigable experience.',
  },
  {
    label: 'Why it matters',
    lead: 'No orchid exists alone. Each one is bound to a pollinator, a fungus, a climate, and a place on Earth.',
    detail: 'Discovery should lead to better decisions: habitat protection, propagation, education, research priorities, and community participation.',
  },
  {
    label: 'How it was made',
    lead: 'Orchid science is scattered across names, images, occurrence records, field notes, pollination studies, fungal associations, climate data, conservation records, and literature. A knowledge graph does not simply store those facts. It connects them.',
  },
  {
    label: 'What you can do',
    lead: 'Not just a collection of databases, but a way to ask better questions about orchid life on Earth.',
  },
];

const SOURCES = ['GBIF', 'iNaturalist', 'EOL', 'World Plants', 'BHL'];

const ACTIONS = [
  { label: 'Species', to: '/species' },
  { label: 'Atlas', to: '/atlas' },
  { label: 'Calyx', to: '/calyx' },
  { label: 'Lexicon', to: '/lexicon' },
  { label: 'Identification', to: '/orchid-identification' },
];

const HomeContinuumIntro: React.FC = () => (
  <section
    id="what-is-the-continuum"
    aria-labelledby="continuum-intro-title"
    className="relative overflow-hidden border-b border-white/[0.08] bg-[#101f14] text-[#f5f0e8]"
  >
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse at 10% 0%, rgba(212,179,74,0.12) 0%, transparent 45%),' +
          'linear-gradient(180deg, #102416 0%, #0a170f 100%)',
      }}
    />

    <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-6 sm:px-6 md:py-9 lg:px-10">
      <p className="inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.26em] text-[#d4b34a]">
        <span className="inline-block h-px w-6 bg-[#d4b34a]/60" aria-hidden="true" />
        The Orchid Continuum
      </p>

      <h2
        id="continuum-intro-title"
        className="mt-3 max-w-4xl leading-[1.08] tracking-[-0.01em] text-[#fffaf0]"
        style={{
          fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
          fontWeight: 500,
          fontSize: 'clamp(1.35rem, 3vw, 2.4rem)',
        }}
      >
        A living orchid knowledge system, built for science and public wonder.
      </h2>

      <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {PARTS.map((part) => (
          <div key={part.label} className="border-t border-[#d4b34a]/25 pt-3">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#d4b34a]">
              {part.label}
            </h3>
            <p className="mt-2 text-[13px] leading-5 text-[#d8cfbd]/90 md:text-[14px] md:leading-6">
              {part.lead}
              {part.detail && <span className="hidden sm:inline"> {part.detail}</span>}
            </p>

            {part.label === 'How it was made' && (
              <p className="mt-2 hidden font-mono text-[10px] uppercase tracking-[0.14em] text-[#d8cfbd]/60 sm:block">
                Sources · {SOURCES.join(' · ')}
              </p>
            )}

            {part.label === 'What you can do' && (
              <nav aria-label="Explore the Orchid Continuum" className="mt-3 flex flex-wrap gap-2">
                {ACTIONS.map((action) => (
                  <Link
                    key={action.to}
                    to={action.to}
                    className="inline-flex min-h-[32px] items-center rounded-full border border-[#d4b34a]/40 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a] hover:bg-[#d4b34a]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4b34a]"
                  >
                    {action.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default HomeContinuumIntro;
