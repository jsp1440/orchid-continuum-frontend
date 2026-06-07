import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Navbar from './Navbar';
import Footer from './Footer';
import { FEATURES } from '@/lib/api';

/**
 * Shared page shell for every Orchid Continuum sub-route.
 *
 * Preserves the dark botanical aesthetic, top navigation, and footer used
 * on the homepage so that every module reads as one cohesive platform.
 *
 * Children are wrapped in a max-width container with consistent padding
 * and the standard hero block (eyebrow + title + intro). Pages can opt
 * out of the hero by passing `hero={false}` and providing their own.
 */
export interface PageShellProps {
  /** Tiny tracking-wide eyebrow above the page title. */
  eyebrow?: string;
  /** Main page title (rendered in serif). */
  title?: React.ReactNode;
  /** Optional emphasized italic continuation of the title. */
  titleAccent?: React.ReactNode;
  /** Lead paragraph beneath the title. */
  intro?: React.ReactNode;
  /** Right-aligned hero meta (badges, CTAs). */
  heroAside?: React.ReactNode;
  /** Whether to render the standard hero block. Default true. */
  hero?: boolean;
  /** When true, shows a small demo-mode banner if API is unconfigured. */
  showDemoBanner?: boolean;
  /** Feature flag — if set and false, render a "module disabled" notice. */
  requireFeature?: keyof typeof FEATURES;
  children: React.ReactNode;
}

const PageShell: React.FC<PageShellProps> = ({
  eyebrow,
  title,
  titleAccent,
  intro,
  heroAside,
  hero = true,
  showDemoBanner = true,
  requireFeature,
  children,
}) => {
  const featureDisabled =
    requireFeature !== undefined && FEATURES[requireFeature] === false;

  return (
    <div
      className="min-h-screen bg-[#0d1f17] text-white antialiased"
      style={{ fontFamily: '"Inter", system-ui, -apple-system, sans-serif' }}
    >
      <style>{`
        .font-serif { font-family: 'Cormorant Garamond', 'Playfair Display', Georgia, serif; font-weight: 500; letter-spacing: -0.01em; }
        html { scroll-behavior: smooth; }
      `}</style>
      <Navbar />

      <main className="pt-24">
        {hero && (
          <section className="relative overflow-hidden border-b border-white/5">
            <div className="absolute inset-0 opacity-25 pointer-events-none">
              <div className="absolute top-1/4 left-10 w-96 h-96 rounded-full bg-emerald-400/20 blur-3xl" />
              <div className="absolute bottom-1/4 right-10 w-96 h-96 rounded-full bg-emerald-200/10 blur-3xl" />
            </div>
            <div className="relative max-w-7xl mx-auto px-6 lg:px-10 py-16">
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-emerald-200 transition-colors mb-8"
              >
                <ArrowLeft className="h-4 w-4" /> Return to Continuum
              </Link>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
                <div className="lg:col-span-8">
                  {eyebrow && (
                    <div className="text-xs tracking-[0.3em] uppercase text-emerald-200/80 mb-4">
                      {eyebrow}
                    </div>
                  )}
                  {title && (
                    <h1 className="font-serif text-4xl md:text-6xl leading-[1.05] max-w-4xl">
                      {title}
                      {titleAccent && (
                        <>
                          <br />
                          <span className="italic text-emerald-200/95">
                            {titleAccent}
                          </span>
                        </>
                      )}
                    </h1>
                  )}
                  {intro && (
                    <p className="text-base md:text-lg text-white/70 mt-6 max-w-2xl leading-relaxed font-light">
                      {intro}
                    </p>
                  )}
                </div>
                {heroAside && (
                  <div className="lg:col-span-4">{heroAside}</div>
                )}
              </div>

              {showDemoBanner && (
                <div className="mt-10 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-300/40 bg-amber-300/10 text-[10px] tracking-[0.2em] uppercase text-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
                  Live data · Orchid Continuum + GBIF
                </div>
              )}
            </div>
          </section>
        )}

        {featureDisabled ? (
          <section className="py-24">
            <div className="max-w-3xl mx-auto px-6 text-center">
              <div className="text-xs tracking-[0.3em] uppercase text-emerald-200/70 mb-4">
                Module disabled
              </div>
              <h2 className="font-serif text-3xl md:text-4xl mb-4">
                This module is turned off for this deployment.
              </h2>
              <p className="text-sm text-white/60">
                Enable it by setting the corresponding{' '}
                <code className="text-emerald-200">VITE_ENABLE_*</code>{' '}
                feature flag and redeploying.
              </p>
            </div>
          </section>
        ) : (
          children
        )}
      </main>

      <Footer />
    </div>
  );
};

export default PageShell;
