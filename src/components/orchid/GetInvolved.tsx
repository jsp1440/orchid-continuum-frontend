import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PawPrint,
  Microscope,
  Boxes,
  ArrowRight,
  Check,
  Mail,
} from 'lucide-react';

/**
 * "Get Involved" CTA — three pathways into the Continuum (citizen
 * reviewer, researcher / institution, partner / embed) plus a
 * mission-list signup that pipes into the platform CRM endpoint.
 *
 * Anchored at #get-involved so the navbar's "Get Involved" link can
 * smooth-scroll here from the homepage.
 */
const GetInvolved: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'citizen' | 'researcher' | 'partner'>(
    'citizen',
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/.+@.+\..+/.test(email)) {
      setError('Please enter a valid email.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await fetch('/api/crm/69fa6c8ae577acf1894f7208/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: 'orchid-continuum-get-involved',
          role,
        }),
      });
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const pathways: {
    key: 'citizen' | 'researcher' | 'partner';
    title: string;
    body: string;
    icon: React.ComponentType<{ className?: string }>;
    cta: string;
    onClick: () => void;
  }[] = [
    {
      key: 'citizen',
      title: 'Become a reviewer',
      body: 'Join the Orchid Zoo workflow. Help validate identifications, flag confusing images, and surface knowledge gaps — no expertise required to start.',
      icon: PawPrint,
      cta: 'Open Orchid Zoo',
      onClick: () => navigate('/zoo'),
    },
    {
      key: 'researcher',
      title: 'Researcher / institution',
      body: 'Contribute documented sightings, mycorrhizal cultures, or microscopy. Every contribution carries source, license, and citation — credit returns to your lab.',
      icon: Microscope,
      cta: 'Explore the Atlas',
      onClick: () => navigate('/atlas'),
    },
    {
      key: 'partner',
      title: 'Embed the Continuum',
      body: 'Drop a Species Snapshot, Atlas Teaser, or Greenhouse card into your site. Same typed API, same design system, your audience.',
      icon: Boxes,
      cta: 'Browse widgets',
      onClick: () => navigate('/widgets'),
    },
  ];

  return (
    <section
      id="get-involved"
      className="relative py-28 bg-[#1a3a2e] text-white overflow-hidden border-t border-white/5"
    >
      <div className="absolute inset-0 opacity-25 pointer-events-none">
        <div className="absolute top-1/4 left-10 w-96 h-96 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute bottom-1/3 right-10 w-96 h-96 rounded-full bg-emerald-200/10 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="text-xs tracking-[0.3em] uppercase text-emerald-200/80 mb-5">
            Get Involved
          </div>
          <h2 className="font-serif text-4xl md:text-5xl leading-[1.1] tracking-tight">
            Three ways into<br />
            <span className="italic text-emerald-200/90">the Continuum.</span>
          </h2>
          <p className="text-white/70 mt-6 leading-relaxed">
            Pick the doorway that fits — citizen reviewer, researcher, or
            embedding partner. Each pathway opens onto the same platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden mb-14">
          {pathways.map(p => {
            const Icon = p.icon;
            const active = role === p.key;
            return (
              <div
                key={p.key}
                className={
                  'p-7 transition-colors duration-300 ' +
                  (active ? 'bg-[#0d1f17]' : 'bg-[#1a3a2e] hover:bg-[#0d1f17]/70')
                }
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="w-10 h-10 rounded-lg bg-emerald-300/10 border border-emerald-300/30 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-emerald-200" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setRole(p.key)}
                    className={
                      'text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full border transition-colors ' +
                      (active
                        ? 'bg-emerald-300/15 text-emerald-200 border-emerald-300/40'
                        : 'border-white/20 text-white/60 hover:text-white')
                    }
                  >
                    {active ? 'Selected' : 'Select'}
                  </button>
                </div>
                <h3 className="font-serif text-2xl mb-3">{p.title}</h3>
                <p className="text-sm text-white/70 leading-relaxed mb-6">
                  {p.body}
                </p>
                <button
                  onClick={p.onClick}
                  className="inline-flex items-center gap-2 text-sm text-emerald-200 hover:text-emerald-100 transition-colors"
                >
                  {p.cta}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={submit}
          className="max-w-2xl mx-auto rounded-2xl border border-white/15 bg-[#0d1f17]/40 backdrop-blur-sm p-6 md:p-8"
        >
          <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-emerald-200/80 mb-4">
            <Mail className="h-3.5 w-3.5" />
            Stay on the field updates list
          </div>
          {!submitted ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="researcher@institution.org"
                className="flex-1 bg-white/5 border border-white/20 rounded-full px-5 py-3 text-sm placeholder:text-white/40 focus:outline-none focus:border-emerald-200/60"
              />
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-emerald-300 text-[#0d1f17] hover:bg-emerald-200 transition-colors font-medium disabled:opacity-50"
              >
                {submitting ? 'Joining…' : `Join as ${role}`}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-emerald-300/15 border border-emerald-300/40 text-emerald-100 text-sm">
              <Check className="h-4 w-4" /> You're on the list — welcome to the
              Continuum.
            </div>
          )}
          {error && <div className="text-xs text-red-300 mt-3">{error}</div>}
          <div className="text-[10px] tracking-[0.2em] uppercase text-white/40 mt-4">
            We never share your email. One message at most per month.
          </div>
        </form>
      </div>
    </section>
  );
};

export default GetInvolved;
