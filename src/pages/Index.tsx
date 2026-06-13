import React from 'react';
import { Link } from 'react-router-dom';

const Index: React.FC = () => {
  return (
    <main className="min-h-screen bg-[#102617] text-[#f7f1df]">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-20">
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-[#d8b84a]">
          Orchid Continuum
        </p>
        <h1 className="mt-6 max-w-5xl font-serif text-5xl leading-tight md:text-7xl">
          A knowledge graph for orchid species, habitats, pollinators, and mycorrhizae.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-[#efe8cf]/80">
          The Orchid Continuum links taxonomy, images, occurrence records, habitat, pollination,
          fungal symbiosis, conservation, and diagnostic characters into one living research record.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            ['Species', 'Taxonomy, images, captions, and species records.'],
            ['Habitat', 'Elevation, geography, climate, and ecological setting.'],
            ['Pollinators', 'Observed and inferred pollination relationships.'],
            ['Mycorrhizae', 'Fungal partners and germination biology.'],
            ['Atlas', 'Maps, occurrence records, and distribution patterns.'],
            ['Identification Matrix', 'Diagnostic characters for comparison and recognition.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-3xl border border-[#d8b84a]/25 bg-black/20 p-6 shadow-xl">
              <h2 className="font-serif text-2xl text-[#f7f1df]">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#efe8cf]/75">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link to="/atlas" className="rounded-full bg-[#d8b84a] px-6 py-3 font-mono text-xs uppercase tracking-[0.25em] text-[#102617]">
            Open Atlas
          </Link>
          <Link to="/species" className="rounded-full border border-[#d8b84a]/50 px-6 py-3 font-mono text-xs uppercase tracking-[0.25em] text-[#f7f1df]">
            Species Search
          </Link>
        </div>
      </section>
    </main>
  );
};

export default Index;
