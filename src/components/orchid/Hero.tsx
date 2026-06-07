import React, { useEffect, useState } from 'react';
import { ArrowRight, Compass, Building2, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { speciesApi, type ApiMetrics } from '@/lib/api';
import BotanicalLineArt from './BotanicalLineArt';

/**
 * Editorial homepage hero — botanical research observatory.
 *
 * Soft cream background, faint botanical line-art watermark, large
 * Playfair Display headline, a forest-green italic pull quote that names
 * the platform's mission, and three CTAs. The right side carries an
 * elegant orchid line illustration in the Smithsonian / natural-history
 * journal tradition.
 */
const Hero: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [metricsState, setMetricsState] = useState<'loading' | 'live' | 'fallback'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    speciesApi.metrics(controller.signal).then(r => {
      if (controller.signal.aborted) return;
      if (r.data) {
        setMetrics(r.data);
        setMetricsState('live');
      } else {
        setMetricsState('fallback');
      }
    });
    return () => controller.abort();
  }, []);

  const scrollTo = (id: string) => {
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative overflow-hidden bg-cream">
      {/* Faint botanical watermark */}
      <div className="pointer-events-none absolute -right-32 top-10 w-[720px] opacity-[0.05]">
        <BotanicalLineArt variant="watermark" stroke="#1f3d2b" strokeWidth={0.9} className="w-full h-auto" />
      </div>
      <div className="pointer-events-none absolute left-0 top-0 w-full h-full botanical-grid-bg opacity-40" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pt-28 lg:pt-32 pb-20">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          {/* Left — editorial copy */}
          <div className="lg:col-span-7">
            <div className="label-eyebrow flex items-center gap-2">
              <span className="inline-block w-6 h-px bg-[#b8962a]" />
              Global Orchid Conservation Intelligence
            </div>

            <h1 className="mt-6 display-headline text-5xl sm:text-6xl lg:text-[5.25rem]">
              Every orchid has a story.<br />
              <span className="italic text-charcoal">Most have never been told.</span>
            </h1>

            <blockquote className="mt-10 pl-6 border-l-2 border-forest max-w-2xl pullquote text-xl sm:text-2xl">
              We are building the only integrated system that connects orchid
              taxonomy, occurrence data, reintroduction protocols extracted
              from literature, and mycorrhizal fungal requirements — the
              three things that actually determine whether a reintroduction
              succeeds or fails.
            </blockquote>

            <div className="mt-10 flex flex-wrap gap-3">
              <button
                onClick={() => navigate('/species')}
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#1f3d2b] text-[#faf7f2] hover:bg-[#14281c] transition-all text-sm font-medium tracking-wide"
              >
                <Compass className="h-4 w-4" />
                <span>Explore Species</span>
                <ArrowRight className="h-4 w-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
              </button>
              <button
                onClick={() => navigate('/conservation')}
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-forest text-forest hover:bg-[#1f3d2b]/5 transition-all text-sm font-medium tracking-wide"
              >
                <Building2 className="h-4 w-4" />
                <span>Join as a Conservation Project</span>
              </button>
              <button
                onClick={() => navigate('/get-involved')}
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-gold text-gold hover:bg-[#b8962a]/8 transition-all text-sm font-medium tracking-wide"
              >
                <Heart className="h-4 w-4" />
                <span>Support the Continuum</span>
              </button>
            </div>

            <p className="mt-8 font-mono text-[10px] tracking-[0.22em] uppercase text-charcoal/55">
              {metricsState === 'live' && metrics?.last_updated
                ? `Live · synced ${new Date(metrics.last_updated).toLocaleString()}`
                : metricsState === 'live'
                ? 'Live · streaming from the Continuum API'
                : metricsState === 'loading'
                ? 'Connecting to the Continuum API…'
                : 'Data layer refreshing.'}
            </p>
          </div>

          {/* Right — botanical illustration */}
          <div className="lg:col-span-5 hidden lg:block">
            <div className="relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-[360px] h-[360px] rounded-full border border-[#b8962a]/40" />
                <div className="absolute w-[480px] h-[480px] rounded-full border border-[#b8962a]/15" />
              </div>
              <div className="relative orchid-drift">
                <BotanicalLineArt
                  variant="vampira"
                  stroke="#1f3d2b"
                  strokeWidth={1.15}
                  className="w-full h-auto max-w-md mx-auto"
                />
              </div>
              <div className="mt-6 text-center">
                <div className="font-display italic text-charcoal text-lg">Dracula vampira</div>
                <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-charcoal/55 mt-1">
                  Pichincha cloud forest · Ecuador
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quiet bottom border into next section */}
      <div className="relative z-10 border-t border-quiet" />
    </section>
  );
};

export default Hero;
