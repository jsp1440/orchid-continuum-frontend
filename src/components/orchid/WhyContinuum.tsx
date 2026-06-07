import React from 'react';
import { Quote } from 'lucide-react';

/**
 * Why the Continuum exists.
 *
 * Editorial cream section. Anchors the homepage narrative with the canonical
 * line "Knowledge fragments, but biodiversity does not." Four "fracture"
 * cards explain why orchid knowledge has been dispersed, before the closing
 * statement reframes the Continuum as connective tissue.
 */
const fractures = [
  {
    n: '01',
    title: 'Knowledge is scattered',
    body: 'Species descriptions, photographs, and field notes live in herbaria, journals, social posts, and the memories of growers — rarely in the same place, never in the same shape.',
  },
  {
    n: '02',
    title: 'Conservation data is dispersed',
    body: 'Occurrence records, threat assessments, and recovery plans are held by hundreds of institutions, in dozens of formats, with no shared layer connecting them to the living orchid.',
  },
  {
    n: '03',
    title: 'Cultivation is generalised',
    body: 'Most culture sheets describe a genus. Yet every species evolved within a specific habitat — elevation, seasonality, light regime, and fungal partner. That precision has been lost.',
  },
  {
    n: '04',
    title: 'Ecology is disconnected',
    body: 'Pollinators, mycorrhizal fungi, host trees, and microclimate are usually studied — and presented — in isolation, hiding the relationships that determine whether an orchid survives at all.',
  },
];

const WhyContinuum: React.FC = () => {
  return (
    <section id="why" className="relative bg-cream border-t border-quiet">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-5">
            <div className="label-eyebrow">Why the Continuum exists</div>
            <h2 className="mt-6 font-display text-4xl sm:text-5xl lg:text-[3.25rem] leading-[1.08] text-ink">
              Knowledge fragments,<br />
              <span className="italic text-forest">but biodiversity does not.</span>
            </h2>
            <div className="rule-gold" />
            <p className="mt-8 font-body text-lg text-charcoal leading-relaxed max-w-md">
              Orchids occupy nearly every terrestrial habitat on Earth, yet
              what we know about them sits in pieces — across collections,
              papers, sensors, herbaria, and human memory.
            </p>
            <p className="mt-5 font-body text-base text-charcoal/80 leading-relaxed max-w-md">
              The Continuum is not a database. It is the connective tissue
              between observation, ecology, cultivation, and conservation —
              the layer where fragments become understanding.
            </p>
          </div>

          <div className="lg:col-span-7">
            <div className="grid sm:grid-cols-2 gap-5">
              {fractures.map(f => (
                <article
                  key={f.n}
                  className="relative bg-warm-white border border-quiet p-7 rounded-sm hover:border-[#1f3d2b]/40 transition-colors"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
                      {f.n}
                    </span>
                    <Quote className="h-3.5 w-3.5 text-[#1f3d2b]/30" />
                  </div>
                  <h3 className="mt-5 font-display text-xl text-ink">{f.title}</h3>
                  <p className="mt-3 font-body text-[15px] text-charcoal/80 leading-relaxed">
                    {f.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyContinuum;
