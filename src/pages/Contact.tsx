import React, { useState } from 'react';
import { Bug, Lightbulb, MessageSquare } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import { CONTACT_EMAIL, constituentRequest, jsonInit } from '@/lib/constituentApi';

const FOREST = '#1a2e1a';
const PARCHMENT = '#f5f0e8';
const GOLD = '#C9A84C';
const NAVY = '#0d2535';

type Category = 'general' | 'bug' | 'suggestion';
type SubmitState = 'idle' | 'loading' | 'success' | 'error' | 'unavailable';

const CATEGORIES: Array<{ value: Category; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'general', label: 'General inquiry', icon: MessageSquare },
  { value: 'bug', label: 'Report a bug', icon: Bug },
  { value: 'suggestion', label: 'Suggestion', icon: Lightbulb },
];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Sanitize contact form body: strip any content that looks like an agent instruction prefix. */
function sanitizeBody(raw: string): string {
  // Treat the message as plain text. Trim and cap length.
  return raw.trim().slice(0, 4000);
}

const Contact: React.FC = () => {
  const [category, setCategory] = useState<Category>('general');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) { setErrorMsg('Please enter a valid email address.'); return; }
    if (body.trim().length < 10) { setErrorMsg('Please describe your message (at least 10 characters).'); return; }
    setState('loading');
    setErrorMsg('');

    // The message body is sanitized and treated as plain user text (untrusted).
    // It is never passed to an AI agent directly; delivery and review are human-mediated.
    const payload = {
      category,
      name: name.trim().slice(0, 200),
      email: email.trim().toLowerCase(),
      subject: subject.trim().slice(0, 300),
      body: sanitizeBody(body),
      source: 'orchid-continuum-contact-page',
    };

    // Only a parsed JSON acknowledgement from the backend counts as "received".
    // A 404, a 401, or the static host's HTML 200 rewrite means the intake is not
    // live, and the visitor is told so honestly instead of being shown a success.
    const result = await constituentRequest<{ message?: string }>('/contact', jsonInit('POST', payload));
    if (result.kind === 'ok') {
      setState('success');
    } else if (result.kind === 'rejected') {
      setState('error');
      setErrorMsg(result.detail);
    } else {
      setState('unavailable');
    }
  };

  const mailtoHref = (() => {
    const sub = encodeURIComponent(`[${category.toUpperCase()}] ${subject.trim() || 'Orchid Continuum contact'}`);
    const bd = encodeURIComponent(`Name: ${name.trim()}\nEmail: ${email.trim()}\n\n${sanitizeBody(body)}`);
    return `mailto:${CONTACT_EMAIL}?subject=${sub}&body=${bd}`;
  })();

  if (state === 'unavailable') {
    return (
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: FOREST }}>
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-6 pt-24">
          <div data-testid="contact-unavailable" role="status" className="max-w-md rounded-2xl p-10 text-center" style={{ border: `1px solid ${GOLD}55` }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: GOLD }}>In development</p>
            <h2 className="mt-3 font-serif text-2xl font-bold" style={{ color: PARCHMENT }}>Contact intake is not yet live.</h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: `${PARCHMENT}bb` }}>
              Your message was not sent or stored. Please email us directly — the link below opens your mail client with your message filled in.
            </p>
            <a
              href={mailtoHref}
              data-testid="contact-mailto"
              className="mt-6 inline-block rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-widest"
              style={{ backgroundColor: GOLD, color: FOREST }}
            >
              Email {CONTACT_EMAIL}
            </a>
            <button type="button" onClick={() => setState('idle')} className="mt-4 block w-full text-xs underline" style={{ color: `${PARCHMENT}99` }}>
              Back to the form
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: FOREST }}>
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-6 pt-24">
          <div data-testid="contact-success" className="max-w-md rounded-2xl p-10 text-center" style={{ border: `1px solid ${GOLD}33` }}>
            <div className="mb-4 text-4xl">✉️</div>
            <h2 className="font-serif text-2xl font-bold" style={{ color: PARCHMENT }}>Message received.</h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: `${PARCHMENT}bb` }}>
              Thank you for reaching out. Our team reviews messages and responds to appropriate inquiries. We appreciate your patience.
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: FOREST }}>
      <Navbar />
      <main className="flex-1 pt-24">
        <section className="py-20" style={{ backgroundColor: FOREST }}>
          <div className="mx-auto max-w-2xl px-6 lg:px-10">
            <div className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>Contact</div>
            <h1 className="mt-4 font-serif text-4xl font-bold" style={{ color: PARCHMENT }}>Get in touch</h1>
            <p className="mt-4 text-lg leading-relaxed" style={{ color: `${PARCHMENT}bb` }}>
              Questions, bug reports, and suggestions welcome. All messages are reviewed by a human team member.
            </p>
          </div>
        </section>

        <section style={{ backgroundColor: NAVY }}>
          <div className="mx-auto max-w-2xl px-6 py-16 lg:px-10">
            <form onSubmit={handleSubmit} className="space-y-6" data-testid="contact-form" noValidate>
              {/* Category */}
              <fieldset>
                <legend className="mb-3 block text-sm font-semibold uppercase tracking-widest" style={{ color: GOLD }}>Category</legend>
                <div className="flex gap-2">
                  {CATEGORIES.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCategory(value)}
                      aria-pressed={category === value}
                      data-testid={`category-${value}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition-colors"
                      style={category === value ? { backgroundColor: GOLD, color: FOREST } : { border: `1px solid ${GOLD}44`, color: PARCHMENT }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Name */}
              <div>
                <label htmlFor="contact-name" className="mb-2 block text-sm font-semibold uppercase tracking-widest" style={{ color: GOLD }}>Name</label>
                <input
                  id="contact-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name (optional)"
                  autoComplete="name"
                  className="w-full rounded-xl px-4 py-3 text-base focus:outline-none"
                  style={{ backgroundColor: 'rgba(245,240,232,0.06)', border: `1px solid ${GOLD}55`, color: PARCHMENT }}
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="contact-email" className="mb-2 block text-sm font-semibold uppercase tracking-widest" style={{ color: GOLD }}>Email <span aria-hidden="true">*</span></label>
                <input
                  id="contact-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.org"
                  autoComplete="email"
                  required
                  className="w-full rounded-xl px-4 py-3 text-base focus:outline-none"
                  style={{ backgroundColor: 'rgba(245,240,232,0.06)', border: `1px solid ${GOLD}55`, color: PARCHMENT }}
                />
              </div>

              {/* Subject */}
              <div>
                <label htmlFor="contact-subject" className="mb-2 block text-sm font-semibold uppercase tracking-widest" style={{ color: GOLD }}>Subject</label>
                <input
                  id="contact-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief subject line"
                  className="w-full rounded-xl px-4 py-3 text-base focus:outline-none"
                  style={{ backgroundColor: 'rgba(245,240,232,0.06)', border: `1px solid ${GOLD}55`, color: PARCHMENT }}
                />
              </div>

              {/* Body */}
              <div>
                <label htmlFor="contact-body" className="mb-2 block text-sm font-semibold uppercase tracking-widest" style={{ color: GOLD }}>Message <span aria-hidden="true">*</span></label>
                <textarea
                  id="contact-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Describe your question, bug, or suggestion…"
                  rows={6}
                  required
                  maxLength={4000}
                  className="w-full resize-y rounded-xl px-4 py-3 text-base focus:outline-none"
                  style={{ backgroundColor: 'rgba(245,240,232,0.06)', border: `1px solid ${GOLD}55`, color: PARCHMENT }}
                />
                <p className="mt-1 text-right text-xs" style={{ color: `${PARCHMENT}55` }}>{body.length}/4000</p>
              </div>

              {errorMsg && (
                <p role="alert" className="text-sm" style={{ color: '#e8b4a8' }}>{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={state === 'loading'}
                data-testid="contact-submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold uppercase tracking-widest transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: GOLD, color: FOREST }}
              >
                {state === 'loading' ? 'Sending…' : 'Send message'}
              </button>

              <p className="text-center text-xs leading-relaxed" style={{ color: `${PARCHMENT}66` }}>
                All submissions are treated as untrusted user input and reviewed by a human team member before any action is taken. Messages are never passed directly to automated agents.
              </p>
            </form>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;
