import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Compass, Leaf, ShieldCheck } from 'lucide-react';
import BotanicalLineArt from './BotanicalLineArt';

/**
 * HomeHero — Orchid Continuum scientific landing hero.
 *
 * BUILD-036 keeps the museum / ecological-atlas aesthetic while making the
 * first screen explicitly grant-ready: beauty leads to discovery, discovery
 * leads to relationships, and relationships lead to stewardship.
 */

const HomeHero: React.FC = () => {
  const navigate = useNavigate();

  const scrollToWeb = () => {
    const el = document.getElementById('continuum-web');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToStory = () => {
    const el = document.getElementById('species-in-focus');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (

    <section className="relative overflow-hidden bg-[#1a2e1a] text-[#f5f0e8] border-b border-white/[0.06]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 14% 0%, rgba(54,102,72,0.35) 0%, transparent 55%),' +
            'radial-gradient(ellipse at 92% 100%, rgba(120,90,40,0.12) 0%, transparent 60%),' +
            'linear-gradient(180deg, #1f3622 0%, #16271a 100%)',
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
        style={{
          backgroundImage:
            'url("https://raw.githubusercontent.com/jsp1440/OrchidContinuumHarvester/main/attached_assets/orchid_continuum_logo.png")',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundSize: 'min(90%, 1100px)',
          opacity: 0.05,
        }}
      />

      <div
        className="pointer-events-none absolute -right-24 top-12 w-[640px] opacity-[0.07] hidden md:block"
        aria-hidden="true"
      >
        <BotanicalLineArt
          variant="vampira"
          stroke="#d4b34a"
          strokeWidth={1}
          className="w-full h-auto"
        />
      </div>


      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 pt-24 lg:pt-28 pb-14 lg:pb-16">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-8">
            <div className="inline-flex items-center gap-3 font-mono text-[10px] tracking-[0.32em] uppercase text-[#c9a24a]">
              <span className="inline-block w-8 h-px bg-[#c9a24a]/60" />
              Biodiversity · Relationships · Education · Conservation
            </div>

            <h1
              className="mt-7 text-[#faf7f2] leading-[1.0] tracking-[-0.012em]"
              style={{
                fontFamily:
                  '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontWeight: 500,
                fontSize: 'clamp(2.4rem, 5.4vw, 4.7rem)',
              }}
            >
              Discover the hidden relationships that connect orchids to the{' '}
              <span className="italic text-[#d4b34a]">living world</span>.
            </h1>

            <p
              className="mt-6 max-w-3xl text-[#e7dfd1]/90 leading-[1.4]"
              style={{
                fontFamily:
                  '"Cormorant Garamond","Playfair Display",Georgia,serif',
                fontSize: 'clamp(1.15rem, 1.7vw, 1.55rem)',
              }}
            >
              The Orchid Continuum connects orchids with pollinators, fungi,
              habitats, climate, images, maps, literature, education, and
              conservation action — so beauty becomes understanding, and
              understanding becomes stewardship.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={scrollToStory}
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#d4b34a] text-[#14281c] hover:bg-[#e6c763] transition-colors font-mono text-[11px] tracking-[0.22em] uppercase"
              >
                <Leaf className="h-4 w-4" />
                Follow today's orchid
                <ArrowRight className="h-4 w-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
              </button>
              <button
                type="button"
                onClick={scrollToWeb}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-[#d4b34a]/40 text-[#faf7f2] hover:bg-[#d4b34a]/10 hover:border-[#d4b34a] transition-colors font-mono text-[11px] tracking-[0.22em] uppercase"
              >
                <Compass className="h-4 w-4" />
                Explore the Continuum
              </button>
              <button
                type="button"
                onClick={() => navigate('/get-involved')}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-emerald-300/30 text-[#faf7f2] hover:bg-emerald-300/10 hover:border-emerald-300/60 transition-colors font-mono text-[11px] tracking-[0.22em] uppercase"
              >
                <ShieldCheck className="h-4 w-4" />
                Support conservation
              </button>
            </div>

            <p className="mt-8 font-mono text-[10px] tracking-[0.24em] uppercase text-[#7a7466]">
              An independent biodiversity and conservation initiative ·
              fiscally sponsored by Ecologistics, 501(c)(3).
            </p>
          </div>


          <div className="lg:col-span-4 hidden lg:block">
            <div className="relative">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[340px] h-[340px] rounded-full border border-[#d4b34a]/30" />
                <div className="absolute w-[440px] h-[440px] rounded-full border border-[#d4b34a]/10" />
              </div>
              <div className="relative flex items-center justify-center">
                <img
                  src="https://d64gsuwffb70l.cloudfront.net/685ce481a881cc69fa33814c_1780636186272_bb5ee54d.png"
                  alt="Orchid Continuum — The Global Orchid Experience"
                  className="w-full h-auto max-w-sm mx-auto drop-shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
                  loading="eager"
                />
              </div>
              <div className="mt-6 text-center">
                <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#7a7466]">
                  The Global Orchid Experience
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default HomeHero;
