import React from 'react';
import { Github, Twitter, Mail, ExternalLink } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import BotanicalLineArt from './BotanicalLineArt';

type Item = { label: string; route?: string; anchor?: string; external?: string };

const Footer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const onHome = location.pathname === '/';

  const go = (it: Item) => {
    if (it.external) {
      window.open(it.external, '_blank', 'noopener,noreferrer');
      return;
    }
    if (it.route) { navigate(it.route); return; }
    if (it.anchor) {
      if (!onHome) navigate('/' + it.anchor);
      else document.querySelector(it.anchor)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const cols: { title: string; items: Item[] }[] = [
    {
      title: 'Explore',
      items: [
        { label: 'Featured Genus', anchor: '#species-in-focus' },
        { label: 'Knowledge Graph', anchor: '#the-knowledge-graph' },
        { label: 'Ask Calyx', anchor: '#ask-calyx' },
        { label: 'Atlas', route: '/atlas' },
      ],
    },
    {
      title: 'Research Center',
      items: [
        { label: 'Research Center', route: '/research' },
        { label: 'Pollinators', route: '/pollinators' },
        { label: 'Mycorrhizal fungi', route: '/mycorrhizae' },
        { label: 'Climate Comparison', route: '/climate' },
        { label: 'Species Mapping', route: '/species' },
      ],
    },
    {
      title: 'Learn',
      items: [
        { label: 'Orchid University', route: '/university' },
        { label: 'Glossary', route: '/university' },
        { label: 'Classroom', route: '/classroom' },
        { label: 'Species care', route: '/species' },
      ],
    },
    {
      title: 'Institution',
      items: [
        { label: 'Partners', route: '/partners' },
        { label: 'Get involved', route: '/get-involved' },
        { label: 'Mission Control', route: '/mission-control' },
        { label: 'Governance', route: '/mission-control' },
        { label: 'Data sources', anchor: '#the-knowledge-graph' },
      ],
    },
  ];


  return (
    <footer className="relative bg-ink text-[#f5f0e8] overflow-hidden">
      <div className="pointer-events-none absolute -right-32 -top-16 w-[520px] opacity-[0.06]">
        <BotanicalLineArt variant="watermark" stroke="#d4b34a" strokeWidth={0.9} className="w-full h-auto" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          <div className="md:col-span-4">
            <Link to="/" className="flex items-center gap-2 text-[#faf7f2]">
              <span className="font-display text-xl tracking-wide">
                Orchid <span className="italic text-gold-soft">Continuum</span>
              </span>
            </Link>

            <p className="font-body text-[15px] text-[#e7dfd1]/85 mt-5 max-w-sm leading-relaxed">
              An independent biodiversity intelligence and orchid
              conservation infrastructure initiative — connecting taxonomy,
              ecology, cultivation, education, and recovery into one living record.
            </p>

            <div className="mt-6 rounded-2xl border border-[#d4b34a]/18 bg-white/[0.045] p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold-soft">For returning explorers</div>
              <p className="mt-2 text-sm leading-6 text-[#e7dfd1]/76">
                Mission Control, governance, data sources, partners, the Research Center, and Orchid University are always available here without crowding the public tour.
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              {[
                { Icon: Twitter, label: 'Twitter' },
                { Icon: Github,  label: 'GitHub' },
                { Icon: Mail,    label: 'Email' },
              ].map(({ Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => go({ label, route: '/get-involved' })}
                  aria-label={label}
                  className="w-9 h-9 rounded-full border border-[#d4b34a]/30 flex items-center justify-center text-[#e7dfd1]/80 hover:border-[#d4b34a]/80 hover:text-[#d4b34a] transition-colors"
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => go({ label: 'Support the Continuum', anchor: '#human-stewardship' })}
              className="inline-block mt-6 font-mono text-[11px] tracking-[0.2em] uppercase px-5 py-2.5 rounded-full bg-[#d4b34a] text-[#14281c] hover:bg-[#b8962a] transition-colors"
            >
              Support the Continuum
            </button>
          </div>

          {cols.map(c => (
            <div key={c.title} className="md:col-span-2">
              <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold-soft mb-5">
                {c.title}
              </div>
              <ul className="space-y-3">
                {c.items.map(it => (
                  <li key={it.label}>
                    <button
                      onClick={() => go(it)}
                      className="font-body text-[14px] text-[#e7dfd1]/85 hover:text-[#d4b34a] transition-colors text-left"
                    >
                      {it.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-10 border-t border-[#d4b34a]/20">
          <div className="grid md:grid-cols-12 gap-10">
            <div className="md:col-span-7">
              <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold-soft">
                Stewardship
              </div>
              <p className="font-body text-[15px] text-[#e7dfd1]/90 mt-3 leading-relaxed max-w-2xl">
                Orchid Continuum is an independent biodiversity intelligence
                initiative — a community-oriented, federated infrastructure for
                orchid science and conservation, fiscally sponsored by{' '}
                <a
                  href="https://www.ecologistics.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-soft hover:text-[#faf7f2] underline-offset-2 hover:underline inline-flex items-center gap-1"
                >
                  Ecologistics
                  <ExternalLink className="h-3 w-3" />
                </a>
                , a 501(c)(3) tax-exempt non-profit corporation. All
                charitable contributions are tax-deductible to the fullest
                extent allowed by law.
              </p>

            </div>

            <div className="md:col-span-5">
              <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold-soft">
                Fiscal sponsor
              </div>
              <a
                href="https://www.ecologistics.org"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block font-display text-2xl text-[#faf7f2] hover:text-gold-soft transition-colors"
              >
                Ecologistics<span className="text-gold-soft align-super text-sm">®</span>
              </a>
              <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-[#e7dfd1]/65 mt-1">
                ecologistics.org · 501(c)(3)
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-[#d4b34a]/15 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#e7dfd1]/55">
            © {new Date().getFullYear()} Orchid Continuum · Open knowledge for living systems
          </div>
          <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#e7dfd1]/55">
            Fiscally sponsored by Ecologistics — ecologistics.org
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
