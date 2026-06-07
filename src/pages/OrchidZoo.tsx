import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  ListChecks,
  ShieldCheck,
  Users,
  CircleDashed,
  Loader2,
  Check,
  ArrowRight,
} from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import ZooReviewWorkflow from '@/components/zoo/ZooReviewWorkflow';
import { zooApi, type ZooStatus, ZOO_PLACEHOLDER_MESSAGE } from '@/lib/zoo';

/**
 * Orchid Zoo — citizen science workspace (placeholder route).
 *
 * The public frontend never talks to Zooniverse directly. The intended
 * data flow is:
 *
 *   Zooniverse / reviewer interface
 *      ↓
 *   Orchid Continuum database
 *      ↓
 *   Orchid Continuum API (/api/zoo/*)
 *      ↓
 *   This page
 *
 * Hooks declared in `src/lib/zoo.ts` will eventually hydrate the panels
 * below with review queue depth, validation status, badges, and member
 * contributions.
 */

const OrchidZoo: React.FC = () => {
  const [status, setStatus] = useState<ZooStatus | null>(null);
  const [statusLive, setStatusLive] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    zooApi.status(controller.signal).then(r => {
      if (controller.signal.aborted) return;
      if (r.data) {
        setStatus(r.data);
        setStatusLive(true);
      }
      setStatusLoading(false);
    });
    return () => controller.abort();
  }, []);

  // Local-only contribution form. Submission goes through zooApi.contribute
  // (which targets the Orchid Continuum API, not Zooniverse).
  const [taxonHint, setTaxonHint] = useState('');
  const [observerEmail, setObserverEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitMsg(null);
    const r = await zooApi.contribute({
      taxon_hint: taxonHint || undefined,
      observer_email: observerEmail || undefined,
      notes: notes || undefined,
    });
    setSubmitting(false);
    if (r.unconfigured) {
      setSubmitMsg(
        'Submission endpoint not yet configured for this deployment.',
      );
    } else if (r.error) {
      setSubmitMsg('We could not record your contribution. Please try again.');
    } else {
      setSubmitMsg('Thank you — your contribution is queued for review.');
      setTaxonHint('');
      setObserverEmail('');
      setNotes('');
    }
  };

  const fmt = (n?: number) => (n == null ? '—' : n.toLocaleString());

  return (
    <div
      className="min-h-screen bg-[#0d1f17] text-white antialiased"
      style={{ fontFamily: '"Inter", system-ui, -apple-system, sans-serif' }}
    >
      <style>{`
        .font-serif { font-family: 'Cormorant Garamond', 'Playfair Display', Georgia, serif; font-weight: 500; letter-spacing: -0.01em; }
      `}</style>
      <Navbar />

      <main className="pt-24">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/5">
          <div className="absolute inset-0 opacity-30 pointer-events-none">
            <div className="absolute top-1/3 left-10 w-96 h-96 rounded-full bg-emerald-400/20 blur-3xl" />
            <div className="absolute bottom-1/4 right-10 w-96 h-96 rounded-full bg-emerald-200/10 blur-3xl" />
          </div>
          <div className="relative max-w-7xl mx-auto px-6 lg:px-10 py-20">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-emerald-200 transition-colors mb-10"
            >
              <ArrowLeft className="h-4 w-4" /> Return to Continuum
            </Link>

            <div className="text-xs tracking-[0.3em] uppercase text-emerald-200/80 mb-5">
              Citizen Science · Reviewed Through the Continuum API
            </div>
            <h1 className="font-serif text-5xl md:text-7xl leading-[1.05] max-w-4xl">
              The Orchid Zoo<br />
              <span className="italic text-emerald-200/95">
                a curated participation pipeline.
              </span>
            </h1>
            <p className="text-lg text-white/70 mt-8 max-w-2xl leading-relaxed font-light">
              Members and citizen scientists submit observations that flow
              through reviewer interfaces (e.g. Zooniverse) into the Orchid
              Continuum database. Only reviewed records — with confidence
              badges — surface here, ensuring scientific integrity.
            </p>
          </div>
        </section>

        {/* Status panels */}
        <section className="py-16 border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<ListChecks className="h-4 w-4" />}
              label="Review queue"
              value={fmt(status?.queue_depth)}
              live={statusLive}
              loading={statusLoading}
            />
            <StatCard
              icon={<Check className="h-4 w-4" />}
              label="Reviewed today"
              value={fmt(status?.reviewed_today)}
              live={statusLive}
              loading={statusLoading}
            />
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="Active reviewers"
              value={fmt(status?.active_reviewers)}
              live={statusLive}
              loading={statusLoading}
            />
            <StatCard
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Last review"
              value={
                status?.last_review_at
                  ? new Date(status.last_review_at).toLocaleString()
                  : '—'
              }
              live={statusLive}
              loading={statusLoading}
            />
          </div>
        </section>

        {/* Reviewer workflow demo */}
        <section className="py-20 border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 lg:px-10">
            <ZooReviewWorkflow />
          </div>
        </section>


        {/* Pipeline architecture */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-6 lg:px-10">
            <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-3">
              Pipeline Architecture
            </div>
            <h2 className="font-serif text-3xl md:text-4xl mb-10">
              From observation to reviewed record
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
              {[
                {
                  n: '01',
                  l: 'Citizen submission',
                  d: 'Members upload images, locality, and context via the Continuum API.',
                  endpoint: 'POST /api/zoo/contribute',
                },
                {
                  n: '02',
                  l: 'Reviewer queue',
                  d: 'Zooniverse and curator interfaces consume the queue, never the public frontend.',
                  endpoint: 'GET /api/zoo/queue',
                },
                {
                  n: '03',
                  l: 'Database of record',
                  d: 'Reviewed observations land in the Continuum database with provenance.',
                  endpoint: '— internal —',
                },
                {
                  n: '04',
                  l: 'Public surfacing',
                  d: 'Confidence badges appear on species pages once curators sign off.',
                  endpoint: 'GET /api/zoo/badges/{taxonomy_id}',
                },
              ].map(s => (
                <div key={s.n} className="bg-[#142a1f] p-7">
                  <div className="text-[10px] tracking-[0.3em] uppercase text-emerald-300/70">
                    {s.n}
                  </div>
                  <h3 className="font-serif text-xl mt-3">{s.l}</h3>
                  <p className="text-sm text-white/65 mt-2 leading-relaxed">
                    {s.d}
                  </p>
                  <div className="mt-4 text-[10px] tracking-[0.2em] uppercase text-white/40 break-words">
                    {s.endpoint}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contribution form */}
        <section className="py-20 border-t border-white/5 bg-[#0a1812]">
          <div className="max-w-3xl mx-auto px-6 lg:px-10">
            <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-3 flex items-center gap-2">
              <Camera className="h-3.5 w-3.5" />
              Contribute an observation
            </div>
            <h2 className="font-serif text-3xl md:text-4xl">
              Add a record to the review queue
            </h2>
            <p className="text-sm text-white/60 mt-3 leading-relaxed">
              Submissions are queued for curatorial review and only appear
              publicly after they receive a confidence badge.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <input
                value={taxonHint}
                onChange={e => setTaxonHint(e.target.value)}
                placeholder="Suspected genus or species (e.g. Dracula vampira)"
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm placeholder:text-white/40 focus:outline-none focus:border-emerald-300/60"
              />
              <input
                type="email"
                value={observerEmail}
                onChange={e => setObserverEmail(e.target.value)}
                placeholder="Your email (for curatorial follow-up)"
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm placeholder:text-white/40 focus:outline-none focus:border-emerald-300/60"
              />
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Locality, elevation, habitat, observation notes…"
                rows={4}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm placeholder:text-white/40 focus:outline-none focus:border-emerald-300/60"
              />
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="text-[10px] tracking-[0.2em] uppercase text-white/45 flex items-center gap-2">
                  <CircleDashed className="h-3.5 w-3.5" />
                  {ZOO_PLACEHOLDER_MESSAGE}
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-emerald-300 text-[#0d1f17] hover:bg-emerald-200 transition-colors font-medium disabled:opacity-50"
                >
                  {submitting ? 'Sending…' : 'Submit for review'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              {submitMsg && (
                <div className="text-sm text-emerald-200/90 mt-2">{submitMsg}</div>
              )}
            </form>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  live: boolean;
  loading: boolean;
}> = ({ icon, label, value, live, loading }) => (
  <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-6">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-emerald-300/80">
        {icon}
        {label}
      </div>
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />
      ) : (
        <span
          className={
            'text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border ' +
            (live
              ? 'border-emerald-300/40 text-emerald-200 bg-emerald-300/10'
              : 'border-white/15 text-white/45')
          }
        >
          {live ? 'Live' : 'Refreshing'}
        </span>
      )}
    </div>
    <div className="font-serif text-3xl text-emerald-100 mt-4 tabular-nums">
      {value}
    </div>
    {!live && !loading && (
      <div className="text-[10px] text-white/40 mt-1">
        Awaiting /api/zoo/status.
      </div>
    )}
  </div>
);

export default OrchidZoo;
