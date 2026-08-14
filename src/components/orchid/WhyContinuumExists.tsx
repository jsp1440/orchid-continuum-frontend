import React from 'react';
import { ArrowRight, BookOpen, Network } from 'lucide-react';

const WhyContinuumExists: React.FC = () => {
  return (
    <section
      id="why-continuum-exists"
      className="relative overflow-hidden border-b border-white/[0.08] bg-[#101f14] text-[#f5f0e8]"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 10% 0%, rgba(212,179,74,0.13) 0%, transparent 45%),' +
            'linear-gradient(180deg, #102416 0%, #0a170f 100%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-6 py-12 lg:px-10 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#d4b34a]">
              <Network className="h-4 w-4" />
              Why connect the evidence?
            </div>
            <h2
              className="mt-5 max-w-2xl leading-[1.04] tracking-[-0.01em] text-[#fffaf0]"
              style={{
                fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontSize: 'clamp(2.1rem, 4.2vw, 3.8rem)',
                fontWeight: 540,
              }}
            >
              The story of an orchid is scattered across many places.
            </h2>
          </div>

          <div className="max-w-2xl">
            <p className="text-[17px] leading-8 text-[#d8cfbd]/88 md:text-[18px]">
              A name may live in one database, an observation in another, a
              pollinator in a paper, a fungal partner in a sequence record, and
              a conservation concern on a map. Orchid Continuum brings those
              pieces into one evidence-linked view so their relationships can be
              explored together.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#species-in-focus"
                className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.20em] text-[#14281c] transition-colors hover:bg-[#e6c763]"
              >
                <BookOpen className="h-4 w-4" />
                Return to Featured Genus
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="/relationship-explorer"
                className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.20em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a] hover:bg-[#d4b34a]/10"
              >
                Explore relationships
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyContinuumExists;
