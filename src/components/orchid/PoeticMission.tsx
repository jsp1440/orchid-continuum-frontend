import React from 'react';
import BotanicalLineArt from './BotanicalLineArt';

/**
 * Short poetic mission statement that sits between the Globe hero and the
 * portal grid. Quiet, parchment background — a single editorial breath
 * before the reader chooses where to go next.
 */
const PoeticMission: React.FC = () => {
  return (
    <section className="relative bg-[#f5efe2] text-[#1a2a1c] overflow-hidden">
      <div className="pointer-events-none absolute -left-24 top-1/2 -translate-y-1/2 w-[420px] opacity-[0.07]">
        <BotanicalLineArt variant="watermark" stroke="#2f4a32" strokeWidth={0.9} className="w-full h-auto" />
      </div>
      <div className="pointer-events-none absolute -right-24 -bottom-12 w-[360px] opacity-[0.05] rotate-180">
        <BotanicalLineArt variant="watermark" stroke="#2f4a32" strokeWidth={0.9} className="w-full h-auto" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 py-20 lg:py-28 text-center">
        <div className="font-mono text-[10px] tracking-[0.32em] uppercase text-[#7a5b1f]">
          The Continuum
        </div>
        <p className="font-display italic text-2xl md:text-[2rem] lg:text-[2.3rem] leading-[1.35] mt-6 text-[#1a2a1c]">
          Orchids are not decoration. They are the planet&apos;s most precise
          witnesses — to forests, to fungi, to climate, to time.
        </p>
        <p className="font-body text-[16px] md:text-[17px] leading-relaxed text-[#3a4a3c] mt-7 max-w-2xl mx-auto">
          The Orchid Continuum gathers what is scattered — herbarium sheets,
          greenhouse notes, field photographs, mycorrhizal sequences,
          pollinator records — and turns them back into one living record
          of orchid life on Earth.
        </p>
      </div>
    </section>
  );
};

export default PoeticMission;
