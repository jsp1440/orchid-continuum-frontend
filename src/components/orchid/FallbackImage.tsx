import React, { useEffect, useMemo, useRef, useState } from 'react';
import { filterRankUrls } from '@/lib/imageQuality';

export interface FallbackImageProps {
  urls: string[];
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  shimmer?: boolean;
  onSettled?: (success: boolean) => void;
}

const LOAD_TIMEOUT_MS = 9000;

/**
 * Final safety net for living-orchid image surfaces.
 *
 * Upstream components should already send curated image URLs, but cached backend
 * rows can drift. This component therefore re-runs the central homepage image
 * quality filter before rendering anything. That keeps herbarium sheets,
 * specimen labels, scanned plates, logos, document files, placeholders, and
 * society graphics out of the public photo surfaces even if a stale URL slips
 * through a feature-specific component.
 */
const FallbackImage: React.FC<FallbackImageProps> = ({
  urls,
  alt,
  className,
  loading = 'eager',
  shimmer = true,
  onSettled,
}) => {
  const cleanUrls = useMemo(
    () => filterRankUrls(urls || [], { title: alt, description: alt }),
    [urls, alt],
  );

  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const settledRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const src = cleanUrls[index];

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const settle = (success: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettled?.(success);
  };

  const advance = () => {
    clearTimer();
    setLoaded(false);

    setIndex((current) => {
      const next = current + 1;
      if (next >= cleanUrls.length) {
        setExhausted(true);
        settle(false);
        return current;
      }
      return next;
    });
  };

  useEffect(() => {
    setIndex(0);
    setLoaded(false);
    setExhausted(cleanUrls.length === 0);
    settledRef.current = false;
    clearTimer();

    if (cleanUrls.length === 0) {
      settle(false);
    }

    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanUrls.join('|')]);

  useEffect(() => {
    clearTimer();
    setLoaded(false);

    if (!src || exhausted) return;

    timerRef.current = window.setTimeout(() => {
      advance();
    }, LOAD_TIMEOUT_MS);

    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, exhausted]);

  if (!src || exhausted) return null;

  return (
    <>
      {shimmer && !loaded && (
        <div className="absolute inset-0 overflow-hidden bg-[#e7e0cf]" aria-hidden="true">
          <div className="oc-shimmer absolute inset-0" />
        </div>
      )}

      <img
        key={src}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        className={className}
        onLoad={() => {
          clearTimer();
          setLoaded(true);
          settle(true);
        }}
        onError={advance}
      />
    </>
  );
};

export default FallbackImage;
