import React from 'react';
import {
  Network,
  GitBranch,
  Bug,
  Sprout,
  Thermometer,
  Globe2,
  ShieldCheck,
} from 'lucide-react';

/**
 * WhyOrchidsMatter — Section 6 of the storytelling homepage.
 *
 * Orchids are not just beautiful; they are a lens. Because they are so
 * exquisitely dependent on other living things, watching an orchid teaches
 * us how the whole living world is wired together. Awe-driven, not technical.
 */

interface Lesson {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}

const LESSONS: Lesson[] = [
  {
    icon: Network,
    title: 'Ecology',
    body: 'An orchid is a knot in a web. Reading it shows how species lean on one another to survive.',
  },
  {
    icon: GitBranch,
    title: 'Evolution',
    body: 'With ~28,000 species, orchids are evolution caught in the act — endless variations on a single floral idea.',
  },
  {
    icon: Bug,
    title: 'Pollination',
    body: 'Mimicry, scent, and deception: orchids reveal the elaborate bargains flowers strike with insects.',
  },
  {
    icon: Sprout,
    title: 'Fungal symbiosis',
    body: 'No orchid germinates alone. They teach us that life beneath the soil sustains the life above it.',
  },
  {
    icon: Thermometer,
    title: 'Climate change',
    body: 'Tied to narrow climate bands, orchids are sensitive instruments registering a warming world.',
  },
  {
    icon: Globe2,
    title: 'Biodiversity',
    body: 'Found on every continent but Antarctica, orchids map the richness — and fragility — of life on Earth.',
  },
  {
    icon: ShieldCheck,
    title: 'Conservation',
    body: 'To save an orchid you must save its forest, fungus, and pollinator — the lesson of protecting whole systems.',
  },
];

const WhyOrchidsMatter: React.FC = () => {
  return (
    <section
      id="why-orchids-matter"
      className="relative text-[#f0ebe0] border-b border-white/[0.06] overflow-hidden"
      style={{ background: '#0d2535' }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(45,120,140,0.22) 0%, transparent 60%)',
        }}
      />
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-20 lg:py-28">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-3 font-mono text-[12px] tracking-[0.32em] uppercase text-[#d4b34a]">
            <span className="inline-block w-8 h-px bg-[#d4b34a]/60" />
            Why Orchids Matter
            <span className="inline-block w-8 h-px bg-[#d4b34a]/60" />
          </div>
          <h2
            className="mt-6 text-[#faf7f2] leading-[1.07]"
            style={{
              fontFamily:
                '"Playfair Display","Cormorant Garamond",Georgia,serif',
              fontSize: 'clamp(2rem, 4vw, 3.2rem)',
              fontWeight: 700,
            }}
          >
            Orchids teach us how life{' '}
            <span className="italic text-[#d4b34a]">connects</span>.
          </h2>
          <p
            className="mt-5 text-[#f0ebe0] font-body mx-auto"
            style={{ fontSize: 18, lineHeight: 1.7, fontWeight: 400, maxWidth: 680 }}
          >
            Few living things are so dependent on others. That fragility is
            exactly why orchids are such powerful teachers — follow one, and you
            begin to see the threads that hold the entire living world together.
          </p>
        </div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-white/[0.08] rounded-2xl overflow-hidden border border-white/[0.08]">
          {LESSONS.map((l) => {
            const Icon = l.icon;
            return (
              <div
                key={l.title}
                className="group p-7 transition-colors"
                style={{ background: '#10314a' }}
              >
                <div className="inline-flex items-center justify-center h-11 w-11 rounded-full border border-[#d4b34a]/40 text-[#d4b34a] group-hover:bg-[#d4b34a] group-hover:text-[#0d2535] transition-colors">
                  <Icon className="h-5 w-5" />
                </div>
                <h3
                  className="mt-4 text-[#faf7f2] text-xl italic"
                  style={{
                    fontFamily:
                      '"Playfair Display","Cormorant Garamond",Georgia,serif',
                  }}
                >
                  {l.title}
                </h3>
                <p
                  className="mt-2 text-[#e2dccb] font-body"
                  style={{ fontSize: 15, lineHeight: 1.7, fontWeight: 400 }}
                >
                  {l.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};


export default WhyOrchidsMatter;
