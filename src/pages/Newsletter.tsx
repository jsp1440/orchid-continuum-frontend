import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Mail, MailX, Settings2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import {
  CONTACT_EMAIL,
  INTAKE_UNAVAILABLE_COPY,
  constituentRequest,
  jsonInit,
} from '@/lib/constituentApi';
import { forgetManageToken, readManageToken, rememberManageToken } from '@/lib/newsletterManageToken';

const FOREST = '#1a2e1a';
const PARCHMENT = '#f5f0e8';
const GOLD = '#C9A84C';
const NAVY = '#0d2535';

type Tab = 'subscribe' | 'preferences' | 'unsubscribe';
type SubmitState = 'idle' | 'loading' | 'success' | 'error' | 'unavailable' | 'needs_token';

/** Honest state when the constituent route is not live (or the static host answered with HTML). */
const IntakeUnavailable: React.FC<{ testId: string; what: string }> = ({ testId, what }) => (
  <div
    data-testid={testId}
    role="status"
    className="rounded-2xl p-8 text-center"
    style={{ border: `1px solid ${GOLD}55`, backgroundColor: `${GOLD}11` }}
  >
    <p className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: GOLD }}>
      In development
    </p>
    <p className="mt-3 text-lg font-semibold" style={{ color: PARCHMENT }}>
      {what} is not yet live.
    </p>
    <p className="mt-2 max-w-sm text-sm leading-relaxed" style={{ color: `${PARCHMENT}cc` }}>
      {INTAKE_UNAVAILABLE_COPY} You can reach us at{' '}
      <a href={`mailto:${CONTACT_EMAIL}`} className="underline" style={{ color: GOLD }}>
        {CONTACT_EMAIL}
      </a>
      .
    </p>
  </div>
);

const TOPIC_OPTIONS = [
  { value: 'conservation', label: 'Conservation science' },
  { value: 'taxonomy', label: 'Taxonomy updates' },
  { value: 'field_research', label: 'Field research' },
  { value: 'cultivation', label: 'Cultivation & culture' },
  { value: 'events', label: 'Events & programs' },
];

const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Weekly digest' },
  { value: 'monthly', label: 'Monthly summary' },
  { value: 'quarterly', label: 'Quarterly highlights' },
];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/* ─── Subscribe tab ─────────────────────────────────────────────────── */

const SubscribeForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [frequency, setFrequency] = useState('monthly');
  const [state, setState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [manageable, setManageable] = useState(false);

  const toggleTopic = (value: string) =>
    setTopics((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value],
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    setState('loading');
    setErrorMsg('');
    const result = await constituentRequest<{ normalized_email: string; state: string; manage_token?: string | null }>(
      '/subscribe',
      jsonInit('POST', {
        email: email.trim().toLowerCase(),
        topics,
        frequency,
        format: 'html',
      }),
    );
    if (result.kind === 'ok') {
      // The backend issues a per-address preference-centre token when it has a
      // signing secret. Kept in this browser only; never shown, never sent
      // anywhere but the preferences route for this same address.
      setManageable(rememberManageToken(result.data.normalized_email ?? email, result.data.manage_token));
      setState('success');
    } else if (result.kind === 'rejected') {
      setState('error');
      setErrorMsg(result.detail);
    } else {
      setState('unavailable');
    }
  };

  if (state === 'unavailable') {
    return <IntakeUnavailable testId="subscribe-unavailable" what="Newsletter sign-up" />;
  }

  if (state === 'success') {
    return (
      <div
        data-testid="subscribe-success"
        className="flex flex-col items-center gap-4 rounded-2xl p-8 text-center"
        style={{ border: `1px solid ${GOLD}33`, backgroundColor: `${GOLD}11` }}
      >
        <CheckCircle2 className="h-10 w-10" style={{ color: GOLD }} />
        <h2 className="font-serif text-2xl font-bold" style={{ color: PARCHMENT }}>
          You're subscribed.
        </h2>
        <p className="max-w-sm text-sm leading-relaxed" style={{ color: `${PARCHMENT}cc` }}>
          A confirmation email will be sent once our team has reviewed the request. No spam — ever.
        </p>
        {manageable ? (
          <p data-testid="subscribe-manageable" className="max-w-sm text-sm leading-relaxed" style={{ color: `${PARCHMENT}cc` }}>
            You can adjust topics and cadence from this browser in the Preferences tab.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="subscribe-form" noValidate>
      <div>
        <label
          htmlFor="subscribe-email"
          className="mb-2 block text-sm font-semibold uppercase tracking-widest"
          style={{ color: GOLD }}
        >
          Email address
        </label>
        <input
          id="subscribe-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.org"
          autoComplete="email"
          required
          className="w-full rounded-xl px-4 py-3 text-base focus:outline-none"
          style={{
            backgroundColor: 'rgba(245,240,232,0.06)',
            border: `1px solid ${GOLD}55`,
            color: PARCHMENT,
          }}
          aria-describedby={state === 'error' ? 'subscribe-error' : undefined}
        />
      </div>

      <fieldset>
        <legend
          className="mb-3 block text-sm font-semibold uppercase tracking-widest"
          style={{ color: GOLD }}
        >
          Topics of interest
        </legend>
        <div className="flex flex-wrap gap-2">
          {TOPIC_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => toggleTopic(t.value)}
              aria-pressed={topics.includes(t.value)}
              className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              style={
                topics.includes(t.value)
                  ? { backgroundColor: GOLD, color: FOREST }
                  : { border: `1px solid ${GOLD}55`, color: PARCHMENT }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="subscribe-frequency"
          className="mb-2 block text-sm font-semibold uppercase tracking-widest"
          style={{ color: GOLD }}
        >
          Frequency
        </label>
        <select
          id="subscribe-frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-base focus:outline-none"
          style={{
            backgroundColor: '#0d2535',
            border: `1px solid ${GOLD}55`,
            color: PARCHMENT,
          }}
        >
          {FREQUENCY_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {state === 'error' && (
        <p id="subscribe-error" role="alert" className="text-sm" style={{ color: '#e8b4a8' }}>
          {errorMsg}
        </p>
      )}
      {errorMsg && state === 'idle' && (
        <p role="alert" className="text-sm" style={{ color: '#e8b4a8' }}>
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={state === 'loading'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold uppercase tracking-widest transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: GOLD, color: FOREST }}
        data-testid="subscribe-submit"
      >
        <Mail className="h-4 w-4" />
        {state === 'loading' ? 'Subscribing…' : 'Subscribe to the newsletter'}
      </button>

      <p className="text-center text-xs leading-relaxed" style={{ color: `${PARCHMENT}88` }}>
        Orchid Continuum will not share your email. Unsubscribe at any time.
        Email content is treated as untrusted input and is never executed as instructions.
      </p>
    </form>
  );
};

/* ─── Preferences tab ───────────────────────────────────────────────── */

const PreferencesForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);
  const [frequency, setFrequency] = useState('monthly');
  const [state, setState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  /**
   * The preference centre never opens on an address alone. It opens with the
   * token this browser received at subscription (or, later, the one a
   * confirmation email carries). Without one the backend answers 401 and the
   * page says so, rather than claiming the feature is not live.
   */
  const preferencesPath = () => {
    const normalized = email.trim().toLowerCase();
    const token = readManageToken(normalized);
    return `/preferences?email=${encodeURIComponent(normalized)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  };

  const loadPrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) { setErrorMsg('Please enter a valid email.'); return; }
    setState('loading');
    const result = await constituentRequest<{ topics?: string[]; frequency?: string }>(preferencesPath());
    if (result.kind === 'ok') {
      setTopics(result.data.topics ?? []);
      setFrequency(result.data.frequency ?? 'monthly');
      setLoaded(true);
      setState('idle');
      setErrorMsg('');
    } else if (result.kind === 'rejected') {
      setState('error');
      setErrorMsg('Could not load preferences. Verify your email and try again.');
    } else if (result.kind === 'unavailable' && (result.status === 401 || result.status === 403)) {
      setState('needs_token');
    } else {
      setState('unavailable');
    }
  };

  const savePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('loading');
    const result = await constituentRequest<{ normalized_email: string }>(
      preferencesPath(),
      jsonInit('PATCH', { topics, frequency }),
    );
    if (result.kind === 'ok') {
      setState('success');
    } else if (result.kind === 'rejected') {
      setState('error');
      setErrorMsg('Failed to save preferences.');
    } else if (result.kind === 'unavailable' && (result.status === 401 || result.status === 403)) {
      setState('needs_token');
    } else {
      setState('unavailable');
    }
  };

  const toggleTopic = (value: string) =>
    setTopics((prev) => prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]);

  if (state === 'unavailable') {
    return <IntakeUnavailable testId="preferences-unavailable" what="Preference management" />;
  }

  if (state === 'needs_token') {
    return (
      <div data-testid="preferences-needs-token" role="status" className="rounded-2xl p-8 text-center" style={{ border: `1px solid ${GOLD}55`, backgroundColor: `${GOLD}11` }}>
        <p className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: GOLD }}>Preference centre</p>
        <p className="mt-3 text-lg font-semibold" style={{ color: PARCHMENT }}>This address needs its preferences link.</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed" style={{ color: `${PARCHMENT}cc` }}>
          Preferences never open on an email address alone. Subscribe from this browser to manage them here, use the link in your
          confirmation email, or write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline" style={{ color: GOLD }}>{CONTACT_EMAIL}</a>. Nothing was changed.
        </p>
        <button type="button" onClick={() => setState('idle')} className="mt-5 rounded-full px-5 py-2 text-sm font-semibold" style={{ border: `1px solid ${GOLD}55`, color: PARCHMENT }}>
          Back
        </button>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div data-testid="preferences-success" className="flex flex-col items-center gap-4 rounded-2xl p-8 text-center" style={{ border: `1px solid ${GOLD}33` }}>
        <CheckCircle2 className="h-10 w-10" style={{ color: GOLD }} />
        <p className="text-lg font-semibold" style={{ color: PARCHMENT }}>Preferences saved.</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <form onSubmit={loadPrefs} className="space-y-5" data-testid="preferences-lookup-form">
        <label htmlFor="prefs-email" className="mb-2 block text-sm font-semibold uppercase tracking-widest" style={{ color: GOLD }}>
          Your email address
        </label>
        <input
          id="prefs-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.org"
          required
          className="w-full rounded-xl px-4 py-3 text-base focus:outline-none"
          style={{ backgroundColor: 'rgba(245,240,232,0.06)', border: `1px solid ${GOLD}55`, color: PARCHMENT }}
        />
        {state === 'error' && <p role="alert" className="text-sm" style={{ color: '#e8b4a8' }}>{errorMsg}</p>}
        {errorMsg && state === 'idle' && <p role="alert" className="text-sm" style={{ color: '#e8b4a8' }}>{errorMsg}</p>}
        <button type="submit" disabled={state === 'loading'} className="inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold uppercase tracking-widest transition-opacity hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: GOLD, color: FOREST }}>
          <Settings2 className="h-4 w-4" />
          {state === 'loading' ? 'Loading…' : 'Load preferences'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={savePrefs} className="space-y-6" data-testid="preferences-edit-form">
      <fieldset>
        <legend className="mb-3 block text-sm font-semibold uppercase tracking-widest" style={{ color: GOLD }}>Topics</legend>
        <div className="flex flex-wrap gap-2">
          {TOPIC_OPTIONS.map((t) => (
            <button key={t.value} type="button" onClick={() => toggleTopic(t.value)} aria-pressed={topics.includes(t.value)}
              className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              style={topics.includes(t.value) ? { backgroundColor: GOLD, color: FOREST } : { border: `1px solid ${GOLD}55`, color: PARCHMENT }}>
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="prefs-frequency" className="mb-2 block text-sm font-semibold uppercase tracking-widest" style={{ color: GOLD }}>Frequency</label>
        <select id="prefs-frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-base focus:outline-none"
          style={{ backgroundColor: '#0d2535', border: `1px solid ${GOLD}55`, color: PARCHMENT }}>
          {FREQUENCY_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      {state === 'error' && <p role="alert" className="text-sm" style={{ color: '#e8b4a8' }}>{errorMsg}</p>}
      <button type="submit" disabled={state === 'loading'} className="inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold uppercase tracking-widest transition-opacity hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: GOLD, color: FOREST }}>
        {state === 'loading' ? 'Saving…' : 'Save preferences'}
      </button>
    </form>
  );
};

/* ─── Unsubscribe tab ───────────────────────────────────────────────── */

const UnsubscribeForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) { setErrorMsg('Please enter a valid email.'); return; }
    setState('loading');
    setErrorMsg('');
    const result = await constituentRequest<{ normalized_email: string; state: string }>(
      '/unsubscribe',
      jsonInit('POST', { email: email.trim().toLowerCase() }),
    );
    if (result.kind === 'ok') {
      forgetManageToken(email);
      setState('success');
    } else if (result.kind === 'rejected') {
      setState('error');
      setErrorMsg(`Unsubscribe failed. Please try again or email ${CONTACT_EMAIL} directly.`);
    } else {
      setState('unavailable');
    }
  };

  if (state === 'unavailable') {
    return <IntakeUnavailable testId="unsubscribe-unavailable" what="Unsubscribe" />;
  }

  if (state === 'success') {
    return (
      <div data-testid="unsubscribe-success" className="flex flex-col items-center gap-4 rounded-2xl p-8 text-center" style={{ border: `1px solid ${GOLD}33` }}>
        <MailX className="h-10 w-10" style={{ color: GOLD }} />
        <p className="text-lg font-semibold" style={{ color: PARCHMENT }}>You have been unsubscribed.</p>
        <p className="max-w-sm text-sm" style={{ color: `${PARCHMENT}cc` }}>You will no longer receive newsletter emails from Orchid Continuum.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-testid="unsubscribe-form" noValidate>
      <label htmlFor="unsub-email" className="mb-2 block text-sm font-semibold uppercase tracking-widest" style={{ color: GOLD }}>
        Email address to unsubscribe
      </label>
      <input
        id="unsub-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.org"
        required
        className="w-full rounded-xl px-4 py-3 text-base focus:outline-none"
        style={{ backgroundColor: 'rgba(245,240,232,0.06)', border: `1px solid ${GOLD}55`, color: PARCHMENT }}
        aria-describedby={state === 'error' ? 'unsub-error' : undefined}
      />
      {state === 'error' && <p id="unsub-error" role="alert" className="text-sm" style={{ color: '#e8b4a8' }}>{errorMsg}</p>}
      {errorMsg && state === 'idle' && <p role="alert" className="text-sm" style={{ color: '#e8b4a8' }}>{errorMsg}</p>}
      <button type="submit" disabled={state === 'loading'} className="inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold uppercase tracking-widest transition-opacity hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#3a1a1a', border: '1px solid #c84c4c66', color: '#f5c8c8' }}
        data-testid="unsubscribe-submit">
        {state === 'loading' ? 'Processing…' : 'Unsubscribe'}
      </button>
    </form>
  );
};

/* ─── Page shell ────────────────────────────────────────────────────── */

const TAB_CONFIG: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'subscribe', label: 'Subscribe', icon: Mail },
  { key: 'preferences', label: 'Preferences', icon: Settings2 },
  { key: 'unsubscribe', label: 'Unsubscribe', icon: MailX },
];

const Newsletter: React.FC = () => {
  const [tab, setTab] = useState<Tab>('subscribe');

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: FOREST }}>
      <Navbar />

      <main className="flex-1 pt-24">
        {/* Hero */}
        <section className="py-20" style={{ backgroundColor: FOREST }}>
          <div className="mx-auto max-w-2xl px-6 lg:px-10">
            <Link to="/" className="mb-10 inline-flex items-center gap-2 text-xs uppercase tracking-widest transition-opacity hover:opacity-70" style={{ color: GOLD }}>
              ← Orchid Continuum
            </Link>
            <div className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>Newsletter</div>
            <h1 className="mt-4 font-serif text-4xl font-bold leading-tight lg:text-5xl" style={{ color: PARCHMENT }}>
              Orchid Continuum Dispatch
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed" style={{ color: `${PARCHMENT}cc` }}>
              Conservation science, taxonomy updates, and field research from the Orchid Continuum team. Editorial-reviewed; Calyx may suggest stories but cannot send without human authorization.
            </p>
          </div>
        </section>

        {/* Tab panel */}
        <section style={{ backgroundColor: NAVY }}>
          <div className="mx-auto max-w-2xl px-6 py-16 lg:px-10">
            {/* Tab switcher */}
            <div className="mb-10 flex gap-1 rounded-xl p-1" style={{ backgroundColor: 'rgba(201,168,76,0.08)', border: `1px solid ${GOLD}22` }} role="tablist">
              {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition-colors"
                  style={
                    tab === key
                      ? { backgroundColor: GOLD, color: FOREST }
                      : { color: `${PARCHMENT}99` }
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div role="tabpanel">
              {tab === 'subscribe' && <SubscribeForm />}
              {tab === 'preferences' && <PreferencesForm />}
              {tab === 'unsubscribe' && <UnsubscribeForm />}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Newsletter;
