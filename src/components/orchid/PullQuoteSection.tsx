import React from 'react';
import BotanicalLineArt from './BotanicalLineArt';

/**
 * Editorial pull-quote section — the mycorrhizal partnership.
 *
 * Parchment background, ghost botanical watermark, centered italic
 * Playfair Display. Sits high in the homepage narrative to ground the
 * Continuum's reason for being in a single emotionally powerful image.
 */
const PullQuoteSection: React.FC = () => {
  return (
    <section className="relative bg-parchment overflow-hidden">
      <div className="pointer-events-none absolute -left-24 -top-16 w-[420px] opacity-[0.06]">
        <BotanicalLineArt variant="ophrys" stroke="#1f3d2b" className="w-full h-auto" />
      </div>
      <div className="pointer-events-none absolute -right-24 -bottom-16 w-[420px] opacity-[0.06] rotate-180">
        <BotanicalLineArt variant="ophrys" stroke="#1f3d2b" className="w-full h-auto" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-10 py-24 lg:py-32 text-center">
        <div className="label-eyebrow">The Mycorrhizal Partnership</div>

        <blockquote className="mt-8">
          <p
            className="font-display italic text-3xl sm:text-4xl lg:text-[2.75rem] leading-[1.25] text-ink"
            style={{ fontWeight: 400 }}
          >
            “An orchid seed has no food. No roots. No way to feed itself.
            It survives only by finding the exact right fungus in the soil
            <span className="text-gold"> — a partnership 80 million years
            in the making.</span> We are mapping those partnerships.”
          </p>
        </blockquote>

        <div className="mt-10 inline-flex items-center gap-3">
          <span className="block w-10 h-px bg-[#b8962a]" />
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-charcoal/70">
            Orchid Continuum · 2026
          </span>
          <span className="block w-10 h-px bg-[#b8962a]" />
        </div>
      </div>
    </section>
  );
};

export default PullQuoteSection;
