import React, { useState } from 'react';
import { Mail, Send, CheckCircle2, Upload } from 'lucide-react';

/**
 * PhotoDonationForm — photograph submission form for the Partners &
 * Acknowledgements "Contribute" section.
 *
 * Fields:
 *   • Contributor name   (required)
 *   • Email address      (required)
 *   • Species name       (required)
 *   • Taxonomy notes/src  (optional)
 *   • Image URL OR file   (required — at least one)
 *
 * On submit it composes a mailto: to info@orchidcontinuum.org with the subject
 * "Orchid Continuum — Photograph Donation" and the field values in the body,
 * then shows a success confirmation. Styled to the partners design system
 * (navy card, gold accents, parchment text).
 */

const GOLD = '#C9A84C';
const PARCHMENT = '#f5f0e8';
const NAVY = '#0d2535';
const RECIPIENT = 'info@orchidcontinuum.org';
const SUBJECT = 'Orchid Continuum — Photograph Donation';

const labelStyle: React.CSSProperties = {
  color: GOLD,
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

const inputClass =
  'w-full rounded-lg px-4 py-3 text-[15px] outline-none transition-colors';
const inputStyle: React.CSSProperties = {
  backgroundColor: '#0a1a26',
  border: '1px solid rgba(201,168,76,0.25)',
  color: PARCHMENT,
};

const PhotoDonationForm: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [species, setSpecies] = useState('');
  const [notes, setNotes] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !species.trim()) {
      setError('Please complete your name, email, and the species name.');
      return;
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!imageUrl.trim() && !fileName) {
      setError('Please provide an image URL or attach an image file.');
      return;
    }

    const lines = [
      `Contributor name: ${name.trim()}`,
      `Email address: ${email.trim()}`,
      `Species name: ${species.trim()}`,
      `Taxonomy notes / source: ${notes.trim() || '(none provided)'}`,
      imageUrl.trim()
        ? `Image URL: ${imageUrl.trim()}`
        : `Image file: ${fileName} (please attach this file to the email)`,
      '',
      'Submitted via the Orchid Continuum Partners page.',
    ];
    const body = encodeURIComponent(lines.join('\n'));
    const subject = encodeURIComponent(SUBJECT);
    // Open the visitor's email client with everything pre-filled.
    window.location.href = `mailto:${RECIPIENT}?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div
        className="rounded-2xl p-8 border text-center"
        style={{ backgroundColor: NAVY, borderColor: 'rgba(201,168,76,0.35)' }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-5"
          style={{
            backgroundColor: 'rgba(201,168,76,0.12)',
            border: '1px solid rgba(201,168,76,0.3)',
            color: GOLD,
          }}
        >
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3
          className="font-serif"
          style={{ color: GOLD, fontSize: '24px', fontWeight: 700 }}
        >
          Thank you for your contribution.
        </h3>
        <p
          className="mt-4 max-w-xl mx-auto"
          style={{ color: PARCHMENT, fontSize: '17px', lineHeight: 1.75 }}
        >
          Your email client should now be open with your photograph donation
          pre-filled to {RECIPIENT}. If it did not open, please email us
          directly with the same details. Each verified image is linked to a
          confirmed species identification and a credited contributor.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="inline-flex items-center gap-2 mt-7 px-5 py-2.5 rounded-full font-medium transition-colors hover:opacity-90"
          style={{ backgroundColor: GOLD, color: NAVY, fontSize: '14px' }}
        >
          Submit another photograph
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl p-8 md:p-10 border text-left"
      style={{ backgroundColor: NAVY, borderColor: 'rgba(201,168,76,0.35)' }}
    >
      <div className="flex items-center gap-2 mb-6" style={{ color: GOLD }}>
        <Mail className="h-5 w-5" />
        <span
          style={{
            fontSize: '12px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
        >
          Photograph donation form
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="pd-name" style={labelStyle}>
            Contributor name *
          </label>
          <input
            id="pd-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} mt-2`}
            style={inputStyle}
            placeholder="Your full name"
          />
        </div>
        <div>
          <label htmlFor="pd-email" style={labelStyle}>
            Email address *
          </label>
          <input
            id="pd-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputClass} mt-2`}
            style={inputStyle}
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="pd-species" style={labelStyle}>
          Species name *
        </label>
        <input
          id="pd-species"
          type="text"
          required
          value={species}
          onChange={(e) => setSpecies(e.target.value)}
          className={`${inputClass} mt-2`}
          style={inputStyle}
          placeholder="e.g. Cattleya labiata"
        />
      </div>

      <div className="mt-5">
        <label htmlFor="pd-notes" style={labelStyle}>
          Taxonomy notes or source (optional)
        </label>
        <textarea
          id="pd-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${inputClass} mt-2 resize-y`}
          style={inputStyle}
          placeholder="Identification source, herbarium reference, observation link, etc."
        />
      </div>

      <div className="mt-5">
        <label htmlFor="pd-url" style={labelStyle}>
          Image URL or file upload *
        </label>
        <input
          id="pd-url"
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          className={`${inputClass} mt-2`}
          style={inputStyle}
          placeholder="https://… (link to your photograph)"
        />
        <div className="mt-3 flex items-center gap-3">
          <label
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg cursor-pointer transition-colors hover:opacity-90"
            style={{
              border: '1px solid rgba(201,168,76,0.4)',
              color: GOLD,
              fontSize: '13px',
            }}
          >
            <Upload className="h-4 w-4" />
            Choose image file
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
            />
          </label>
          {fileName && (
            <span style={{ color: PARCHMENT, fontSize: '13px' }}>{fileName}</span>
          )}
        </div>
        <p className="mt-2" style={{ color: 'rgba(245,240,232,0.6)', fontSize: '12px' }}>
          Provide a public image URL, or choose a file and attach it to the
          email your client opens.
        </p>
      </div>

      {error && (
        <p
          className="mt-5"
          style={{ color: '#f0a3a3', fontSize: '14px', lineHeight: 1.5 }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        className="inline-flex items-center gap-2 mt-7 px-6 py-3 rounded-full font-medium transition-colors hover:opacity-90"
        style={{ backgroundColor: GOLD, color: NAVY, fontSize: '15px' }}
      >
        <Send className="h-4 w-4" />
        Submit photograph donation
      </button>
    </form>
  );
};

export default PhotoDonationForm;
