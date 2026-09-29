import React from 'react';
import { Link } from 'react-router-dom';
import {
  Compass,
  Sprout,
  GraduationCap,
  Presentation,
  Microscope,
  Trees,
  Users,
  ArrowUpRight,
} from 'lucide-react';

/**
 * EcosystemsBand
 * --------------
 * Cream-toned editorial band introducing the seven communities of practice.
 * Each card is treated as a museum specimen label — IBM Plex Mono index,
 * Playfair name, body description.
 */

type Item = {
  Icon: typeof Compass;
  index: string;
  label: string;
  blurb: string;
  route: string;
};

const items: Item[] = [
  { Icon: Compass,       index: 'I',   label: 'Public Explorer', blurb: 'Atlas, galleries, stories.',           route: '/explore' },
  { Icon: Sprout,        index: 'II',  label: 'Orchid Grower',   blurb: 'Living collection & OACS.',            route: '/collection' },
  { Icon: GraduationCap, index: 'III', label: 'Student',         blurb: 'Guided scientific inquiry.',           route: '/university' },
  { Icon: Presentation,  index: 'IV',  label: 'Teacher',         blurb: 'Classroom investigations.',            route: '/classroom' },
  { Icon: Microscope,    index: 'V',   label: 'Researcher',      blurb: 'Traits, networks, exports.',           route: '/research' },
  { Icon: Trees,         index: 'VI',  label: 'Conservation',    blurb: 'Project workspaces & protocols.',      route: '/conservation' },
  { Icon: Users,         index: 'VII', label: 'Orchid Society',  blurb: 'Events, members, judging.',            route: '/societies' },
];

const EcosystemsBand: React.FC = () => {
  return (
    <section id="ecosystems" className="bg-cream border-t border-quiet">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end mb-12">
          <div className="lg:col-span-8">
            <div className="label-eyebrow">Communities of practice</div>
            <h2 className="mt-6 font-display text-4xl lg:text-5xl leading-[1.08] text-ink max-w-3xl">
              One living platform,{' '}
              <span className="italic text-forest">seven ways to belong.</span>
            </h2>
            <div className="rule-gold" />
            <p className="mt-7 font-body text-base text-charcoal/85 max-w-2xl leading-relaxed">
              The Continuum is not built around a single user. It is built
              around the relationships between everyone who studies, grows,
              teaches, conserves, and celebrates orchids.
            </p>
          </div>
          <div className="lg:col-span-4 lg:text-right">
            <Link
              to="/ecosystems"
              className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] uppercase text-forest border border-forest hover:bg-[#1f3d2b]/5 rounded-full px-5 py-2.5 transition-colors"
            >
              Explore all seven
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {items.map(it => (
            <Link
              key={it.label}
              to={it.route}
              className="group rounded-sm border border-quiet bg-warm-white p-5 hover:border-[#1f3d2b]/40 hover:shadow-[0_12px_24px_-16px_rgba(28,26,23,0.18)] transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">{it.index}</span>
                <it.Icon className="h-4 w-4 text-forest" />
              </div>
              <div className="mt-5 font-display text-base text-ink leading-tight">
                {it.label}
              </div>
              <div className="mt-1 font-body text-[12px] text-charcoal/70 leading-snug">
                {it.blurb}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default EcosystemsBand;
