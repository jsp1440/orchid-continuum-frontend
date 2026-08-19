import React, { useEffect, useRef, useState } from 'react';

/**
 * ContinuumThread — HOMEPAGE-SLICE-1.
 *
 * A single hairline that runs from the hero into the first relationship
 * section, drawing itself as the visitor scrolls. It is a continuity cue —
 * "this leads somewhere" — not a diagram: there are no nodes, no labels, and
 * nothing to interact with.
 *
 * Under prefers-reduced-motion the line is simply drawn in full and stays
 * there, so the structural meaning survives with the animation switched off.
 */

const ContinuumThread: React.FC = () => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    if (reduced) {
      setProgress(1);
      return;
    }
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = hostRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const span = rect.height + window.innerHeight * 0.35;
        const travelled = window.innerHeight - rect.top;
        setProgress(Math.max(0, Math.min(1, travelled / span)));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none relative h-16 bg-[#0e1611] md:h-20"
    >
      <svg
        className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 overflow-visible"
        viewBox="0 0 1 100"
        preserveAspectRatio="none"
      >
        <line x1="0.5" y1="0" x2="0.5" y2="100" stroke="#2a3a2e" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line
          x1="0.5"
          y1="0"
          x2="0.5"
          y2={100 * progress}
          stroke="#b98ce0"
          strokeWidth="1"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      </svg>
    </div>
  );
};

export default ContinuumThread;
