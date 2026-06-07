import React from 'react';

/**
 * WhyContinuumExists — full-width manifesto section placed immediately after
 * the hero. Warm parchment background, high-contrast serif typography tuned
 * for readability (audience average age 65+).
 *
 * "There is no other platform like this."
 */

const WhyContinuumExists: React.FC = () => {
  return (
    <section
      id="why-continuum-exists"
      className="relative border-b border-black/[0.06]"
      style={{ background: '#f5f0e8' }}
    >
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
              fontSize: 'clamp(2.25rem, 4.5vw, 3rem)',
              fontWeight: 700,
              color: '#1a2e1a',
              lineHeight: 1.15,
            }}
          >
            There is no other platform like this.
          </h2>

          <div
            className="mt-8 space-y-6"
            style={{
              fontFamily: '"Cormorant Garamond",Georgia,serif',
              color: '#2a2a2a',
              fontSize: 'clamp(1.15rem, 1.6vw, 1.35rem)',
              fontWeight: 400,
              lineHeight: 1.7,
            }}
          >
            <p>
              Orchids are the largest flowering plant family on Earth — nearly
              30,000 species, found on every continent except Antarctica. They
              are also among the most threatened. Habitat destruction, climate
              change, and illegal collection are pushing hundreds of species
              toward extinction faster than science can document them.
            </p>
            <p>
              The Orchid Continuum exists because no other platform connects the
              full picture. Not the taxonomy. Not the ecology. Not the
              cultivation knowledge held by growers worldwide. Not the
              mycorrhizal fungi every orchid seed depends on to germinate. Not
              the pollinators. Not the climate data. Not the conservation status
              of each of the nearly 30,000 species.
            </p>
            <p
              style={{
                fontWeight: 600,
                color: '#1a2e1a',
                fontSize: 'clamp(1.3rem, 1.9vw, 1.6rem)',
              }}
            >
              We do all of it. In one place. Open to everyone.
            </p>
            <p>
              Every grower who has ever lost a species. Every researcher racing
              to document a vanishing habitat. Every child who has ever been
              stopped in their tracks by a flower that looks like a face — this
              platform is built for them.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyContinuumExists;
