import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

/**
 * A single brief "Why it matters" section.
 * Three numbers + a single closing line, set against habitat imagery.
 */
const WhyItMatters: React.FC = () => {
  const navigate = useNavigate();

  const facts = [
    { n: '28,000+', label: 'Accepted orchid species', sub: 'roughly 1 in 10 of all flowering plants' },
    { n: '~56%',    label: 'Pollinator-specialised', sub: 'often a single insect, bat or bird' },
    { n: '1 in 3',  label: 'Threatened with extinction', sub: 'IUCN-assessed orchid species' },
  ];

  return (
    <section className="relative overflow-hidden bg-[#0a1310] text-[#f5f0e8]">
      {/* Habitat backdrop */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-25"
        style={{
          backgroundImage:
            'url(https://images.unsplash.com/photo-1448375240586-882707db888b?w=2000&q=80)',
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,19,16,0.95) 0%, rgba(10,19,16,0.7) 40%, rgba(10,19,16,0.95) 100%)',
        }}
        aria-hidden
      />

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-20 lg:py-28">
        <div className="max-w-2xl">
          <div className="font-mono text-[10px] tracking-[0.32em] uppercase text-[#d4b34a]">
            Why it matters
          </div>
          <h2 className="font-display text-3xl md:text-4xl lg:text-[2.6rem] leading-[1.1] mt-4 text-[#faf7f2]">
            Orchids are the canary in the canopy.
          </h2>
          <p className="font-body text-[16px] text-[#cfc8b8] mt-5 leading-relaxed">
            They depend on intact forests, specific pollinators, and
            invisible fungal partners. When those partnerships break,
            orchids vanish first — long before the rest of the system
            shows it.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
          {facts.map((f) => (
            <div key={f.label} className="border-t border-[#d4b34a]/25 pt-6">
              <div className="font-display text-5xl md:text-[3.4rem] text-[#d4b34a] leading-none">
                {f.n}
              </div>
              <div className="font-display text-lg text-[#faf7f2] mt-3">
                {f.label}
              </div>
              <div className="font-body text-[13.5px] text-[#cfc8b8]/85 mt-1.5 leading-relaxed">
                {f.sub}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate('/conservation')}
            className="font-mono text-[11px] tracking-[0.22em] uppercase px-6 py-3 rounded-full bg-[#d4b34a] text-[#14281c] hover:bg-[#e6c869] transition-colors inline-flex items-center gap-2"
          >
            Visit the Conservation Portal
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/get-involved')}
            className="font-mono text-[11px] tracking-[0.22em] uppercase px-6 py-3 rounded-full border border-[#d4b34a]/40 text-[#faf7f2] hover:border-[#d4b34a]/80 hover:text-[#d4b34a] transition-colors"
          >
            Get involved
          </button>
        </div>
      </div>
    </section>
  );
};

export default WhyItMatters;
