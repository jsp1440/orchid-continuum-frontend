import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BACKEND_BASE_URL } from '@/lib/backendConfig';

/**
 * BackendHealthBadge
 * ------------------
 * A small backend health indicator for the "Database diagnostics" panel in the
 * homepage Living Atlas section. It pings the Render FastAPI backend ONCE on
 * mount and reports one of three states:
 *
 *   • Green dot + "LIVE"    — backend responded normally (≤ 3s)
 *   • Yellow dot + "SLOW"   — response time exceeded 3s (but arrived within 8s)
 *   • Red dot + "OFFLINE"   — no response within the 8s timeout
 *
 * Styling matches the existing diagnostics panel: gold (#C9A84C) text, dark
 * translucent background, small-caps monospace.
 */

const BACKEND_ORIGIN = BACKEND_BASE_URL;
const SLOW_MS = 3000;
const TIMEOUT_MS = 8000;

type Health = 'checking' | 'live' | 'slow' | 'offline';

const META: Record<Health, { dot: string; label: string }> = {
  checking: { dot: '#a8a29e', label: 'Checking' },
  live: { dot: '#22c55e', label: 'Live' },
  slow: { dot: '#eab308', label: 'Slow' },
  offline: { dot: '#ef4444', label: 'Offline' },
};

const BackendHealthBadge: React.FC = () => {
  const [health, setHealth] = useState<Health>('checking');

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const started = performance.now();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    // A lightweight GET against the API root / health surface. We treat any
    // HTTP response (even non-2xx) as "the server is up and answering"; only a
    // network failure or the 8s timeout counts as OFFLINE.
    fetch(`${BACKEND_ORIGIN}/api/species/search?genus=Cattleya&limit=1`, {
      signal: ctrl.signal,
      cache: 'no-store',
    })
      .then(() => {
        if (cancelled) return;
        const elapsed = performance.now() - started;
        setHealth(elapsed > SLOW_MS ? 'slow' : 'live');
      })
      .catch(() => {
        if (cancelled) return;
        setHealth('offline');
      })
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  const meta = META[health];

  return (
    <span
      className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#04050d]/70 px-2.5 py-1"
      role="status"
      aria-live="polite"
      title={`Render FastAPI backend · ${meta.label}`}
    >
      {health === 'checking' ? (
        <Loader2 className="h-3 w-3 animate-spin text-[#c9a24a]" />
      ) : (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: meta.dot, boxShadow: `0 0 5px ${meta.dot}` }}
        />
      )}
      <span className="font-mono text-[9px] tracking-[0.26em] uppercase text-[#C9A84C]">
        {meta.label}
      </span>
    </span>
  );
};

export default BackendHealthBadge;
