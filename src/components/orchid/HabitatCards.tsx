import React from 'react';
import { ArrowRight, CloudFog, Droplets, Leaf, Mountain, Trees, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';

type HabitatCard = {
  title: string;
  subtitle: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const HABITATS: HabitatCard[] = [
  {
    title: 'Cloud forests',
    subtitle: 'Fog, moss, epiphytes',
    description:
      'Cool, mist-laden forests where orchids live on branches, trunks, moss mats, and shaded slopes. These habitats are ideal for linking elevation, fog, host substrate, and mycorrhizal evidence.',
    href: '/habitats/cloud-forest',
    icon: CloudFog,
  },
  {
    title: 'Tropical rainforests',
    subtitle: 'Canopy communities',
    description:
      'Layered tropical forests where orchids share space with trees, ants, fungi, pollinators, birds, and neighboring epiphytes. The Continuum can turn these records into relationship neighborhoods.',
    href: '/habitats/tropical-rainforest',
    icon: Trees,
  },
  {
    title: 'Montane ridges',
    subtitle: 'Elevation and endemism',
    description:
      'Mountain ridges and valleys often isolate orchid populations. Elevation bands help explain narrow endemism, local adaptation, pollinator shifts, and conservation vulnerability.',
    href: '/habitats/montane-forest',
    icon: Mountain,
  },
  {
    title: 'Wetlands and seeps',
    subtitle: 'Water-shaped niches',
    description:
      'Terrestrial orchids in bogs, seeps, wet meadows, and seasonal wetlands depend on hydrology, soil chemistry, fungal partners, and disturbance regimes that can be mapped and monitored.',
    href: '/habitats/wetland',
    icon: Droplets,
  },
  {
    title: 'Dry forests',
    subtitle: 'Seasonality and dormancy',
    description:
      'Many orchids survive dry seasons through pseudobulbs, deciduous growth, or seasonal roots. Habitat cards can connect climate rhythm, flowering time, and pollinator availability.',
    href: '/habitats/dry-forest',
    icon: Leaf,
  },
  {
    title: 'Coastal and island systems',
    subtitle: 'Isolation and salt air',
    description:
      'Island and coastal habitats reveal dispersal, isolation, storm exposure, and conservation pressure. These cards are a bridge between Atlas geography and species-level ecology.',
    href: '/habitats/coastal-island',
    icon: Waves,
  },
];

const HabitatCards: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-[#102d19] text-[#f5f0e8] border-t border-white/[0.06]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 15% 0%, rgba(201,162,74,0.10) 0%, rgba(16,45,25,0) 50%),' +
            'radial-gradient(ellipse at 85% 100%, rgba(52,211,153,0.07) 0%, rgba(16,45,25,0) 55%)',
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-16 lg:py-22">
        <div className="max-w-4xl mb-10">
          <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a] flex items-center gap-3">
            <span className="inline-block w-8 h-px bg-[#c9a24a]/55" />
            Habitat cards
          </div>
          <h2
            className="mt-4 leading-[1.02] text-[#faf7f2]"
            style={{
              fontFamily: "'Playfair Display', 'Cormorant Garamond', Georgia, serif",
              fontWeight: 500,
              fontSize: 'clamp(2rem, 4vw, 3.4rem)',
            }}
          >
            Every orchid belongs to a <span className="italic text-[#d4b34a]">living place.</span>
          </h2>
          <p className="mt-5 max-w-3xl text-[14px] md:text-[15px] leading-relaxed text-[#cfc8b8]/85 font-body">
            Habitat cards are restored as their own section so they can support the species-centered
            neighborhood engine without bringing back the old genus-community renderer. These cards
            connect orchids to climate, elevation, substrate, co-occurring species, pollinators, fungi,
            and conservation pressure.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {HABITATS.map((habitat) => {
            const Icon = habitat.icon;
            return (
              <Link
                key={habitat.title}
                to={habitat.href}
                className="group min-h-[260px] rounded-2xl border border-[#c9a24a]/20 bg-[#0b2414]/72 p-6 lg:p-7 transition-all duration-500 hover:border-[#c9a24a]/55 hover:bg-[#12361f]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="w-11 h-11 rounded-full border border-[#c9a24a]/35 bg-[#c9a24a]/8 flex items-center justify-center text-[#d4b34a]">
                    <Icon className="h-5 w-5" strokeWidth={1.4} />
                  </div>
                  <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-[#7d6a3a] border border-white/10 rounded-full px-2 py-1">
                    Habitat
                  </span>
                </div>

                <div className="mt-8">
                  <div className="font-mono text-[9px] tracking-[0.24em] uppercase text-[#c9a24a]/80">
                    {habitat.subtitle}
                  </div>
                  <h3
                    className="mt-3 text-[#faf7f2] leading-tight"
                    style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.55rem' }}
                  >
                    {habitat.title}
                  </h3>
                  <p className="mt-4 text-[13px] leading-relaxed text-[#cfc8b8]/80 font-body">
                    {habitat.description}
                  </p>
                </div>

                <div className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a] group-hover:text-[#f2cf62]">
                  Open habitat
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HabitatCards;
