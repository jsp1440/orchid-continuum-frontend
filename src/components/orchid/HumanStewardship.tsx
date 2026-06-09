import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sprout,
  Microscope,
  ShieldCheck,
  Users,
  Building2,
  Flower2,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { BACKEND_BASE_URL } from '@/lib/backendConfig';

/**
 * HumanStewardship — Section 7 of the storytelling homepage.
 *
 * Closes the emotional arc on Stewardship → Action. Adds:
 *   1. A live campaign donation counter (raised / supporters).
 *   2. Interactive role cards that pre-select a supporter type.
 *   3. A lightweight email "stay connected" sign-up.
 *   4. The embedded Pledge It donation widget (donors never leave the hub),
 *      with recurring-gift encouragement copy.
 */

interface Steward {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}

const STEWARDS: Steward[] = [
  {
    icon: Sprout,
    title: 'Growers',
    body: 'Cultivate living arks at home and in greenhouses, preserving genetic diversity outside the wild.',
  },
  {
    icon: Microscope,
    title: 'Researchers',
    body: 'Decode pollination, fungal partners, and climate limits — the science that makes protection possible.',
  },
  {
    icon: ShieldCheck,
    title: 'Conservationists',
    body: 'Protect forests, restore habitat, and return propagated orchids to the wild.',
  },
  {
    icon: Users,
    title: 'Citizen Scientists',
    body: 'Record sightings and photos that map where orchids live — and where they are vanishing.',
  },
  {
    icon: Building2,
    title: 'Botanical Gardens',
    body: 'Hold seed banks and reference collections that anchor recovery efforts worldwide.',
  },
  {
    icon: Flower2,
    title: 'Orchid Societies',
    body: 'Share knowledge across generations, turning passion into a global community of care.',
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Campaign stats (TASK 1)
// ---------------------------------------------------------------------------

interface CampaignStats {
  raised: number;
  donors: number;
  /** true when the live endpoint succeeded; false → placeholder values. */
  live: boolean;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^0-9.]/g, ''));
      if (!Number.isNaN(n) && v.trim() !== '') return n;
    }
  }
  return undefined;
}

async function fetchCampaignStats(signal?: AbortSignal): Promise<CampaignStats> {
  // 8s timeout, matching the backend retry logic used elsewhere.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/campaign/stats`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as Record<string, unknown>;
    const inner = (data.data as Record<string, unknown>) ?? data;
    const raised =
      pickNumber(inner, ['total_raised', 'raised', 'amount_raised', 'total', 'amount']) ?? 0;
    const donors =
      pickNumber(inner, ['donors', 'donor_count', 'supporters', 'num_donors', 'count']) ?? 0;
    return { raised, donors, live: true };
  } catch {
    return { raised: 0, donors: 0, live: false };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const HumanStewardship: React.FC = () => {
  const navigate = useNavigate();
  const widgetRef = useRef<HTMLDivElement | null>(null);

  // Campaign stats — placeholder until live data arrives.
  const [stats, setStats] = useState<CampaignStats>({ raised: 0, donors: 0, live: true });
  const [statsLoading, setStatsLoading] = useState(true);

  // Role selection (TASK 2)
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  // Lightweight email sign-up (TASK 2)
  const [email, setEmail] = useState('');
  const [signupState, setSignupState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  useEffect(() => {
    const ctrl = new AbortController();
    setStatsLoading(true);
    fetchCampaignStats(ctrl.signal)
      .then((s) => setStats(s))
      .finally(() => {
        if (!ctrl.signal.aborted) setStatsLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  const scrollToWidget = (role: string) => {
    setSelectedRole(role);
    widgetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setSignupState('error');
      return;
    }
    setSignupState('submitting');
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/subscribers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role: selectedRole ?? 'Supporter',
          source: 'stewardship_cards',
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSignupState('done');
    } catch {
      // Keep the email visible on failure.
      setSignupState('error');
    }
  };

  const formatUSD = (n: number) =>
    `$${Math.round(n).toLocaleString('en-US')}`;

  return (
    <section
      id="human-stewardship"
      className="relative border-b border-white/[0.06] overflow-hidden scroll-mt-20"
    >
      {/* Terracotta / earth-tone header band */}
      <div style={{ background: '#3d1f0f' }} className="text-[#f5ead8]">
        <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-20 lg:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-3 font-mono text-[12px] tracking-[0.32em] uppercase text-[#e0a96d]">
              <span className="inline-block w-8 h-px bg-[#e0a96d]/70" />
              Human Stewardship
            </div>
            <h2
              className="mt-6 text-[#fbf3e6] leading-[1.07]"
              style={{
                fontFamily:
                  '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontSize: 'clamp(2rem, 4vw, 3.2rem)',
                fontWeight: 700,
              }}
            >
              How people help{' '}
              <span className="italic text-[#e8b27a]">protect orchids</span>.
            </h2>
            <p
              className="mt-5 text-[#f0ddc6] font-body"
              style={{ fontSize: 18, lineHeight: 1.7, fontWeight: 400, maxWidth: 680 }}
            >
              People have become part of the orchid's web of life. Across the
              world, ordinary stewards keep these flowers — and the relationships
              that sustain them — alive. There is a place in that work for you.
            </p>
          </div>
        </div>
      </div>

      {/* Forest-green body — role cards + email sign-up */}
      <div
        className="relative bg-[#1a2e1a] text-[#f0ebe0] overflow-hidden"
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 12% 0%, rgba(54,102,72,0.28) 0%, transparent 55%)',
          }}
        />
        <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-16 lg:py-20">
          {/* Interactive role cards (TASK 2) */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {STEWARDS.map((s) => {
              const Icon = s.icon;
              const active = selectedRole === s.title;
              return (
                <div key={s.title} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => setSelectedRole(active ? null : s.title)}
                    aria-pressed={active}
                    className={[
                      'group text-left rounded-2xl p-7 transition-all duration-300 border',
                      active
                        ? 'bg-[#203626] border-[#d4b34a] ring-1 ring-[#d4b34a]/60'
                        : 'bg-[#16271a] border-white/[0.08] hover:bg-[#203626] hover:border-[#d4b34a]/40',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'inline-flex items-center justify-center h-11 w-11 rounded-full border transition-colors',
                        active
                          ? 'bg-[#d4b34a] text-[#14281c] border-[#d4b34a]'
                          : 'border-[#d4b34a]/40 text-[#d4b34a] group-hover:bg-[#d4b34a] group-hover:text-[#14281c]',
                      ].join(' ')}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3
                      className="mt-4 text-[#faf7f2] text-xl italic"
                      style={{
                        fontFamily:
                          '"Playfair Display","Cormorant Garamond",Georgia,serif',
                      }}
                    >
                      {s.title}
                    </h3>
                    <p
                      className="mt-2 text-[#e2dccb] font-body"
                      style={{ fontSize: 15, lineHeight: 1.7, fontWeight: 400 }}
                    >
                      {s.body}
                    </p>
                  </button>

                  {/* "Join as [Role] →" prompt appears below the active card */}
                  {active && (
                    <button
                      type="button"
                      onClick={() => scrollToWidget(s.title)}
                      className="mt-2 inline-flex items-center gap-2 self-start px-4 py-2 rounded-full bg-[#d4b34a] text-[#14281c] font-mono text-[10px] tracking-[0.2em] uppercase font-semibold hover:bg-[#e0c156] transition-colors animate-in fade-in slide-in-from-top-1 duration-300"
                    >
                      Join as {s.title}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Lightweight "stay connected" email sign-up (TASK 2) */}
          <div className="mt-10 max-w-xl">
            {signupState === 'done' ? (
              <div className="inline-flex items-center gap-2 rounded-xl bg-[#203626] border border-[#d4b34a]/40 px-5 py-3 text-[#d4b34a] font-mono text-[12px] tracking-[0.14em] uppercase">
                <CheckCircle2 className="h-4 w-4" />
                You're part of the Continuum.
              </div>
            ) : (
              <>
                <label className="font-mono text-[11px] tracking-[0.24em] uppercase text-[#e2dccb]">
                  Not ready to give yet? Stay connected
                  {selectedRole && (
                    <span className="text-[#d4b34a]"> · as {selectedRole}</span>
                  )}
                </label>
                <form onSubmit={handleSignup} className="mt-3 flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (signupState === 'error') setSignupState('idle');
                    }}
                    placeholder="Your email address"
                    className="flex-1 bg-[#0f1c10] border border-white/15 rounded-full px-5 py-3 text-[15px] text-[#faf7f2] placeholder:text-[#cfc8b8]/55 focus:outline-none focus:border-[#d4b34a]/70 font-body"
                  />
                  <button
                    type="submit"
                    disabled={signupState === 'submitting'}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#d4b34a] text-[#14281c] font-mono text-[11px] tracking-[0.2em] uppercase font-semibold hover:bg-[#e0c156] transition-colors disabled:opacity-60"
                  >
                    {signupState === 'submitting' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Stay Connected
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </form>
                {signupState === 'error' && (
                  <p className="mt-2 text-[13px] text-[#f0a37a] font-body">
                    Please enter a valid email address and try again.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Donation / Support — warm deep purple-brown (orchid purple heart) */}
      <div style={{ background: '#1a0f1f' }} className="relative text-[#f3e9da]">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(150,80,160,0.18) 0%, transparent 60%)',
          }}
        />
        <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10">
          <div
            style={{ maxWidth: 520, margin: '0 auto', paddingTop: 48, paddingBottom: 48 }}
            className="text-center"
          >
            <div className="font-mono text-[12px] tracking-[0.36em] uppercase text-[#d4b34a]">
              Support the Continuum
            </div>

            {/* Emotional urgency subheading (TASK 5) */}
            <p
              className="mt-4 text-[#f0e6d6] font-body mx-auto"
              style={{ fontSize: 16, lineHeight: 1.7, fontWeight: 400, maxWidth: 480 }}
            >
              Orchid species are disappearing faster than we can name them. Your
              gift funds the infrastructure that makes conservation possible —
              the database, the maps, the citizen science tools, and the open
              knowledge that connects growers and researchers worldwide.
            </p>

            {/* Recurring-gift encouragement copy (TASK 3) */}
            <p
              className="mt-4 italic text-[#e6c98a] font-body max-w-md mx-auto"
              style={{ fontFamily: '"Cormorant Garamond",Georgia,serif', fontSize: 17, lineHeight: 1.6 }}
            >
              Monthly supporters sustain the platform year-round — even
              $10/month keeps a genus in the database.
            </p>

            {/* Live campaign counter (TASK 1) */}
            <div className="mt-6 flex items-center justify-center gap-3">
              <StatCard
                label="Raised to Date"
                value={statsLoading ? '—' : formatUSD(stats.raised)}
              />
              <StatCard
                label="Supporters"
                value={statsLoading ? '—' : stats.donors.toLocaleString('en-US')}
              />
            </div>
            {!statsLoading && !stats.live && (
              <p className="mt-3 text-[13px] text-[#cbb9a0] font-body italic">
                Campaign launching soon.
              </p>
            )}

            {/* Selected supporter type — captured alongside the gift */}
            {selectedRole && (
              <p className="mt-5 font-mono text-[10px] tracking-[0.2em] uppercase text-[#d4b34a]">
                Pledging as · {selectedRole}
              </p>
            )}

            <div
              ref={widgetRef}
              className="mt-5 rounded-2xl overflow-hidden scroll-mt-24"
              data-supporter-role={selectedRole ?? ''}
              dangerouslySetInnerHTML={{
                __html:
                  '<pledgeit-donateform widgetId="nxzhd7lwly"></pledgeit-donateform>',
              }}
            />

            <p className="mt-5 text-[13px] text-[#cbb9a0] font-body">
              Tax-deductible · Fiscally sponsored by Ecologistics, Inc. · 501(c)(3)
            </p>

            <button
              type="button"
              onClick={() => navigate('/partners')}
              className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[#d4b34a]/50 text-[#faf7f2] hover:bg-[#d4b34a]/10 hover:border-[#d4b34a] transition-colors font-mono text-[11px] tracking-[0.22em] uppercase"
            >
              Meet our partners
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};


/** Small gold stat card matching the Database Diagnostics aesthetic. */
const StatCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-[#d4b34a]/30 bg-[#0f1c10]/60 px-6 py-4 min-w-[140px]">
    <div className="text-[#d4b34a] font-mono text-[24px] leading-none">{value}</div>
    <div className="mt-2 font-mono text-[8.5px] tracking-[0.24em] uppercase text-[#cfc8b8]/70">
      {label}
    </div>
  </div>
);

export default HumanStewardship;
