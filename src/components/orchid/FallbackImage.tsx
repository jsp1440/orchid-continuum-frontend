import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface FallbackImageProps {
  urls: string[];
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  shimmer?: boolean;
  onSettled?: (success: boolean) => void;
}

const FallbackImage: React.FC<FallbackImageProps> = ({
  urls,
  alt,
  className,
  loading = 'eager',
  shimmer = true,
  onSettled,
}) => {
  const cleanUrls = useMemo(
    () => (urls || []).map((u) => u.trim()).filter(Boolean),
    [urls],
  );

  const urlsKey = cleanUrls.join('|');
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const settledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    settledRef.current = false;
    setResolvedSrc(null);
    setLoaded(false);

    const settle = (success: boolean) => {
      if (settledRef.current || cancelled) return;
      settledRef.current = true;
      onSettled?.(success);
    };

    if (cleanUrls.length === 0) {
      settle(false);
      return () => {
        cancelled = true;
      };
    }

    let index = 0;

    const tryNext = () => {
      if (cancelled) return;

      if (index >= cleanUrls.length) {
        setResolvedSrc(null);
        setLoaded(false);
        settle(false);
        return;
      }

      const src = cleanUrls[index];
      const img = new Image();

      img.onload = () => {
        if (cancelled) return;
        setResolvedSrc(src);
        setLoaded(true);
        settle(true);
      };

      img.onerror = () => {
        index += 1;
        tryNext();
      };

      img.src = src;
    };

    tryNext();

    return () => {
      cancelled = true;
    };
  }, [urlsKey]);

  if (!resolvedSrc) {
    return shimmer ? (
      <div className="absolute inset-0 overflow-hidden bg-[#e7e0cf]" aria-hidden="true">
        <div className="oc-shimmer absolute inset-0" />
      </div>
    ) : null;
  }

  return (
    <img
      key={resolvedSrc}
      src={resolvedSrc}
      alt={alt}
      loading={loading}
      className={className}
      style={{ opacity: loaded ? 1 : 0, transition: 'opacity 600ms ease' }}
    />
  );
};

export default FallbackImage;
