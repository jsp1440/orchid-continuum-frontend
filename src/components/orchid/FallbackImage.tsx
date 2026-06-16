import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface FallbackImageProps {
  urls: string[];
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  shimmer?: boolean;
  onSettled?: (success: boolean) => void;
}

const LOAD_TIMEOUT_MS = 9000;

// Final safety net for stale cached rows: living orchid galleries must not render
// society logos, badges, placeholders, or document-style assets as plant photos.
const NON_PHOTO_URL_RE =
  /(logo|logotipo|emblem|badge|banner|seal|watermark|placeholder|coming[\s_-]*soon|photo[\s_-]*coming[\s_-]*soon|society|club|association|asociaci[oó]n|orqu[ií]deas[\s_-]*del[\s_-]*ecuador|ecuagenera|herbarium|specimen|voucher|plate|illustration|drawing|lineart|\.pdf|\.tif|\.tiff|\.djvu|\.doc|\.docx|\.txt|\.csv)/i;

const FallbackImage: React.FC<FallbackImageProps> = ({
  urls,
  alt,
  className,
  loading = 'eager',
  shimmer = true,
  onSettled,
}) => {
  const cleanUrls = useMemo(
    () => Array.from(new Set((urls || []).map((u) => u?.trim()).filter((u): u is string => Boolean(u) && !NON_PHOTO_URL_RE.test(u)))),
    [urls],
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
