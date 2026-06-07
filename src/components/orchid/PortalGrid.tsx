import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe2, Sprout, GraduationCap, FlaskConical, ShieldCheck, ArrowUpRight,
} from 'lucide-react';

/**
 * Choose Your Portal
 * ------------------
 * Five concise doors into the Continuum. Visually distinct, restrained
 * in copy, and built to orient — not to explain. Detailed system
 * descriptions live on their own pages.
 *
 *   Atlas         — Maps of species, habitats, pollinators, biodiversity.
 *   Grow / OASIS  — Environmental intelligence + adaptive cultivation.
 *   Learn         — Education, Zoo, visual learning, glossary.
 *   Research      — Datasets, taxonomy, ecology, diagnostics, literature.
 *   Conservation  — Threatened species, restoration, stewardship.
 *
 * Hover states briefly explain acronyms (e.g. OASIS).
 */

type Portal = {
  title: string;
  acronym?: string;          // expanded form, shown on hover
  blurb: string;
  Icon: React.ComponentType<{ className?: string }>;
  route?: string;
  external?: string;
  accent: string;            // glow / underline tint
  image: string;             // habitat imagery
};

const PORTALS: Portal[] = [
  {
    title: 'Atlas',
    blurb: 'Maps of orchid species, habitats, pollinators, and biodiversity patterns.',
    Icon: Globe2,
    route: '/atlas',
    accent: '#9ad6ff',
    // Cloud forest canopy
    image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1100&q=80',
  },
  {
    title: 'Grow',
    acronym: 'OASIS — Orchid Adaptive Substrate & Intelligence System',
    blurb: 'Environmental intelligence and adaptive orchid cultivation systems.',
    Icon: Sprout,
    route: '/oacs',
    accent: '#c9a24a',
    // Greenhouse / cultivation soft light
    image: 'https://images.unsplash.com/photo-1462536943532-57a629f6cc60?w=1100&q=80',
  },
  {
    title: 'Learn',
    blurb: 'Education, Orchid Zoo, visual learning, glossary, and discovery tools.',
    Icon: GraduationCap,
    route: '/education',
    accent: '#e7d4ff',
    // Botanical study, herbarium-feel
    image: 'https://images.unsplash.com/photo-1606761568499-6d2451b23c66?w=1100&q=80',
  },
  {
    title: 'Research',
    blurb: 'Scientific datasets, taxonomy, ecology, diagnostics, and literature.',
    Icon: FlaskConical,
    route: '/research',
    accent: '#a78bff',
    // Microscopy / lab science
    image: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=1100&q=80',
  },
  {
    title: 'Conservation',
    blurb: 'Threatened species, habitat preservation, restoration, and ecological stewardship.',
    Icon: ShieldCheck,
    route: '/conservation',
    accent: '#ff8aa1',
    // Mist-laden montane habitat
    image: 'https://images.unsplash.com/photo-1567186937675-a5131c8a89ea?w=1100&q=80',
  },
];

const PortalGrid: React.FC = () => {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<string | null>(null);

  const enter = (p: Portal) => {
    if (p.external) {
      window.open(p.external, '_blank', 'noopener,noreferrer');
    } else if (p.route) {
      navigate(p.route);
    }
  };

  return (
    <section
      id="portals"
      className="relative bg-[#0a0d18] text-[#f5f0e8] overflow-hidden"
    >
      {/* atmospheric backdrop — indigo into charcoal, no green dominance */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 14% 0%, rgba(80,95,160,0.20) 0%, transparent 55%),' +
            'radial-gradient(ellipse at 88% 100%, rgba(180,130,70,0.10) 0%, transparent 55%),' +
            'linear-gradient(180deg, #0a0d18 0%, #070914 100%)',
        }}
      />
      {/* subtle botanical texture (sparse, low-opacity) */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.05] mix-blend-screen"
        style={{
          backgroundImage:
            'radial-gradient(circle at 18% 80%, #ffffff 0%, transparent 0.6px),' +
            'radial-gradient(circle at 82% 24%, #ffffff 0%, transparent 0.6px),' +
            'radial-gradient(circle at 50% 50%, #ffffff 0%, transparent 0.6px)',
          backgroundSize: '320px 320px',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-14 lg:py-16">
        {/* Section heading — quiet, observatory-style */}
        <div className="max-w-2xl">
          <div className="font-mono text-[10px] tracking-[0.32em] uppercase text-[#c9a24a] flex items-center gap-2">
            <span className="inline-block w-6 h-px bg-[#c9a24a]/60" />
            Portals
          </div>
          <h2 className="font-display text-[1.7rem] md:text-[2.1rem] leading-[1.1] mt-3 text-[#faf7f2]">
            Five ways into the living atlas.
          </h2>
        </div>

        {/* Explicit responsive grid — 1 col mobile / 2 cols sm / 5 cols xl */}
        <div className="mt-9 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 lg:gap-5">

          {PORTALS.map((p) => {
            const isHover = hovered === p.title;
            return (
              <button
                key={p.title}
                type="button"
                onClick={() => enter(p)}
                onMouseEnter={() => setHovered(p.title)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(p.title)}
                onBlur={() => setHovered(null)}
                className="group relative text-left rounded-2xl overflow-hidden border border-white/10 bg-[#0d1222] hover:border-white/25 transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24a]/60 min-h-[260px]"
              >
                {/* habitat imagery */}
                <div className="absolute inset-0">
                  <img
                    src={p.image}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover opacity-45 group-hover:opacity-65 group-hover:scale-[1.04] transition-all duration-[1200ms]"
                  />
                  {/* dark wash for legibility */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(10,13,24,0.25) 0%, rgba(10,13,24,0.78) 55%, rgba(10,13,24,0.96) 100%)',
                    }}
                  />
                  {/* accent halo on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                    style={{
                      background: `radial-gradient(ellipse at 50% 100%, ${p.accent}1f 0%, transparent 60%)`,
                    }}
                  />
                </div>

                {/* content */}
                <div className="relative h-full p-5 flex flex-col justify-end">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center mb-3"
                    style={{
                      background: `${p.accent}1a`,
                      border: `1px solid ${p.accent}55`,
                    }}
                  >
                    <p.Icon className="h-4 w-4" style={{ color: p.accent }} />
                  </div>

                  <h3 className="font-display text-[1.35rem] text-[#faf7f2] leading-tight">
                    {p.title}
                  </h3>

                  {/* Acronym expansion on hover (e.g. OASIS) */}
                  <div
                    aria-hidden={!isHover}
                    className={`overflow-hidden transition-all duration-300 ${
                      isHover && p.acronym ? 'max-h-16 opacity-100 mt-1' : 'max-h-0 opacity-0'
                    }`}
                  >
                    {p.acronym && (
                      <div className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-[#c9a24a]">
                        {p.acronym}
                      </div>
                    )}
                  </div>

                  <p className="font-body text-[13px] text-[#c8c0b0] leading-relaxed mt-2.5">
                    {p.blurb}
                  </p>

                  <div className="mt-4 font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a] inline-flex items-center gap-1.5 group-hover:text-[#deb866] transition-colors">
                    {p.external ? 'Open' : 'Enter'}
                    <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>

                  {/* accent underline */}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-[2px] opacity-60 group-hover:opacity-100 transition-opacity"
                    style={{ background: `linear-gradient(90deg, transparent, ${p.accent}, transparent)` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default PortalGrid;
