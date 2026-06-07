import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Leaf } from 'lucide-react';

/**
 * HeroCarousel — the large featured genus photograph.
 *
 * Data flow:
 *   fetchGenusImages(genus) → images[] → GenusDetail builds `urls` (ordered
 *   images[0].image_url, images[1].image_url, images[2].image_url, then every
 *   deeper candidate) → here.
 *
 * ROBUST RENDER STRATEGY (this is the fix):
 *   Earlier versions gated the hero behind an up-front `new Image()` preload
 *   "validation" pass. When that probe stalled or was blocked, NOTHING ever
 *   painted and the user saw only the solid dark-green container — exactly the
 *   reported bug. We now render REAL <img> layers directly into the DOM. Each
 *   layer reports onLoad / onError, so:
 *     • The first URL that actually decodes is shown immediately.
 *     • A broken layer simply marks itself failed and is skipped.
 *     • The crossfade only ever advances to a layer that has fully loaded, so
 *       every transition begins with the next image completely painted.
 *   If only one layer loads, it shows statically. If all fail, an honest empty
 *   state renders.
 */
export interface HeroCarouselProps {
  /** Candidate URLs in priority order (images[0/1/2].image_url first). */
  urls: string[];
  genus: string;
  /** True while the genus-image fetch is still in flight. */
  fetching?: boolean;
  /** Crossfade cadence in ms (default 180000 = 3 minutes). */
  intervalMs?: number;
}

const HeroCarousel: React.FC<HeroCarouselProps> = ({
  urls,
  genus,
  fetching = false,
  intervalMs = 180_000,
}) => {
  // We render the top candidates as real <img> layers (cap at 5 for the carousel).
  const layerUrls = useMemo(() => urls.slice(0, 5), [urls.join('|')]);

  // Per-layer status: 'pending' | 'loaded' | 'failed'.
  const [status, setStatus] = useState<Record<number, 'loaded' | 'failed'>>({});
  const [active, setActive] = useState(0);

  // Reset status whenever the candidate set changes (new genus).
  useEffect(() => {
    setStatus({});
    setActive(0);
  }, [layerUrls.join('|')]);

  const loadedIndices = useMemo(
    () => layerUrls.map((_, i) => i).filter((i) => status[i] === 'loaded'),
    [layerUrls, status],
  );
  const failedCount = layerUrls.filter((_, i) => status[i] === 'failed').length;
  const allSettled = layerUrls.length > 0 && layerUrls.every((_, i) => status[i]);

  // If the currently-active layer turns out to be failed, advance to the first
  // loaded layer so we always show a real photo.
  useEffect(() => {
    if (layerUrls.length === 0) return;
    if (status[active] === 'failed' && loadedIndices.length > 0) {
      setActive(loadedIndices[0]);
    }
  }, [status, active, loadedIndices, layerUrls.length]);

  // ── Slow crossfade through the LOADED photos only (each fully painted). ──
  const loadedRef = useRef(loadedIndices);
  loadedRef.current = loadedIndices;
  useEffect(() => {
    if (loadedIndices.length < 2) return;
    const id = window.setInterval(() => {
      setActive((cur) => {
        const live = loadedRef.current;
        if (live.length < 2) return cur;
        const pos = live.indexOf(cur);
        return live[(pos + 1) % live.length];
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [loadedIndices.length, intervalMs]);

  const anyLoaded = loadedIndices.length > 0;

  // Loading state — nothing has decoded yet and we're still waiting.
  if (!anyLoaded && (!allSettled || fetching) && layerUrls.length > 0) {
    return (
      <>
        {/* Keep the real <img> layers mounted so they actually fetch even while
            we show the shimmer; they reveal themselves via onLoad below. */}
        {layerUrls.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={`${genus} featured photograph ${i + 1}`}
            loading="eager"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover opacity-0"
            onLoad={() => setStatus((s) => ({ ...s, [i]: 'loaded' }))}
            onError={() => setStatus((s) => ({ ...s, [i]: 'failed' }))}
          />
        ))}
        <div className="absolute inset-0 overflow-hidden bg-[#13241a]">
          <div className="oc-shimmer absolute inset-0" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[#C9A84C]">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#C9A84C]/40">
              <Leaf className="h-5 w-5" strokeWidth={1.2} />
            </span>
            <span className="mt-3 font-mono text-[10px] tracking-[0.2em] uppercase text-[#C9A84C]">
              Loading featured photograph…
            </span>
          </div>
        </div>
      </>
    );
  }

  // Empty state — no candidates at all, or every candidate failed to decode.
  if (!anyLoaded && (layerUrls.length === 0 || failedCount >= layerUrls.length)) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#13241a] text-[#C9A84C]">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#C9A84C]/40">
          <Leaf className="h-5 w-5" strokeWidth={1.2} />
        </span>
        <span className="mt-3 font-mono text-[10px] tracking-[0.2em] uppercase text-[#C9A84C]">
          No approved photograph yet for {genus}
        </span>
      </div>
    );
  }

  // One or more loaded photos — crossfade between the loaded ones.
  return (
    <>
      {layerUrls.map((url, i) => (
        <img
          key={url}
          src={url}
          alt={`${genus} featured photograph ${i + 1}`}
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[2000ms] ease-in-out"
          style={{
            opacity: status[i] === 'loaded' && i === active ? 1 : 0,
            zIndex: i === active ? 2 : 1,
          }}
          onLoad={() => setStatus((s) => ({ ...s, [i]: 'loaded' }))}
          onError={() => setStatus((s) => ({ ...s, [i]: 'failed' }))}
        />
      ))}
    </>
  );
};

export default HeroCarousel;
