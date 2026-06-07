import React, { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import BotanicalLineArt from './BotanicalLineArt';

/**
 * Closing CTA · field updates signup.
 *
 * Parchment editorial section with botanical watermark. A single,
 * dignified invitation to receive field updates from the Continuum.
 * Email collection routes through the CRM subscribe endpoint per
 * platform standard.
 */
const Mission: React.FC = () => {
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
        body: JSON.stringify({ email, source: 'orchid-continuum-mission' }),
      });
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="mission" className="relative bg-parchment border-t border-quiet overflow-hidden">
      <div className="pointer-events-none absolute -left-20 top-1/2 -translate-y-1/2 w-[420px] opacity-[0.07]">
        <BotanicalLineArt variant="vampira" stroke="#1f3d2b" className="w-full h-auto" />
      </div>
      <div className="pointer-events-none absolute -right-20 top-1/2 -translate-y-1/2 w-[420px] opacity-[0.07] -scale-x-100">
        <BotanicalLineArt variant="vampira" stroke="#1f3d2b" className="w-full h-auto" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 py-24 lg:py-32 text-center">
        <div className="label-eyebrow">Field Updates</div>
        <h2 className="mt-6 font-display text-4xl lg:text-[3rem] leading-[1.08] text-ink">
          Stay close to <span className="italic text-forest">the work.</span>
        </h2>
        <div className="rule-gold-center" />
        <p className="font-body text-lg text-charcoal/85 mt-8 leading-relaxed max-w-2xl mx-auto">
          Quarterly notes from the platform — new species intelligence,
          conservation findings, institutional partnerships, and open
          invitations to participate.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 max-w-xl mx-auto">
          {!submitted ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="researcher@institution.org"
                className="flex-1 bg-warm-white border border-quiet rounded-full px-5 py-3 font-body text-sm text-ink placeholder:text-charcoal/40 focus:outline-none focus:border-forest"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#1f3d2b] text-[#faf7f2] hover:bg-[#14281c] transition-colors font-mono text-[11px] tracking-[0.2em] uppercase disabled:opacity-50"
              >
                {loading ? 'Joining…' : 'Join the Continuum'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[#1f3d2b]/8 border border-forest text-forest font-body text-sm">
              <Check className="h-4 w-4" /> Welcome — you're now part of the Continuum.
            </div>
          )}
          {error && <div className="font-body text-sm text-[#8b3a2a] mt-3">{error}</div>}
        </form>

        <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-charcoal/45 mt-6">
          Open knowledge · No tracking · Unsubscribe anytime
        </div>
      </div>
    </section>
  );
};

export default Mission;
