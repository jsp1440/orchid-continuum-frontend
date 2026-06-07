import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sprout, Map as MapIcon, GraduationCap } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';

/**
 * About — concise statement of what the Orchid Continuum is.
 * Scientific, conservation-centered; no slogans or invented acronyms.
 */

const PILLARS = [
  {
    icon: Sprout,
    title: 'Orchid Conservatory',
    body: 'Living orchid collections, cultivation records, conservation propagation, and species care.',
  },
  {
    icon: MapIcon,
    title: 'Orchid Observatory',
    body: 'The Atlas — maps, native ranges, occurrence data, habitats, pollinators, mycorrhizal fungi, and climate gradients.',
  },
  {
    icon: GraduationCap,
    title: 'Education',
    body: 'Orchid biology, conservation education, culture sheets, articles, lessons, and public learning resources.',
  },
];

const About: React.FC = () => {
  return (
    <div
      className="min-h-screen bg-[#04050d] text-[#f5f0e8]"
      style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      <style>{`
        .font-display { font-family: 'Playfair Display','Cormorant Garamond',Georgia,serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      `}</style>
      <Navbar />

      <main className="pt-28 pb-20">
        <section className="max-w-[900px] mx-auto px-6 lg:px-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] transition-colors mb-8"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Return to Continuum
          </Link>

          <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85 mb-3">
            About
          </div>
          <h1
            className="font-display leading-[0.95] tracking-[-0.012em]"
            style={{ fontSize: 'clamp(2rem, 4.5vw, 3.4rem)' }}
          >
            The Orchid <span className="italic text-[#c9a24a]">Continuum</span>
          </h1>
          <p className="mt-6 max-w-2xl font-body text-[16px] leading-relaxed text-[#cfc8b8]/85">
            The Orchid Continuum is a scientific and conservation-oriented
            platform dedicated to orchids and the ecological relationships that
            sustain them — pollinators, mycorrhizal fungi, habitats, and
            climate. It brings together living collections, occurrence data, and
            education to support research, conservation, and discovery.
          </p>
          <p className="mt-4 max-w-2xl font-body text-[15px] leading-relaxed text-[#cfc8b8]/75">
            Work is organised around three public pillars, with OASIS — the
            Orchid Continuum ecological and AI-assisted research and conservation
            system — serving as the connective layer that supports all three.
          </p>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-5">
            {PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-6"
                >
                  <Icon className="h-6 w-6 text-[#c9a24a] mb-4" />
                  <div className="font-display text-lg text-[#faf7f2]">
                    {p.title}
                  </div>
                  <p className="mt-2 font-body text-[13px] leading-relaxed text-[#cfc8b8]/75">
                    {p.body}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="mt-12 font-mono text-[10px] tracking-[0.24em] uppercase text-[#7a7466]">
            An independent biodiversity and conservation initiative · fiscally
            sponsored by Ecologistics, 501(c)(3).
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;
