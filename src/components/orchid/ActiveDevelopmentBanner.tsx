import React, { useState } from 'react';
import { X, Construction, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'oc-dev-banner-dismissed';

/**
 * Prominent homepage notice: Orchid Continuum is in active development.
 * Dismissible per browser session; always visible on a fresh visit.
 * Satisfies PUBLIC-LAUNCH-001 (#679).
 *
 * Donation CTA: links to /get-involved (the verified official path).
 * A direct donation URL is owner-gated and is NOT rendered here until
 * explicitly configured.
 */
const ActiveDevelopmentBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore — storage may be blocked */
    }
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div
      role="banner"
      aria-label="Active development notice"
      data-testid="dev-banner"
      className="relative z-50 w-full"
      style={{ backgroundColor: '#0d2535', borderBottom: '1px solid rgba(201,168,76,0.35)' }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 lg:px-10">
        {/* Icon + message */}
        <div className="flex items-start gap-3 sm:items-center">
          <Construction
            className="mt-0.5 h-5 w-5 shrink-0 sm:mt-0"
            aria-hidden="true"
            style={{ color: '#C9A84C' }}
          />
          <p className="text-sm leading-relaxed" style={{ color: '#f5f0e8' }}>
            <span className="font-semibold" style={{ color: '#C9A84C' }}>
              Orchid Continuum is in active development.
            </span>{' '}
            Most features are still being built and tested; capabilities will be
            announced as they become available. Progress is sustained by a
            nonprofit mission — not a commercial product schedule.
          </p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-3">
          <Link
            to="/get-involved"
            data-testid="dev-banner-donate-cta"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              backgroundColor: '#C9A84C',
              color: '#1a2e1a',
              focusRingColor: '#C9A84C',
            }}
            aria-label="Support Orchid Continuum"
          >
            <Heart className="h-3.5 w-3.5" aria-hidden="true" />
            Support Our Work
          </Link>

          <button
            type="button"
            onClick={dismiss}
            data-testid="dev-banner-dismiss"
            className="rounded-full p-1.5 transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ color: '#f5f0e8' }}
            aria-label="Dismiss active development notice"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActiveDevelopmentBanner;
