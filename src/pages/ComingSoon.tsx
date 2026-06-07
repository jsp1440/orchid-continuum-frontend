import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';

/**
 * ComingSoon
 * ----------
 * One reusable "Coming Soon" template used for every unfinished or
 * off-domain internal destination found in the main navigation and
 * footer. The section is selected via the `/coming-soon/:section`
 * route parameter (with a default fallback).
 *
 * Design system (matches the homepage exactly):
 *   forest green  #1a2e1a   hero ground
 *   parchment     #f5f0e8   headings + body
 *   gold          #C9A84C   labels + CTA
 *   navy          #0d2535   "stay connected" band
 *   body text     >= 17px, line-height 1.75
 *   headings      >= 32px, font-weight 700
 *
 * No AI-generated imagery is used on this page.
 */

const FOREST = '#1a2e1a';
const PARCHMENT = '#f5f0e8';
const GOLD = '#C9A84C';
const NAVY = '#0d2535';

interface SectionCopy {
  name: string;
  description: string;
}

const GENERIC =
  'This section of the Orchid Continuum is currently under development — coming soon.';

const SECTIONS: Record<string, SectionCopy> = {
  conservatory: {
    name: 'The Orchid Conservatory',
    description:
      'A personal collection management app with OASIS intelligence behind every care recommendation — coming soon.',
  },
  research: {
    name: 'Research Center / Field Station',
    description:
      'A federated research workspace for conservation programs worldwide — coming soon.',
  },
  university: {
    name: 'Orchid University',
    description:
      'Open educational pathways built directly on the knowledge graph, from first bloom to field botany — coming soon.',
  },
  oasis: {
    name: 'OASIS',
    description:
      'The Orchid Adaptive Sensing and Intelligence System — connective layer linking cultivation, ecology, and conservation data — coming soon.',
  },
  partners: {
    name: 'Partners',
    description:
      'Meet the people and organizations who make the Orchid Continuum possible — coming soon.',
  },
};

const ComingSoon: React.FC = () => {
  const { section } = useParams<{ section: string }>();
  const copy: SectionCopy =
    (section && SECTIONS[section.toLowerCase()]) || {
      name: 'Coming Soon',
      description: GENERIC,
    };

  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/.+@.+\..+/.test(email)) {
      setError('Please enter a valid email.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await fetch('/api/crm/69fa6c8ae577acf1894f7208/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: `orchid-continuum-coming-soon:${copy.name}`,
        }),
      });
    } catch {
      /* non-blocking — still confirm + open mailto below */
    }

    // Notify the team via the canonical Orchid Continuum inbox.
    const subject = encodeURIComponent(
      `Orchid Continuum — Notify Me: ${copy.name}`,
    );
    const body = encodeURIComponent(`Please notify me when ${copy.name} opens.\n\nEmail: ${email}`);
    window.location.href = `mailto:info@orchidcontinuum.org?subject=${subject}&body=${body}`;

    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: FOREST }}>
      <style>{`
        .cs-serif { font-family: 'Cormorant Garamond', 'Playfair Display', Georgia, serif; }
      `}</style>

      {/* HEADER — standard navigation */}
      <Navbar />

      {/* HERO */}
      <main className="flex-1 pt-24">
        <section
          className="relative overflow-hidden"
          style={{ backgroundColor: FOREST }}
        >
          <div className="max-w-4xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
            <Link
              to="/"
              className="inline-flex items-center gap-2 mb-10 transition-colors hover:opacity-80"
              style={{ color: GOLD, fontSize: '13px', letterSpacing: '0.05em' }}
            >
              <ArrowLeft className="h-4 w-4" /> Return to the Continuum
            </Link>

            <div
              className="font-mono"
              style={{
                color: GOLD,
                fontSize: '12px',
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                fontVariant: 'small-caps',
              }}
            >
              Orchid Continuum
            </div>

            <h1
              className="cs-serif mt-5"
              style={{
                color: PARCHMENT,
                fontSize: '52px',
                fontWeight: 700,
                lineHeight: 1.1,
              }}
            >
              {copy.name}
            </h1>

            <p
              className="mt-7 max-w-2xl"
              style={{ color: PARCHMENT, fontSize: '18px', lineHeight: 1.75 }}
            >
              {copy.description}
            </p>
          </div>
        </section>

        {/* STAY CONNECTED */}
        <section style={{ backgroundColor: NAVY }}>
          <div className="max-w-3xl mx-auto px-6 lg:px-10 py-20 text-center">
            <div
              className="font-mono"
              style={{
                color: GOLD,
                fontSize: '11px',
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
              }}
            >
              Stay Connected
            </div>

            <h2
              className="cs-serif mt-5"
              style={{
                color: PARCHMENT,
                fontSize: '34px',
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              Be the first to know when this section opens.
            </h2>

            <form onSubmit={handleSubmit} className="mt-10 max-w-xl mx-auto">
              {!submitted ? (
                <>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.org"
                      aria-label="Email address"
                      className="flex-1 rounded-full px-5 py-3.5 focus:outline-none"
                      style={{
                        backgroundColor: 'rgba(245,240,232,0.06)',
                        border: '1px solid rgba(201,168,76,0.4)',
                        color: PARCHMENT,
                        fontSize: '17px',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{
                        backgroundColor: GOLD,
                        color: FOREST,
                        fontWeight: 700,
                        fontSize: '12px',
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Notify Me <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  {error && (
                    <div
                      className="mt-3"
                      style={{ color: '#e8b4a8', fontSize: '15px' }}
                    >
                      {error}
                    </div>
                  )}
                </>
              ) : (
                <div
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3.5"
                  style={{
                    border: `1px solid ${GOLD}`,
                    color: PARCHMENT,
                    fontSize: '17px',
                  }}
                >
                  <Check className="h-5 w-5" style={{ color: GOLD }} />
                  You're on the list.
                </div>
              )}
            </form>
          </div>
        </section>
      </main>

      {/* FOOTER — standard footer */}
      <Footer />
    </div>
  );
};

export default ComingSoon;
