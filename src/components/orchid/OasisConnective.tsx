import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowUpRight } from 'lucide-react';

/**
 * OasisConnective — a single horizontal band that situates OASIS as the
 * intelligent connective system supporting the three pillars
 * (Conservatory, Observatory, Education), rather than as a fourth pillar
 * or replacement for any of them.
 *
 * OASIS = the Orchid Continuum ecological and AI-assisted research and
 * conservation system. Do not rebrand. Do not invent acronyms.
 */
const OasisConnective: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section
      id="oasis"
      className="relative bg-[#070a14] text-[#f5f0e8] border-t border-white/[0.06]"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(212,179,74,0.10) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-14 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Identifier + icon */}
          <div className="lg:col-span-4 flex items-center gap-5">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: 'rgba(212,179,74,0.10)',
                border: '1px solid rgba(212,179,74,0.45)',
              }}
            >
              <Sparkles className="h-5 w-5 text-[#d4b34a]" />
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-[0.32em] uppercase text-[#c9a24a]">
                Connective Intelligence
              </div>
              <div
                className="mt-1 text-[#faf7f2]"
                style={{
                  fontFamily:
                    '"Playfair Display","Cormorant Garamond",Georgia,serif',
                  fontSize: 'clamp(1.8rem, 2.6vw, 2.2rem)',
                  fontWeight: 500,
                  letterSpacing: '0.01em',
                }}
              >
                OASIS
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="lg:col-span-6">
            <p className="font-body text-[15px] md:text-[16px] leading-relaxed text-[#e7dfd1]/90">
              OASIS is the Orchid Continuum ecological and AI-assisted
              research and conservation system — the connective layer that
              links the{' '}
              <span className="text-[#faf7f2]">Conservatory</span>,{' '}
              <span className="text-[#faf7f2]">Observatory</span>, and{' '}
              <span className="text-[#faf7f2]">Education</span>. It supports
              every pillar without replacing any of them, weaving cultivation
              records, occurrence data, ecological relationships, and
              learning materials into one coherent scientific record.
            </p>
          </div>

          {/* CTA */}
          <div className="lg:col-span-2 flex lg:justify-end">
            <button
              type="button"
              onClick={() => navigate('/oacs')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-[#d4b34a]/50 bg-[#d4b34a]/[0.08] text-[#faf7f2] hover:bg-[#d4b34a]/[0.18] hover:border-[#d4b34a] font-mono text-[11px] tracking-[0.22em] uppercase transition-colors"
            >
              Explore OASIS
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OasisConnective;
