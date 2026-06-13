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
  shimmer = false,
  onSettled,
}) => {
  const cleanUrls = (urls || []).filter(Boolean);
  const [index, setIndex] = useState(0);
  const [exhausted, setExhausted] = useState(cleanUrls.length === 0);
  const settledRef = useRef(false);

  useEffect(() => {
    settledRef.current = false;
    setIndex(0);
    setExhausted(cleanUrls.length === 0);

    if (cleanUrls.length === 0) {
      settledRef.current = true;
      onSettled?.(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanUrls.join('|')]);

  const settle = (success: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettled?.(success);
  };

  if (exhausted || cleanUrls.length === 0) return null;

  const src = cleanUrls[Math.min(index, cleanUrls.length - 1)];

  return (
    <img
      key={src}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      onLoad={() => settle(true)}
      onError={() => {
        setIndex((current) => {
          const next = current + 1;

          if (next >= cleanUrls.length) {
            setExhausted(true);
            settle(false);
            return current;
          }

          return next;
        });
      }}
    />
  );
};

export default FallbackImage;
