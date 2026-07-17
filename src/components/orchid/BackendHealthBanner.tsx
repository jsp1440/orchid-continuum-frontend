import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  getBackendStatus,
  subscribeBackendStatus,
  type BackendStatus,
} from '@/lib/backendStatus';

/**
 * BackendHealthBanner — a small, curator-facing diagnostic indicator pinned to
 * the bottom-right of the homepage. It reports where the "Genus of the Day"
 * data currently comes from:
 *
 *   green  · Live data     — backend responded within 2s
 *   amber  · Cached data   — backend timed out; today's localStorage cache used
 *   red    · Fallback mode — neither backend nor cache; hardcoded fallback
 *
 * Subtle by default (low opacity, small monospace text); on hover it expands
 * to reveal last ping time, cache age, and the active source. Technical feel,
 * semi-transparent dark background — not a user-facing feature.
 */

function useBackendStatus(): BackendStatus {
  return useSyncExternalStore(subscribeBackendStatus, getBackendStatus, getBackendStatus);
}

function ago(ts: number | null, now: number): string {
  if (!ts) return '—';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

const META: Record<
  BackendStatus['source'],
  { dot: string; label: string }
> = {
  live: { dot: '#22c55e', label: 'Live data' },
  cache: { dot: '#f59e0b', label: 'Cached data' },
  fallback: { dot: '#ef4444', label: 'Fallback mode' },
  pending: { dot: '#a8a29e', label: 'Connecting…' },
};

const BackendHealthBanner: React.FC = () => {
  const status = useBackendStatus();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Keep the relative "ago" labels fresh while expanded.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  const meta = META[status.source] ?? META.pending;

  return (
    <div
      className="fixed bottom-3 right-3 z-[60] select-none"
      style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
      role="status"
      aria-live="polite"
    >
      <div
        className={`rounded-md border border-white/10 bg-[#10160d]/90 backdrop-blur-sm shadow-lg transition-all duration-200 ${
          open ? 'opacity-100' : 'opacity-25 hover:opacity-100'
        }`}
      >
        {/* Pill row — kept deliberately small and unobtrusive */}
        <div className="flex items-center gap-1.5 px-2 py-1">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: meta.dot,
              boxShadow: `0 0 4px ${meta.dot}`,
            }}
          />
          <span className="text-[8.5px] tracking-wide text-[#e7e3d4]/90">{meta.label}</span>
        </div>

        {/* Expanded diagnostics */}
        {open && (
          <div className="border-t border-white/10 px-2.5 py-2 text-[9.5px] leading-relaxed text-[#b9b29c] w-[176px]">
            <Row k="source" v={status.source} />
            <Row k="genus" v={status.genus ?? '—'} />
            <Row k="last ping" v={ago(status.lastPingTime, now)} />
            <Row k="cache age" v={ago(status.cacheWrittenAt, now)} />
            <div className="mt-1.5 pt-1.5 border-t border-white/10 text-[8.5px] text-[#7a7560]">
              OC backend diagnostic · curator only
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[#6f6a57]">{k}</span>
    <span className="text-[#d8d2bd] truncate max-w-[110px] text-right">{v}</span>
  </div>
);

export default BackendHealthBanner;
