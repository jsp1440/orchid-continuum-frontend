import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, AlertTriangle, MapPin } from 'lucide-react';
import BotanicalLineArt from './BotanicalLineArt';

/**
 * ConservationStory — a single real species and the web of pressures it faces.
 *
 * Narrative, not dashboard. We follow one orchid (Dracula vampira of the
 * Pichincha cloud forest) and show that its survival is bound to fungi,
 * a pollinator, a climate band, and a shrinking forest — making the stakes
 * of conservation concrete and emotional rather than statistical.
 */

const PRESSURES = [
  {
    label: 'Habitat loss',
    text: 'Cloud forest on the western slopes of Pichincha is cleared for pasture and roads, fragmenting the moss-laden branches it grows on.',
  },
  {
    label: 'A warming band',
    text: 'It survives only in a narrow cool, wet elevation band. As temperatures rise, that band creeps upslope — until there is no slope left.',
  },
  {
    label: 'A hidden partner',
    text: 'Its seeds cannot germinate without the right mycorrhizal fungus. Disturb the soil, and the next generation never begins.',
  },
];

const ConservationStory: React.FC = () => {
  const navigate = useNavigate();
  return (
    <section className="relative bg-[#1a2e1a] text-[#f5f0e8] border-b border-white/[0.06] overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 80% 20%, rgba(120,60,40,0.16) 0%, transparent 55%)',
        }}
      />
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-20 lg:py-28">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* Species portrait */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl border border-[#d4b34a]/20 bg-[#16271a] p-8 lg:p-10">
              <div className="absolute top-5 left-5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#8a3a2a] text-[#f5f0e8] font-mono text-[9px] tracking-[0.2em] uppercase">
                <AlertTriangle className="h-3 w-3" />
                Endangered
              </div>
              <BotanicalLineArt
                variant="vampira"
                stroke="#d4b34a"
                strokeWidth={1.2}
                className="w-full h-auto max-w-xs mx-auto"
              />
              <div className="mt-6 text-center">
                <div
                  className="italic text-[#faf7f2] text-2xl"
                  style={{
                    fontFamily:
                      '"Playfair Display","Cormorant Garamond",Georgia,serif',
                  }}
                >
                  Dracula vampira
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] uppercase text-[#7a7466]">
                  <MapPin className="h-3 w-3" />
                  Pichincha cloud forest · Ecuador
                </div>
              </div>
            </div>
          </div>

          {/* Story */}
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-3 font-mono text-[10px] tracking-[0.32em] uppercase text-[#c9a24a]">
              <span className="inline-block w-8 h-px bg-[#c9a24a]/60" />
              A conservation story
            </div>
            <h2
              className="mt-6 text-[#faf7f2] leading-[1.08]"
              style={{
                fontFamily:
                  '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontSize: 'clamp(1.9rem, 3.8vw, 3rem)',
                fontWeight: 500,
              }}
            >
              The orchid that looks like a{' '}
              <span className="italic text-[#d4b34a]">face in the mist</span>.
            </h2>
            <p className="mt-5 max-w-2xl text-[#cfc8b8]/85 font-body text-[15px] md:text-[17px] leading-relaxed">
              High on the dripping slopes of Volcán Pichincha grows an orchid
              whose dark, ghostly blooms gave it the name <em>vampira</em>. It
              has lived in this cool, cloud-soaked band of forest for ages — but
              its survival now hangs on a thread, and not one thread alone.
            </p>

            <div className="mt-8 space-y-4">
              {PRESSURES.map((p) => (
                <div
                  key={p.label}
                  className="flex gap-4 rounded-xl border border-white/[0.06] bg-[#16271a]/60 p-4"
                >
                  <div className="mt-1 h-2 w-2 rounded-full bg-[#c97a4a] shrink-0" />
                  <div>
                    <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#e3b07a]">
                      {p.label}
                    </div>
                    <p className="mt-1 text-[#cfc8b8]/80 font-body text-[14px] leading-relaxed">
                      {p.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/conservation')}
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#d4b34a] text-[#14281c] hover:bg-[#e6c763] transition-colors font-mono text-[11px] tracking-[0.22em] uppercase"
              >
                Follow the conservation work
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ConservationStory;
