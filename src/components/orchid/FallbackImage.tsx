import React, { useEffect, useRef, useState } from 'react';

/**
 * FallbackImage — an <img> that automatically advances through a prioritised
 * list of candidate URLs, with a built-in shimmer loading indicator.
 *
 * If the current URL fails to load (404, broken image, CORS, etc.) the
 * component silently tries the NEXT URL for the same species rather than
 * dropping straight to the "Image pending" placeholder. Only when EVERY
 * candidate has failed does it report failure (so the caller can render its
 * placeholder).
 *
 * While no URL has yet successfully loaded (and candidates remain), a subtle
 * animated shimmer overlay is shown so users know a photo is on its way.
 *
 * This is what fixes the three Cattleya species (labiata, trianae, mossiae)
 * that consistently showed IMAGE PENDING — their first DB URL is broken, so we
 * now skip it and use the next available image from the backend response.
 *
 * The component also reports a single "settled" event (success OR exhausted)
 * which the Genus-of-the-Day rotation engine uses to know when a slot has
 * fully finished loading — enabling one-at-a-time, no-simultaneous-swap
 * replacement.
 */
export interface FallbackImageProps {
  /** Candidate URLs in priority order. */
  urls: string[];
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** Whether to render the shimmer placeholder while loading (default true). */
  shimmer?: boolean;
  /**
   * Fires exactly once per `urls` set, when either a URL successfully loads
   * (`success = true`) or every candidate has failed (`success = false`).
   */
  onSettled?: (success: boolean) => void;
}

const FallbackImage: React.FC<FallbackImageProps> = ({
  urls,
  alt,
  className,
  loading = 'lazy',
  shimmer = true,
  onSettled,
}) => {
  const [index, setIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const settledRef = useRef(false);

  // Reset when the candidate list changes (e.g. a slot rotates to a new species).
  useEffect(() => {
    setIndex(0);
    setExhausted(false);
    setLoaded(false);
    settledRef.current = false;
    if (!urls || urls.length === 0) {
      // No candidates at all — settle immediately as a failure so the caller
      // can show its placeholder and (in the grid) treat the slot as "done".
      settledRef.current = true;
      onSettled?.(false);
      setExhausted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join('|')]);

  const settle = (success: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettled?.(success);
  };

  if (!urls || urls.length === 0 || exhausted) return null;

  const src = urls[Math.min(index, urls.length - 1)];

  return (
    <>
      {/* Shimmer loading indicator — visible until the first URL paints. */}
      {shimmer && !loaded && (
        <div
          className="absolute inset-0 overflow-hidden bg-[#e7e0cf]"
          aria-hidden="true"
        >
          <div className="oc-shimmer absolute inset-0" />
        </div>
      )}
      <img
        key={src}
        src={src}
        alt={alt}
        loading={loading}
        className={className}
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 600ms ease' }}
        onLoad={() => {
          setLoaded(true);
          settle(true);
        }}
        onError={() => {
          // Current URL is broken — try the next candidate for this species.
          setIndex((i) => {
            const next = i + 1;
            if (next >= urls.length) {
              // All candidates failed → report exhaustion, show placeholder.
              setExhausted(true);
              settle(false);
              return i;
            }
            return next;
          });
        }}
      />
    </>
  );
};

export default FallbackImage;
