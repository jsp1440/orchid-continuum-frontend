import React, { useEffect, useRef, useState } from 'react';

/**
 * ContinuumThread — the line the visitor follows.
 *
 * The redesigned homepage follows one orchid outward, and this is the thread it
 * is followed along. It leaves the hero photograph, crosses into the first
 * relationship, and terminates on the partner that relationship is about. It is
 * one continuous filament rendered in segments, not an ornament repeated for
 * decoration: every segment sits on the path between two things that are
 * actually connected.
 *
 * The form is borrowed from the biology it introduces — a fungal hypha is a
 * thread, and the orchid's first relationship arrives as one.
 *
 * Motion: the filament draws itself once, when it first scrolls into view.
 * Under `prefers-reduced-motion` it is simply already drawn.
 */

interface ContinuumThreadProps {
  /** Rendered height. The filament stretches to fill it. */
  className?: string;
  /** Soften the first pixels so the segment reads as continuing from above. */
  fadeTop?: boolean;
  /** Soften the last pixels so the segment reads as continuing below. */
  fadeBottom?: boolean;
  /** Draw a small node where the thread lands. */
  endpoint?: boolean;
  /** Screen-reader description of what this segment connects. */
  label?: string;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

const ContinuumThread: React.FC<ContinuumThreadProps> = ({
  className = 'h-24',
  fadeTop = false,
  fadeBottom = false,
  endpoint = false,
  label,
}) => {
  const reducedMotion = usePrefersReducedMotion();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setDrawn(true);
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    if (typeof IntersectionObserver === 'undefined') {
      setDrawn(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setDrawn(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const maskId = React.useId();

  return (
    <div
      ref={hostRef}
      className={`pointer-events-none relative mx-auto w-10 ${className}`}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg
        viewBox="0 0 40 200"
        preserveAspectRatio="none"
        className="h-full w-full"
        focusable="false"
      >
        <defs>
          <linearGradient id={`${maskId}-fade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity={fadeTop ? 0 : 1} />
            <stop offset="14%" stopColor="white" stopOpacity="1" />
            <stop offset="86%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity={fadeBottom ? 0 : 1} />
          </linearGradient>
          <mask id={`${maskId}-mask`}>
            <rect x="0" y="0" width="40" height="200" fill={`url(#${maskId}-fade)`} />
          </mask>
        </defs>

        <g mask={`url(#${maskId}-mask)`}>
          {/* The filament. A slight drift, because nothing in a root system is plumb. */}
          <path
            d="M20 0 C 20 46, 13 70, 15 100 C 17 132, 24 152, 20 200"
            fill="none"
            stroke="#d4b34a"
            strokeOpacity="0.55"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            pathLength={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: drawn ? 0 : 1,
              transition: reducedMotion ? undefined : 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </g>

      </svg>

      {/* Rendered as an element rather than an SVG circle: the viewBox is
          stretched vertically, which would flatten a circle into an ellipse. */}
      {endpoint && (
        <span
          className="absolute bottom-0 left-1/2 h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-[#d4b34a]"
          style={{
            opacity: drawn ? 0.9 : 0,
            transition: reducedMotion ? undefined : 'opacity 0.5s ease 1.1s',
          }}
        />
      )}
    </div>
  );
};

export default ContinuumThread;
