import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  Sparkles,
  LineChart,
  MapPin,
  Thermometer,
  ShieldCheck,
  Leaf,
  ArrowUpRight,
} from 'lucide-react';

/**
 * FeaturedSystems — the homepage's "Featured Systems" band.
 *
 * Uses ONLY the approved system names from the editorial brief:
 *
 *   - OASIS
 *   - Atlas
 *   - Research Dashboards
 *   - Species Mapping
 *   - Climate Comparison
 *   - Conservation Tools
 *   - Orchid Collections
 *
 * No invented acronyms, no slogans, no philosophical metaphors. Each
 * card is a single declarative sentence describing what the system is
 * for, scientifically.
 *
 * OASIS is the canonical name for the Orchid Continuum ecological
 * and AI-assisted research and conservation system. Its existing
 * dashboard route is `/oacs`; we do not rebrand the route, only the
 * surface label.
 */

type System = {
  title: string;
  description: string;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
};

const SYSTEMS: System[] = [
  {
    title: 'OASIS',
    description:
      'The Orchid Continuum ecological and AI-assisted research and conservation system.',
    route: '/oacs',
    icon: Sparkles,
    accent: '#d4b34a',
  },
  {
    title: 'Atlas',
    description:
      'Geospatial maps of orchid occurrences, habitats, pollinators, and biodiversity patterns.',
    route: '/atlas',
    icon: Compass,
    accent: '#9ad6ff',
  },
  {
    title: 'Research Dashboards',
    description:
      'Working views into taxonomy, ecology, traits, and the literature behind every record.',
    route: '/research',
    icon: LineChart,
    accent: '#a78bff',
  },
  {
    title: 'Species Mapping',
    description:
      'Species-level distribution and habitat range across the breadth of Orchidaceae.',
    route: '/species',
    icon: MapPin,
    accent: '#7dd3a8',
  },
  {
    title: 'Climate Comparison',
    description:
      'Compare native-habitat climate envelopes against cultivation and reintroduction sites.',
    route: '/climate',
    icon: Thermometer,
    accent: '#fca5a5',
  },
  {
    title: 'Conservation Tools',
    description:
      'Threatened-species workflows, restoration protocols, and ecological stewardship.',
    route: '/conservation',
    icon: ShieldCheck,
    accent: '#ff8aa1',
  },
  {
    title: 'Orchid Collections',
    description:
      'Curated living and documented collections — your specimens, observations, and field notes.',
    route: '/collection',
    icon: Leaf,
    accent: '#c4a87a',
  },
];

const FeaturedSystems: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section
      id="featured-systems"
      className="relative bg-[#06091a] text-[#f5f0e8] border-t border-white/[0.06]"
    >
      {/* Quiet atmospheric wash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 12% 0%, rgba(40,86,68,0.14) 0%, transparent 55%),' +
            'radial-gradient(ellipse at 90% 100%, rgba(120,90,40,0.10) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-16 lg:py-20">
        {/* Section heading */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-3 font-mono text-[10px] tracking-[0.32em] uppercase text-[#c9a24a]">
            <span className="inline-block w-8 h-px bg-[#c9a24a]/60" />
            Tools across the three pillars
          </div>
          <h2
            className="mt-4 leading-[1.08] text-[#faf7f2]"
            style={{
              fontFamily:
                '"Playfair Display","Cormorant Garamond",Georgia,serif',
              fontWeight: 500,
              fontSize: 'clamp(1.8rem, 3.6vw, 2.8rem)',
            }}
          >
            Working systems that support the Conservatory, the Observatory, and Education.
          </h2>
          <p className="mt-4 max-w-2xl font-body text-[14px] md:text-[15px] leading-relaxed text-[#cfc8b8]/80">
            These are the everyday tools of the platform — independently
            deployable modules connected through OASIS. Together they link
            living collections, occurrence maps, ecological relationships,
            climate, and learning into one coherent scientific record.
          </p>
        </div>


        {/* Grid — 1 / 2 / 3 columns. Seven cards: 3-col layout leaves a
            harmonious last row of one centered card on xl. */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {SYSTEMS.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={() => navigate(s.route)}
              className="group relative text-left rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 backdrop-blur-md p-6 hover:border-white/25 hover:bg-[#0c1024]/80 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d4b34a]/60"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
                style={{
                  background: `${s.accent}1a`,
                  border: `1px solid ${s.accent}55`,
                }}
              >
                <s.icon className="h-4 w-4" style={{ color: s.accent }} />
              </div>

              <h3
                className="text-[#faf7f2] leading-tight"
                style={{
                  fontFamily:
                    '"Playfair Display","Cormorant Garamond",Georgia,serif',
                  fontSize: '1.35rem',
                }}
              >
                {s.title}
              </h3>

              <p className="font-body text-[13.5px] text-[#cfc8b8]/80 leading-relaxed mt-2.5">
                {s.description}
              </p>

              <div className="mt-5 font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a] inline-flex items-center gap-1.5 group-hover:text-[#deb866] transition-colors">
                Open
                <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>

              {/* accent underline */}
              <div
                className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-80 transition-opacity rounded-b-2xl"
                style={{
                  background: `linear-gradient(90deg, transparent, ${s.accent}, transparent)`,
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedSystems;
