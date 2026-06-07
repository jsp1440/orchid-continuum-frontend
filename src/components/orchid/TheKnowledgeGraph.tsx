import React from 'react';

/**
 * ACT 3 — THE PROBLEM AND THE SOLUTION.
 *
 * Replaces the earlier "no other platform" manifesto. Deep-navy backdrop with
 * high-contrast cream serif typography tuned for an audience averaging 65+.
 * Tells the story: for 200 years orchid knowledge has been scattered — the
 * Orchid Continuum is the knowledge graph that finally connects it.
 */

const TheKnowledgeGraph: React.FC = () => {
  return (
    <section
      id="the-knowledge-graph"
      className="relative border-y border-white/[0.06]"
      style={{ background: '#0d2535' }}
    >
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* Section label — spaced gold caps */}
          <div className="flex items-center gap-3">
            <span className="inline-block w-8 h-px" style={{ background: 'rgba(212,179,74,0.6)' }} />
            <span
              className="font-mono uppercase"
              style={{
                fontSize: 13,
                letterSpacing: '0.36em',
                color: '#d4b34a',
                fontWeight: 600,
              }}
            >
              The Knowledge Graph
            </span>
          </div>

          {/* Heading */}
          <h2
            className="mt-7"
            style={{
              fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
              fontSize: 'clamp(2.375rem, 4.5vw, 3.25rem)',
              fontWeight: 700,
              color: '#f0ebe0',
              lineHeight: 1.15,
            }}
          >
            For 200 years, everything we know about orchids has been scattered.
          </h2>

          {/* Body */}
          <div
            className="mt-8 space-y-6"
            style={{
              fontFamily: '"Cormorant Garamond",Georgia,serif',
              color: '#f0ebe0',
              fontSize: 'clamp(1.15rem, 1.55vw, 1.35rem)',
              fontWeight: 400,
              lineHeight: 1.8,
            }}
          >
            <p>
              Taxonomy lived in herbaria. Ecology in field journals. Cultivation
              knowledge in growers' heads and society newsletters. Conservation
              data in government databases. Scientific literature locked behind
              expensive journal paywalls. Identification keys buried in books most
              people will never find.
            </p>
            <p style={{ fontWeight: 600, color: '#ffffff' }}>
              No one had ever connected it all — until now.
            </p>
            <p>
              The Orchid Continuum is a knowledge graph: a living, structured
              network that links taxonomy, ecology, cultivation, conservation,
              literature, and occurrence data across 30,000 species and 130 global
              data sources. When you connect the fragments, something new becomes
              visible — the hidden web of relationships that every orchid depends
              on to survive.
            </p>
          </div>

          {/* Gold divider */}
          <div
            className="mt-12 mb-8 h-px w-full"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(212,179,74,0.85) 50%, transparent)',
            }}
          />

          {/* Subheading — gold, italic */}
          <p
            className="italic"
            style={{
              fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
              fontSize: 'clamp(1.375rem, 2.2vw, 1.65rem)',
              color: '#e6c563',
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            Because the data is connected, things become possible that were never
            possible before.
          </p>
        </div>
      </div>
    </section>
  );
};

export default TheKnowledgeGraph;
