import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Leaf, Eye, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';

const FOREST = '#1a2e1a';
const PARCHMENT = '#f5f0e8';
const GOLD = '#C9A84C';
const NAVY = '#0d2535';

type EpistemicCertainty = 'CERTAIN' | 'PROBABLE' | 'POSSIBLE' | 'UNCERTAIN';

const CERTAINTY_OPTIONS: { value: EpistemicCertainty; label: string; desc: string }[] = [
  { value: 'CERTAIN', label: 'Certain', desc: 'Confirmed identification by verifiable evidence' },
  { value: 'PROBABLE', label: 'Probable', desc: 'Strong likelihood based on observed characteristics' },
  { value: 'POSSIBLE', label: 'Possible', desc: 'Plausible match but with meaningful uncertainty' },
  { value: 'UNCERTAIN', label: 'Uncertain', desc: 'Insufficient evidence for reliable identification' },
];

type ObservationStatus = 'SUBMITTED' | 'SCREENED' | 'APPROVED' | 'REJECTED' | 'QUARANTINED';

interface ObservationItem {
  id: string;
  species_name: string;
  notes: string | null;
  observed_at: string | null;
  epistemic_certainty: EpistemicCertainty;
  status: ObservationStatus;
  submitted_at: string;
  location_redacted?: boolean;
}

const CERTAINTY_COLORS: Record<EpistemicCertainty, string> = {
  CERTAIN: 'bg-emerald-300/15 border-emerald-300/40 text-emerald-200',
  PROBABLE: 'bg-sky-300/15 border-sky-300/40 text-sky-200',
  POSSIBLE: 'bg-amber-300/15 border-amber-300/40 text-amber-200',
  UNCERTAIN: 'bg-white/5 border-white/20 text-white/60',
};

const MAX_NOTES_LENGTH = 2000;

const CommunityObservation: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'submit' | 'browse'>('submit');

  // Submit form state
  const [species, setSpecies] = useState('');
  const [notes, setNotes] = useState('');
  const [certainty, setCertainty] = useState<EpistemicCertainty>('POSSIBLE');
  const [observedDate, setObservedDate] = useState('');
  const [locationCountry, setLocationCountry] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Browse state
  const [observations, setObservations] = useState<ObservationItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'browse') return;
    const c = new AbortController();
    setBrowseLoading(true);
    setBrowseError(null);
    fetch('/api/community/observations?status=approved&limit=20', { signal: c.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { observations?: ObservationItem[] } | ObservationItem[]) => {
        const items = Array.isArray(data) ? data : (data.observations ?? []);
        setObservations(items);
        setBrowseLoading(false);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setBrowseError('Unable to load observations. The community feed may not be live yet.');
        setBrowseLoading(false);
      });
    return () => c.abort();
  }, [activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!species.trim()) {
      setSubmitError('Species name is required.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const payload: Record<string, string> = {
      species_name: species.trim().slice(0, 200),
      epistemic_certainty: certainty,
      notes: notes.trim().slice(0, MAX_NOTES_LENGTH),
    };
    if (observedDate) payload.observed_at = observedDate;
    if (locationCountry.trim()) payload.location_country = locationCountry.trim().slice(0, 100);

    try {
      const r = await fetch('/api/community/observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSubmitSuccess(true);
      setSpecies('');
      setNotes('');
      setCertainty('POSSIBLE');
      setObservedDate('');
      setLocationCountry('');
    } catch {
      setSubmitError('Submission failed. Please try again or contact info@orchidcontinuum.org.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen antialiased"
      style={{ backgroundColor: '#0d1f17', color: PARCHMENT, fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      <style>{`.serif { font-family: 'Cormorant Garamond', 'Playfair Display', Georgia, serif; }`}</style>
      <Navbar />

      <main className="pt-24">
        {/* Hero */}
        <section className="border-b border-white/5 py-16">
          <div className="mx-auto max-w-5xl px-6 lg:px-10">
            <Link
              to="/"
              className="mb-8 inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-emerald-200"
            >
              <ArrowLeft className="h-4 w-4" /> Return to Continuum
            </Link>

            <div className="text-[11px] tracking-[0.3em] uppercase text-emerald-200/80 mb-4">
              OASIS · Community Observations
            </div>
            <h1 className="serif text-5xl md:text-6xl leading-tight max-w-3xl" style={{ color: PARCHMENT }}>
              Field observations,<br />
              <span className="italic text-emerald-200/90">grounded in honesty.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white/70 leading-relaxed">
              Share what you've observed in the field. All submissions are reviewed before
              appearing publicly. Community observations are distinct from scientifically
              verified records.
            </p>

            {/* Provenance notice — always visible */}
            <div
              className="mt-8 flex items-start gap-3 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4 text-sm text-amber-100/90"
              role="note"
              data-testid="community-provenance-notice"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/80" />
              <div>
                <strong className="block text-amber-200">Community observations are user reports — not scientific evidence.</strong>
                <span className="text-white/70">
                  Observations pass through human moderation before any scientific use.
                  They are never automatically promoted to hypotheses or scientific facts.
                  Sensitive locality coordinates are never displayed publicly.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <div className="border-b border-white/5 bg-[#0a1812]">
          <div className="mx-auto max-w-5xl px-6 lg:px-10">
            <nav className="flex gap-0" aria-label="Community observation tabs">
              {(['submit', 'browse'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-6 py-4 text-sm tracking-wide transition-colors ${
                    activeTab === tab
                      ? 'border-emerald-300 text-emerald-200'
                      : 'border-transparent text-white/50 hover:text-white/80'
                  }`}
                  data-testid={`tab-${tab}`}
                >
                  {tab === 'submit' ? 'Submit Observation' : 'Browse Observations'}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab content */}
        <div className="mx-auto max-w-5xl px-6 py-12 lg:px-10">

          {/* Submit tab */}
          {activeTab === 'submit' && (
            <div>
              {submitSuccess ? (
                <div
                  className="flex items-center gap-4 rounded-2xl border border-emerald-300/30 bg-emerald-300/5 p-8"
                  data-testid="community-submit-success"
                >
                  <CheckCircle className="h-8 w-8 shrink-0 text-emerald-300" />
                  <div>
                    <div className="serif text-2xl text-emerald-100">Observation submitted.</div>
                    <p className="mt-1 text-white/65">
                      Thank you. Your observation will be reviewed by a moderator before
                      appearing in the community feed.
                    </p>
                    <button
                      className="mt-4 rounded-full px-5 py-2 text-sm transition-colors"
                      style={{ backgroundColor: 'rgba(110,231,183,0.15)', color: '#6EE7B7', border: '1px solid rgba(110,231,183,0.3)' }}
                      onClick={() => setSubmitSuccess(false)}
                    >
                      Submit another observation
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} data-testid="community-submit-form" noValidate>
                  <div className="grid gap-6 max-w-2xl">

                    {/* Species */}
                    <div>
                      <label
                        htmlFor="community-species"
                        className="block text-sm text-white/70 mb-2"
                      >
                        Species name <span className="text-emerald-300">*</span>
                      </label>
                      <input
                        id="community-species"
                        type="text"
                        value={species}
                        onChange={e => setSpecies(e.target.value)}
                        placeholder="e.g. Dracula bella or Pleurothallidae sp."
                        maxLength={200}
                        className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-emerald-300/50 focus:outline-none"
                        data-testid="community-submit-species"
                        aria-required="true"
                      />
                      <p className="mt-1 text-[11px] text-white/40">
                        Use the accepted scientific name when known. Provisional names are accepted.
                      </p>
                    </div>

                    {/* Epistemic certainty */}
                    <div>
                      <span className="block text-sm text-white/70 mb-3">
                        How certain are you of this identification?
                      </span>
                      <div
                        className="grid grid-cols-2 md:grid-cols-4 gap-2"
                        role="radiogroup"
                        aria-label="Epistemic certainty"
                        data-testid="community-submit-certainty"
                      >
                        {CERTAINTY_OPTIONS.map(opt => (
                          <label
                            key={opt.value}
                            className={`cursor-pointer rounded-xl border p-3 transition-all ${
                              certainty === opt.value
                                ? CERTAINTY_COLORS[opt.value]
                                : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-white/25'
                            }`}
                          >
                            <input
                              type="radio"
                              name="certainty"
                              value={opt.value}
                              checked={certainty === opt.value}
                              onChange={() => setCertainty(opt.value)}
                              className="sr-only"
                            />
                            <div className="text-sm font-medium">{opt.label}</div>
                            <div className="mt-1 text-[10px] leading-tight opacity-75">{opt.desc}</div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label
                        htmlFor="community-notes"
                        className="block text-sm text-white/70 mb-2"
                      >
                        Observation notes
                      </label>
                      <textarea
                        id="community-notes"
                        value={notes}
                        onChange={e => setNotes(e.target.value.slice(0, MAX_NOTES_LENGTH))}
                        placeholder="Describe what you observed — habitat, characteristics, associated species…"
                        rows={5}
                        className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-emerald-300/50 focus:outline-none resize-none"
                        data-testid="community-submit-notes"
                        aria-describedby="notes-help"
                      />
                      <p id="notes-help" className="mt-1 text-[11px] text-white/40">
                        {notes.length}/{MAX_NOTES_LENGTH} characters.
                        Notes are plain text only and are never passed to automated agents.
                      </p>
                    </div>

                    {/* Observed date */}
                    <div>
                      <label
                        htmlFor="community-date"
                        className="block text-sm text-white/70 mb-2"
                      >
                        Date observed
                      </label>
                      <input
                        id="community-date"
                        type="date"
                        value={observedDate}
                        onChange={e => setObservedDate(e.target.value)}
                        className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white focus:border-emerald-300/50 focus:outline-none"
                        style={{ colorScheme: 'dark' }}
                        data-testid="community-submit-date"
                      />
                    </div>

                    {/* Location (country only — sensitive locality protected) */}
                    <div>
                      <label
                        htmlFor="community-location"
                        className="block text-sm text-white/70 mb-2"
                      >
                        Country / region{' '}
                        <span className="text-[11px] text-white/40">(optional)</span>
                      </label>
                      <input
                        id="community-location"
                        type="text"
                        value={locationCountry}
                        onChange={e => setLocationCountry(e.target.value)}
                        placeholder="e.g. Ecuador, Napo Province"
                        maxLength={100}
                        className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-emerald-300/50 focus:outline-none"
                        data-testid="community-submit-location"
                      />
                      <p className="mt-1 text-[11px] text-white/40">
                        Precise GPS coordinates are never requested here. Sensitive locality
                        data is protected and reviewed separately.
                      </p>
                    </div>

                    {submitError && (
                      <div
                        className="rounded-xl border border-red-300/30 bg-red-300/5 p-4 text-sm text-red-200"
                        role="alert"
                      >
                        {submitError}
                      </div>
                    )}

                    <div>
                      <button
                        type="submit"
                        disabled={submitting || !species.trim()}
                        className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold tracking-wide transition-opacity disabled:opacity-50"
                        style={{ backgroundColor: GOLD, color: FOREST }}
                        data-testid="community-submit-button"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Submitting…
                          </>
                        ) : (
                          <>
                            <Leaf className="h-4 w-4" />
                            Submit for Review
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Browse tab */}
          {activeTab === 'browse' && (
            <div>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <div className="text-[11px] tracking-[0.25em] uppercase text-emerald-300/70 mb-1">
                    Approved community observations
                  </div>
                  <p className="text-sm text-white/55">
                    Screened and approved by moderators. Each carries its epistemic certainty label.
                  </p>
                </div>
                <Eye className="h-5 w-5 text-white/30" />
              </div>

              {browseLoading && (
                <div className="flex items-center gap-3 text-white/50 text-sm py-8">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading observations…
                </div>
              )}

              {browseError && (
                <div
                  className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-5 text-sm text-amber-100/80"
                  role="status"
                >
                  {browseError}
                </div>
              )}

              {!browseLoading && !browseError && observations.length === 0 && (
                <div
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-white/50 text-sm"
                  role="status"
                  data-testid="community-browse-empty"
                >
                  No approved observations yet. Be the first to submit one.
                </div>
              )}

              {observations.length > 0 && (
                <ul
                  className="space-y-4"
                  data-testid="community-browse-list"
                  aria-label="Community observations"
                >
                  {observations.map(obs => (
                    <li
                      key={obs.id}
                      className="rounded-2xl border border-white/10 bg-[#142a1f] p-5"
                      data-testid="community-observation-item"
                    >
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="serif text-xl text-white/90 italic">{obs.species_name}</div>
                          {obs.observed_at && (
                            <div className="text-[11px] text-white/40 mt-0.5">
                              Observed {obs.observed_at}
                            </div>
                          )}
                        </div>
                        <span
                          className={`text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full border ${CERTAINTY_COLORS[obs.epistemic_certainty]}`}
                        >
                          {obs.epistemic_certainty}
                        </span>
                      </div>
                      {obs.notes && (
                        <p className="mt-3 text-sm text-white/65 leading-relaxed">{obs.notes}</p>
                      )}
                      <div className="mt-3 flex items-center gap-2 text-[10px] text-white/35">
                        <span>Community report · {new Date(obs.submitted_at).toLocaleDateString()}</span>
                        {obs.location_redacted && (
                          <span className="border border-white/15 rounded px-1.5 py-0.5">Locality protected</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer note on scientific boundaries */}
        <section
          className="border-t border-white/5 py-10"
          style={{ backgroundColor: NAVY }}
        >
          <div className="mx-auto max-w-5xl px-6 lg:px-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-white/55">
              <div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-emerald-300/70 mb-2">
                  Epistemic states
                </div>
                <p>
                  Every observation carries one of four certainty labels —
                  CERTAIN, PROBABLE, POSSIBLE, or UNCERTAIN — which persist
                  through the review process and are never stripped out.
                </p>
              </div>
              <div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-emerald-300/70 mb-2">
                  Moderation lifecycle
                </div>
                <p>
                  Submissions enter SUBMITTED state. Moderators screen and move
                  them to SCREENED, then APPROVED or REJECTED. No observation
                  bypasses human review.
                </p>
              </div>
              <div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-emerald-300/70 mb-2">
                  Scientific boundary
                </div>
                <p>
                  Community observations are user reports. They do not become
                  scientific evidence, hypotheses, or published records without
                  explicit human scientific review and authorization.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default CommunityObservation;
