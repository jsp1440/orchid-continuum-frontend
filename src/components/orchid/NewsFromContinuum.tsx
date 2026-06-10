import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Mail, Sparkles } from 'lucide-react';
import { BACKEND_BASE_URL } from '@/lib/backendConfig';

const DEFAULT_INTERESTS = ['Science', 'History', 'Conservation', 'Culture', 'Pollinators', 'Mycorrhizae'];
const OPTIONAL_INTERESTS = ['Imagination', 'Future Ideas', 'Speculative Biology'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NewsFromContinuum: React.FC = () => {
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<string[]>(DEFAULT_INTERESTS);
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  const toggle = (interest: string) => {
    setSelected((current) =>
      current.includes(interest)
        ? current.filter((x) => x !== interest)
        : [...current, interest],
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setState('error');
      return;
    }
    setState('submitting');
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/subscribers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: 'news_from_the_continuum_homepage',
          interests: selected,
          role: 'Continuum Subscriber',
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState('done');
    } catch {
      setState('error');
    }
  };

  return (
    <section id="news-from-the-continuum" className="relative overflow-hidden bg-[#0d1710] text-[#f5f0e8] border-t border-white/[0.06]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 18% 0%, rgba(212,179,74,0.18) 0%, transparent 58%),' +
            'radial-gradient(ellipse at 90% 90%, rgba(64,118,78,0.32) 0%, transparent 62%)',
        }}
      />
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-16 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-3 font-mono text-[12px] tracking-[0.32em] uppercase text-[#d4b34a]">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10">
                <Mail className="h-4 w-4" />
              </span>
              News from the Continuum
            </div>
            <h2
              className="mt-6 text-[#faf7f2] leading-[1.07]"
              style={{
                fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontSize: 'clamp(2rem, 4vw, 3.2rem)',
                fontWeight: 700,
              }}
            >
              Discover orchids, science, conservation, and stories from around the world.
            </h2>
            <p className="mt-5 text-[#e8dfcf] font-body max-w-2xl" style={{ fontSize: 18, lineHeight: 1.7 }}>
              Subscribe for highlights from the Orchid Continuum: featured genera,
              pollinator stories, mycorrhizal mysteries, conservation updates,
              and historical orchid stories.
            </p>
            <p className="mt-4 text-[#cfc8b8] font-body max-w-2xl" style={{ fontSize: 15, lineHeight: 1.65 }}>
              The default feed is factual: science, history, conservation, and culture.
              Imagination and future-oriented stories are optional.
            </p>
          </div>

          <div className="rounded-3xl border border-[#d4b34a]/20 bg-[#14251a]/85 p-6 lg:p-8 shadow-2xl shadow-black/25">
            {state === 'done' ? (
              <div className="min-h-[260px] flex flex-col items-center justify-center text-center">
                <CheckCircle2 className="h-12 w-12 text-[#d4b34a]" />
                <h3 className="mt-5 text-2xl text-[#faf7f2]" style={{ fontFamily: '"Playfair Display",Georgia,serif' }}>
                  You're subscribed.
                </h3>
                <p className="mt-3 text-[#e8dfcf] font-body" style={{ fontSize: 16, lineHeight: 1.65 }}>
                  News from the Continuum will bring the living orchid network back to your inbox.
                </p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <label className="font-mono text-[11px] tracking-[0.24em] uppercase text-[#d4b34a]">
                  Email address
                </label>
                <div className="mt-3 flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (state === 'error') setState('idle');
                    }}
                    placeholder="you@example.com"
                    className="flex-1 rounded-full border border-white/15 bg-[#09130c] px-5 py-3.5 text-[#faf7f2] placeholder:text-[#cfc8b8]/55 focus:outline-none focus:border-[#d4b34a]/70 font-body"
                  />
                  <button
                    type="submit"
                    disabled={state === 'submitting'}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d4b34a] px-6 py-3.5 font-mono text-[11px] tracking-[0.22em] uppercase font-semibold text-[#102015] hover:bg-[#e0c156] transition-colors disabled:opacity-60"
                  >
                    Subscribe
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
                {state === 'error' && (
                  <p className="mt-2 text-[13px] text-[#f0a37a] font-body">
                    Please enter a valid email address. If the signup endpoint is still being connected, try again after deploy.
                  </p>
                )}

                <div className="mt-7">
                  <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]">
                    Customize your feed
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[...DEFAULT_INTERESTS, ...OPTIONAL_INTERESTS].map((interest) => {
                      const active = selected.includes(interest);
                      const optional = OPTIONAL_INTERESTS.includes(interest);
                      return (
                        <button
                          type="button"
                          key={interest}
                          onClick={() => toggle(interest)}
                          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors ${
                            active
                              ? 'border-[#d4b34a]/70 bg-[#d4b34a]/15 text-[#f5e4a8]'
                              : 'border-white/10 bg-white/[0.03] text-[#cfc8b8] hover:border-[#d4b34a]/40'
                          }`}
                        >
                          {optional && <Sparkles className="h-3 w-3" />}
                          {interest}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default NewsFromContinuum;
