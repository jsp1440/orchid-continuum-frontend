import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, Compass, BookOpen, ArrowUpRight } from 'lucide-react';

/**
 * ThreePillars — the three major public pillars of the Orchid Continuum.
 *
 *   1. Orchid Conservatory   (/collection)
 *      Living orchid collections, cultivation records, member plants,
 *      conservation propagation, species care, collection-based learning.
 *
 *   2. Orchid Observatory    (/atlas)
 *      The Atlas is the Observatory — maps, native ranges, occurrence
 *      data, habitats, pollinators, mycorrhizal fungi, climate
 *      gradients, and biodiversity patterns.
 *
 *   3. Education              (/education)
 *      Orchid biology, conservation education, culture sheets,
 *      articles, lessons, public learning, and FCOS resources.
 *
 * Visual direction: dark botanical aesthetic, ecological imagery,
 * scientific museum / ecological atlas feeling. No invented acronyms.
 * OASIS is presented separately as the connective intelligence that
 * supports all three pillars — not as a fourth pillar.
 */

type Pillar = {
  number: string;
  title: string;
  kicker: string;
  description: string;
  bullets: string[];
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  cta: string;
};

const PILLARS: Pillar[] = [
  {
    number: 'I',
    title: 'Orchid Conservatory',
    kicker: 'Living collections & cultivation',
    description:
      'Living orchid collections, cultivation records, and member plants — a stewardship space for growing, documenting, and propagating species under human care.',
    bullets: [
      'Member plants & cultivation records',
      'Species care sheets and culture notes',
      'Conservation propagation & ex-situ stewardship',
      'Collection-based learning',
    ],
    route: '/collection',
    icon: Leaf,
    accent: '#7dd3a8',
    cta: 'Enter the Conservatory',
  },
  {
    number: 'II',
    title: 'Orchid Observatory',
    kicker: 'Atlas of living systems',
    description:
      'The Atlas is the Observatory — maps of native ranges, occurrence data, habitats, pollinators, mycorrhizal fungi, climate gradients, and biodiversity patterns across Orchidaceae.',
    bullets: [
      'Native ranges & occurrence maps',
      'Habitats, pollinators & mycorrhizal fungi',
      'Climate gradients & biodiversity patterns',
      'Real-geography ecological filters',
    ],
    route: '/atlas',
    icon: Compass,
    accent: '#9ad6ff',
    cta: 'Open the Observatory',
  },
  {
    number: 'III',
    title: 'Education',
    kicker: 'Biology, conservation & public learning',
    description:
      'Orchid biology, conservation education, culture sheets, articles, lessons, and public learning — including educational resources curated with the Five Cities Orchid Society.',
    bullets: [
      'Orchid biology & physiology',
      'Conservation education & lessons',
      'Culture sheets & articles',
      'FCOS educational resources',
    ],
    route: '/education',
    icon: BookOpen,
    accent: '#d4b34a',
    cta: 'Begin Learning',
  },
];

const ThreePillars: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section
      id="three-pillars"
      className="relative bg-[#05070f] text-[#f5f0e8] border-t border-white/[0.06]"
    >
      {/* Atmospheric ecological wash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 18% 0%, rgba(40,86,68,0.18) 0%, transparent 55%),' +
            'radial-gradient(ellipse at 82% 100%, rgba(120,90,40,0.12) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-20 lg:py-24">
        {/* Section header */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-3 font-mono text-[10px] tracking-[0.32em] uppercase text-[#c9a24a]">
            <span className="inline-block w-8 h-px bg-[#c9a24a]/60" />
            The Orchid Continuum
          </div>
          <h2
            className="mt-4 leading-[1.08] text-[#faf7f2]"
            style={{
              fontFamily:
                '"Playfair Display","Cormorant Garamond",Georgia,serif',
              fontWeight: 500,
              fontSize: 'clamp(1.9rem, 3.8vw, 3rem)',
            }}
          >
            Three pillars for orchid science, conservation, and discovery.
          </h2>
          <p className="mt-4 max-w-2xl font-body text-[14.5px] md:text-[15.5px] leading-relaxed text-[#cfc8b8]/85">
            The platform is organised around three complementary domains —
            the living plants we steward, the ecological systems we map,
            and the knowledge we share. Each is a distinct body of practice
            with its own tools and contributors.
          </p>
        </div>

        {/* Three-pillar grid */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
          {PILLARS.map((p) => (
            <article
              key={p.title}
              className="group relative flex flex-col rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 backdrop-blur-md p-7 lg:p-8 hover:border-white/25 hover:bg-[#0c1024]/80 transition-all duration-300"
            >
              {/* Roman numeral + icon */}
              <div className="flex items-center justify-between">
                <div
                  className="font-mono text-[11px] tracking-[0.32em] uppercase"
                  style={{ color: p.accent }}
                >
                  Pillar&nbsp;{p.number}
                </div>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    background: `${p.accent}1a`,
                    border: `1px solid ${p.accent}55`,
                  }}
                >
                  <p.icon className="h-4 w-4" style={{ color: p.accent }} />
                </div>
              </div>

              {/* Title */}
              <h3
                className="mt-6 text-[#faf7f2] leading-tight"
                style={{
                  fontFamily:
                    '"Playfair Display","Cormorant Garamond",Georgia,serif',
                  fontSize: 'clamp(1.6rem, 2.4vw, 1.95rem)',
                  fontWeight: 500,
                }}
              >
                {p.title}
              </h3>
              <div className="mt-1 font-mono text-[10.5px] tracking-[0.22em] uppercase text-[#cfc8b8]/65">
                {p.kicker}
              </div>

              {/* Description */}
              <p className="font-body text-[14px] text-[#cfc8b8]/85 leading-relaxed mt-5">
                {p.description}
              </p>

              {/* Bullets */}
              <ul className="mt-5 space-y-2">
                {p.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2.5 font-body text-[13.5px] text-[#cfc8b8]/80 leading-snug"
                  >
                    <span
                      className="mt-[7px] inline-block w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: p.accent }}
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="mt-7 pt-5 border-t border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => navigate(p.route)}
                  className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.22em] uppercase text-[#faf7f2] hover:text-[#deb866] transition-colors"
                >
                  {p.cta}
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>

              {/* accent underline on hover */}
              <div
                className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-80 transition-opacity rounded-b-2xl"
                style={{
                  background: `linear-gradient(90deg, transparent, ${p.accent}, transparent)`,
                }}
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ThreePillars;
