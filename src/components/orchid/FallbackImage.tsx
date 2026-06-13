import React, { useEffect, useRef, useState } from 'react';

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
  const [index, setIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const settledRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setIndex(0);
    setExhausted(false);
    setLoaded(false);
    settledRef.current = false;

    if (timerRef.current) window.clearTimeout(timerRef.current);

    if (!urls || urls.length === 0) {
      settledRef.current = true;
      setExhausted(true);
      onSettled?.(false);
    }

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join('|')]);

  const settle = (success: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettled?.(success);
  };

  const advance = () => {
    setLoaded(false);
    setIndex((i) => {
      const next = i + 1;
      if (next >= urls.length) {
        setExhausted(true);
        settle(false);
        return i;
      }
      return next;
    });
  };

  if (!urls || urls.length === 0 || exhausted) return null;

  const src = urls[Math.min(index, urls.length - 1)];

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
          setLoaded(true);
          settle(true);
        }}
        onError={advance}
      />
    </>
  );
};

export default FallbackImage;
