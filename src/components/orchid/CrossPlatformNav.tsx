import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, Sprout, Tent, FlaskConical, ArrowUpRight } from 'lucide-react';

/**
 * CrossPlatformNav — pill-shaped links across the Orchid Continuum ecosystem.
 *
 * Sits directly below the hero, above the three pillars. The Atlas pill is an
 * internal route; the other three open sibling Continuum properties in new tabs.
 */

interface Pill {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  route?: string;
  href?: string;
}

const PILLS: Pill[] = [
  { label: 'Atlas', icon: Map, route: '/atlas' },
  {
    label: 'Conservatory',
    icon: Sprout,
    href: 'https://orchid-conservatory.lovable.app',
  },
  {
    label: 'Field Station',
    icon: Tent,
    href: 'https://orchid-field-station.lovable.app',
  },
  {
    label: 'Deception Lab',
    icon: FlaskConical,
    href: 'https://ocudeceptionlab.emergent.sh',
  },
];

const CrossPlatformNav: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="bg-[#04050d] border-b border-white/[0.06]">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#7a7466] shrink-0">
            Continuum platforms
          </span>
          <div className="flex flex-wrap gap-2.5">
            {PILLS.map((p) => {
              const Icon = p.icon;
              const cls =
                'group inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#d4b34a]/35 text-[#e7dfd1] hover:bg-[#d4b34a]/10 hover:border-[#d4b34a] transition-colors font-mono text-[11px] tracking-[0.18em] uppercase';
              if (p.href) {
                return (
                  <a
                    key={p.label}
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cls}
                  >
                    <Icon className="h-3.5 w-3.5 text-[#d4b34a]" />
                    {p.label}
                    <ArrowUpRight className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                  </a>
                );
              }
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => navigate(p.route!)}
                  className={cls}
                >
                  <Icon className="h-3.5 w-3.5 text-[#d4b34a]" />
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CrossPlatformNav;
