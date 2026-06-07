import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import {
  runStartupEndpointCheck,
  probeEndpoints,
  type BackendStatus,
  type EndpointProbe,
} from '@/lib/endpointAudit';

/**
 * Slim status banner pinned at the very top of the homepage, above the
 * navigation bar. Pings the Orchid Continuum harvester backend ONCE on page
 * load and reports one of three states:
 *
 *   LIVE    → green dot  · "LIVE · Orchid Continuum database connected"
 *   SLOW    → yellow dot · "SLOW · Database responding with delays"
 *   OFFLINE → red dot    · "OFFLINE · Showing cached reference data"
 *
 * Clicking the banner opens a small detail panel listing each audited endpoint
 * (harvester species search, atlas occurrences, campaign stats) with its last
 * response status and latency. The three endpoints are probed on mount and then
 * re-probed in the background every 60 seconds, so a curator always sees a
 * freshly-refreshed view without manually reopening the panel.
 *
 * Style: navy #0d2535 background, parchment #f5f0e8 text, small caps, compact
 * single line, with a × dismiss button on the right. Dismissal is for the
 * current view only (no persistence).
 *
 * `onHeightChange` lets the parent shift the fixed navbar / page content down
 * by the banner height while it is visible.
 */

interface BackendStatusBannerProps {
  onHeightChange?: (px: number) => void;
}

const BANNER_HEIGHT = 32;
const POLL_INTERVAL_MS = 60_000;

const STATE_CONFIG: Record<
  BackendStatus | 'checking',
  { dot: string; label: string }
> = {
  checking: {
    dot: '#C9A84C',
    label: 'Checking · Contacting Orchid Continuum database',
  },
  live: {
    dot: '#2f9e44',
    label: 'LIVE · Orchid Continuum database connected',
  },
  slow: {
    dot: '#e8b923',
    label: 'SLOW · Database responding with delays',
  },
  offline: {
    dot: '#d64545',
    label: 'OFFLINE · Showing cached reference data',
  },
};

const DOT_COLOR: Record<BackendStatus, string> = {
  live: '#2f9e44',
  slow: '#e8b923',
  offline: '#d64545',
};

const STATUS_TEXT: Record<BackendStatus, string> = {
  live: 'Live',
  slow: 'Slow',
  offline: 'Offline',
};

const BackendStatusBanner: React.FC<BackendStatusBannerProps> = ({
  onHeightChange,
}) => {
  const [state, setState] = useState<BackendStatus | 'checking'>('checking');
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [probes, setProbes] = useState<EndpointProbe[]>([]);
  const [probing, setProbing] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Single overall ping + audit on page load (drives the banner headline).
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    runStartupEndpointCheck(controller.signal)
      .then((res) => {
        if (active) setState(res.status);
      })
      .catch(() => {
        if (active) setState('offline');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  // Background polling of the three audited endpoints: probe immediately on
  // mount, then re-probe every 60s so the detail panel stays continuously
  // refreshed even while closed.
  useEffect(() => {
    let active = true;
    let controller = new AbortController();

    const run = async () => {
      if (!active) return;
      setProbing(true);
      controller = new AbortController();
      const results = await probeEndpoints(controller.signal);
      if (!active) return;
      setProbes(results);
      setLastChecked(new Date());
      setProbing(false);
    };

    run();
    const id = setInterval(run, POLL_INTERVAL_MS);
    return () => {
      active = false;
      controller.abort();
      clearInterval(id);
    };
  }, []);

  // Report height to the parent so it can offset the navbar / page.
  useEffect(() => {
    onHeightChange?.(dismissed ? 0 : BANNER_HEIGHT);
  }, [dismissed, onHeightChange]);

  // Close the detail panel on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const fmtLatency = useCallback((p: EndpointProbe): string => {
    if (p.latencyMs == null) return '—';
    return `${p.latencyMs} ms`;
  }, []);

  if (dismissed) return null;

  const cfg = STATE_CONFIG[state];

  return (
    <div
      ref={containerRef}
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[60] bg-[#0d2535] text-[#f5f0e8]"
    >
      <div style={{ height: BANNER_HEIGHT }} className="relative flex items-center">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Toggle backend status detail"
          className="mx-auto flex w-full max-w-7xl items-center justify-center gap-2 px-6 lg:px-10 hover:opacity-90 transition-opacity"
        >
          <span
            className={
              'inline-block h-2 w-2 shrink-0 rounded-full ' +
              (state === 'checking' ? 'animate-pulse' : '')
            }
            style={{ backgroundColor: cfg.dot }}
            aria-hidden="true"
          />
          <span
            className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.18em] truncate"
            style={{ fontVariant: 'small-caps' }}
          >
            {cfg.label}
          </span>
          <ChevronDown
            className={
              'h-3 w-3 shrink-0 transition-transform ' + (open ? 'rotate-180' : '')
            }
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss status banner"
          className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-sm text-[#f5f0e8]/70 hover:text-[#f5f0e8] hover:bg-white/10 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full border-t border-white/10 bg-[#0d2535] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-10 py-3">
            <div className="flex items-center justify-between mb-2">
              <span
                className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#C9A84C]"
                style={{ fontVariant: 'small-caps' }}
              >
                Audited data sources
              </span>
              <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-[#f5f0e8]/55">
                {probing
                  ? 'Refreshing…'
                  : lastChecked
                    ? `Updated ${lastChecked.toLocaleTimeString()}`
                    : '—'}
              </span>
            </div>

            <ul className="divide-y divide-white/10">
              {(probes.length
                ? probes
                : [
                    { key: 'species-search', label: 'Harvester species search' },
                    { key: 'atlas-occurrences', label: 'Atlas occurrences' },
                    { key: 'campaign-stats', label: 'Campaign stats' },
                  ].map((e) => ({
                    ...e,
                    url: '',
                    status: 'live' as BackendStatus,
                    latencyMs: null,
                    httpStatus: null,
                  }))
              ).map((p) => {
                const ready = probes.length > 0;
                return (
                  <li
                    key={p.key}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: ready
                            ? DOT_COLOR[p.status]
                            : '#C9A84C',
                        }}
                        aria-hidden="true"
                      />
                      <span className="font-body text-[12px] text-[#f5f0e8] truncate">
                        {p.label}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span
                        className="font-mono text-[10px] tracking-[0.14em] uppercase"
                        style={{
                          color: ready ? DOT_COLOR[p.status] : '#C9A84C',
                        }}
                      >
                        {ready ? STATUS_TEXT[p.status] : 'Checking'}
                        {ready && p.httpStatus != null ? ` · ${p.httpStatus}` : ''}
                      </span>
                      <span className="font-mono text-[10px] text-[#f5f0e8]/65 tabular-nums w-16 text-right">
                        {ready ? fmtLatency(p) : '—'}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="mt-2 font-body text-[10px] leading-snug text-[#f5f0e8]/45">
              Re-probed automatically every 60 seconds. Latency is the last
              round-trip to the canonical harvester host.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackendStatusBanner;
