import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, Compass, BookOpen, ArrowUpRight } from 'lucide-react';

/**
 * ExploreThreeWays — three doors into the Continuum.
 *
 * Reframes the three public domains not as "platform pillars" but as three
 * ways a visitor can begin exploring the living web of orchid relationships:
 *
 *   · Conservatory — cultivation & stewardship   (/collection)
 *   · Observatory  — ecology & biodiversity       (/atlas)
 *   · Education    — learning & outreach          (/education)
 *
 * Forest-green ground, parchment text, gold accents — the homepage aesthetic.
 */

type Door = {
  title: string;
  kicker: string;
  invitation: string;
  description: string;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  cta: string;
};

const DOORS: Door[] = [
  {
    title: 'Conservatory',
    kicker: 'Cultivation & stewardship',
    invitation: 'Grow and protect living orchids.',
    description:
      'Tend living collections, keep cultivation records, and propagate threatened species. Growers become an ark — keeping orchids alive while their wild homes recover.',
    route: '/collection',
    icon: Leaf,
    accent: '#7dd3a8',
    cta: 'Enter the Conservatory',
  },
  {
    title: 'Observatory',
    kicker: 'Ecology & biodiversity',
    invitation: 'Map where orchids live and why.',
    description:
      'Trace native ranges, habitats, pollinators, fungi, and climate across the globe. The Atlas reveals the ecological web that decides where every species can survive.',
    route: '/atlas',
    icon: Compass,
    accent: '#9ad6ff',
    cta: 'Open the Observatory',
  },
  {
    title: 'Education',
    kicker: 'Learning & outreach',
    invitation: 'Share the wonder with others.',
    description:
      'Orchid biology, conservation lessons, culture sheets, and public learning — turning curiosity into understanding for students, growers, and the curious alike.',
    route: '/education',
    icon: BookOpen,
    accent: '#d4b34a',
    cta: 'Begin learning',
  },
];

const ExploreThreeWays: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section
      id="explore"
      className="relative bg-[#16271a] text-[#f5f0e8] border-b border-white/[0.06]"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 18% 0%, rgba(54,102,72,0.22) 0%, transparent 55%),' +
            'radial-gradient(ellipse at 82% 100%, rgba(120,90,40,0.10) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-20 lg:py-24">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-3 font-mono text-[10px] tracking-[0.32em] uppercase text-[#c9a24a]">
            <span className="inline-block w-8 h-px bg-[#c9a24a]/60" />
            Begin exploring
          </div>
          <h2
            className="mt-5 leading-[1.08] text-[#faf7f2]"
            style={{
              fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
              fontWeight: 500,
              fontSize: 'clamp(1.9rem, 3.8vw, 3rem)',
            }}
          >
            Three ways to explore the{' '}
            <span className="italic text-[#d4b34a]">Continuum</span>.
          </h2>
          <p className="mt-4 max-w-2xl font-body text-[14.5px] md:text-[15.5px] leading-relaxed text-[#cfc8b8]/85">
            However you arrived — grower, naturalist, teacher, or simply
            curious — there is a door into the living web. Choose where your
            exploration begins.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
          {DOORS.map((d) => (
            <article
              key={d.title}
              className="group relative flex flex-col rounded-2xl border border-white/[0.08] bg-[#1a2e1a]/70 backdrop-blur-md p-7 lg:p-8 hover:border-white/25 hover:bg-[#1f3622]/80 transition-all duration-300"
            >
              <div className="flex items-center justify-between">
                <div
                  className="font-mono text-[10.5px] tracking-[0.28em] uppercase"
                  style={{ color: d.accent }}
                >
                  {d.kicker}
                </div>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    background: `${d.accent}1a`,
                    border: `1px solid ${d.accent}55`,
                  }}
                >
                  <d.icon className="h-4 w-4" style={{ color: d.accent }} />
                </div>
              </div>

              <h3
                className="mt-6 text-[#faf7f2] leading-tight"
                style={{
                  fontFamily:
                    '"Playfair Display","Cormorant Garamond",Georgia,serif',
                  fontSize: 'clamp(1.6rem, 2.4vw, 1.95rem)',
                  fontWeight: 500,
                }}
              >
                {d.title}
              </h3>
              <div className="mt-2 italic text-[#e7dfd1]/90 text-[15px]"
                style={{ fontFamily: '"Cormorant Garamond",Georgia,serif' }}
              >
                {d.invitation}
              </div>

              <p className="font-body text-[14px] text-[#cfc8b8]/85 leading-relaxed mt-4">
                {d.description}
              </p>

              <div className="mt-auto pt-7">
                <button
                  type="button"
                  onClick={() => navigate(d.route)}
                  className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.22em] uppercase text-[#faf7f2] hover:text-[#deb866] transition-colors"
                >
                  {d.cta}
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>

              <div
                className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-80 transition-opacity rounded-b-2xl"
                style={{
                  background: `linear-gradient(90deg, transparent, ${d.accent}, transparent)`,
                }}
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ExploreThreeWays;
