import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Microscope, BookOpenText, Tags, ClipboardList } from 'lucide-react';
import BotanicalLineArt from './BotanicalLineArt';

/**
 * Four primary research tools — surfaced from the broader Platform Systems.
 *
 * Editorial card grid on cream. Each card carries an IBM Plex Mono index,
 * a Playfair title, a one-sentence purpose, a corner botanical flourish,
 * and a "Open" affordance into the relevant route.
 */
type Tool = {
  index: string;
  icon: typeof Microscope;
  title: string;
  acronym?: string;
  blurb: string;
  cta: string;
  route: string;
};

const TOOLS: Tool[] = [
  {
    index: 'I',
    icon: Microscope,
    title: 'Species Intelligence',
    blurb:
      'A unified species profile for every orchid — taxonomy, habitat envelope, ecological partners, and the literature behind each record.',
    cta: 'Open species',
    route: '/species',
  },
  {
    index: 'II',
    icon: BookOpenText,
    title: 'AI Literature Search',
    blurb:
      'Ask in plain language. Returns reintroduction protocols, mycorrhizal pairings, and ecological notes parsed from the orchid literature.',
    cta: 'Search the corpus',
    route: '/research',
  },
  {
    index: 'III',
    icon: Tags,
    title: 'Name Resolver',
    blurb:
      'Reconcile synonyms, misspellings, and outdated combinations against the current accepted name across major taxonomic backbones.',
    cta: 'Resolve a name',
    route: '/species',
  },
  {
    index: 'IV',
    icon: ClipboardList,
    title: 'Conservation Project Registry',
    blurb:
      'A public registry of recovery work — institutions, target species, geography, protocols, and the partnerships behind every project.',
    cta: 'Browse the registry',
    route: '/conservation',
  },
];

const PlatformSystems: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section id="systems" className="relative bg-cream border-t border-quiet">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <header className="max-w-2xl">
          <div className="label-eyebrow">Research Tools</div>
          <h2 className="mt-6 font-display text-4xl lg:text-5xl leading-[1.08] text-ink">
            Four instruments<br />
            <span className="italic text-forest">for working with living orchid data.</span>
          </h2>
          <div className="rule-gold" />
          <p className="mt-7 font-body text-base text-charcoal/85 leading-relaxed">
            The Continuum surfaces dozens of interoperable systems. These four
            are the daily instruments — used by growers, students, teachers,
            researchers, and conservation organisations alike.
          </p>
        </header>

        <div className="mt-14 grid sm:grid-cols-2 gap-6">
          {TOOLS.map(t => {
            const Icon = t.icon;
            return (
              <article
                key={t.title}
                className="group relative bg-warm-white border border-quiet rounded-sm p-8 lg:p-9 hover:border-[#1f3d2b]/40 transition-all cursor-pointer overflow-hidden"
                onClick={() => navigate(t.route)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') navigate(t.route); }}
              >
                {/* corner flourish */}
                <div className="pointer-events-none absolute -top-2 -right-2 w-20 h-20 opacity-25">
                  <BotanicalLineArt variant="corner" stroke="#1f3d2b" className="w-full h-full" />
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.28em] uppercase text-gold">
                    Tool · {t.index}
                  </span>
                  <Icon className="h-5 w-5 text-forest" />
                </div>

                <h3 className="mt-7 font-display text-2xl lg:text-[1.75rem] text-ink leading-tight">
                  {t.title}
                </h3>

                <p className="mt-4 font-body text-[15px] text-charcoal/85 leading-relaxed">
                  {t.blurb}
                </p>

                <div className="mt-7 inline-flex items-center gap-2 text-forest text-sm font-medium tracking-wide">
                  <span>{t.cta}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <button
            onClick={() => navigate('/tools')}
            className="font-mono text-[11px] tracking-[0.25em] uppercase text-forest hover:text-gold transition-colors"
          >
            See all platform systems →
          </button>
        </div>
      </div>
    </section>
  );
};

export default PlatformSystems;
