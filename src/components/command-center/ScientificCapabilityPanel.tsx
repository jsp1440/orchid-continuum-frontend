import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  CAPABILITY_LABEL,
  fetchCapabilities,
  type CapabilityLoad,
  type CapabilityState,
} from '@/lib/commandCenterCapabilities';
import { evidenceLink } from '@/lib/commandCenter';

const TONE: Record<CapabilityState, string> = {
  WORKS_LIVE: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  WORKS_LOCAL_ONLY: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  NOT_SUPPORTED: 'border-red-300/30 bg-red-300/10 text-red-100',
  ABSENT: 'border-white/15 bg-white/5 text-[#cfc8b8]',
  BLOCKED: 'border-red-300/30 bg-red-300/10 text-red-100',
};

/** Scientific capability, reported separately from backend health. */
const ScientificCapabilityPanel: React.FC = () => {
  const [load, setLoad] = useState<CapabilityLoad | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCapabilities(controller.signal).then((result) => {
      if (!controller.signal.aborted) setLoad(result);
    });
    return () => controller.abort();
  }, []);

  return (
    <section className="mt-5 rounded-lg border border-white/10 bg-[#0d1d13]/90 p-4" aria-label="Scientific capability">
      <h2 className="text-lg">Scientific capability</h2>
      <p className="mt-1 text-[12px] text-[#cfc8b8]/72">
        What the platform can actually answer, not whether the server responds. Nothing is shown as working live unless it was verified live.
      </p>
      {load === null ? <p className="mt-2 text-sm">Loading…</p> : null}
      {load?.kind === 'unauthorized' ? <p role="alert" className="mt-2 text-sm text-red-100">The backend rejected this session.</p> : null}
      {load?.kind === 'error' ? (
        <p role="alert" className="mt-2 text-sm text-red-100">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          Capability unavailable: {load.message}. Nothing is shown rather than a guess.
        </p>
      ) : null}
      {load?.kind === 'ok' ? (
        <ul className="mt-3 space-y-3">
          {load.capabilities.map((c) => (
            <li key={c.id} className="rounded-md border border-white/10 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{c.question}</span>
                <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${TONE[c.state]}`}>
                  {CAPABILITY_LABEL[c.state]}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-[#cfc8b8]/80">Boundary: {c.boundary}</p>
              <p className="mt-1 text-[12px] text-[#cfc8b8]/70">Evidence: {c.evidence}</p>
              <p className="mt-1 text-[12px]">
                {c.refs.map((r) => {
                  const href = evidenceLink(r);
                  return href ? (
                    <a key={r} href={href} target="_blank" rel="noopener noreferrer" className="mr-2 text-[#d4b34a] underline">{r}</a>
                  ) : (
                    <span key={r} className="mr-2">{r}</span>
                  );
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

export default ScientificCapabilityPanel;
