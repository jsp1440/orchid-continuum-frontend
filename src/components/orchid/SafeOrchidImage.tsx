import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';

interface SafeOrchidImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  loading?: 'eager' | 'lazy';
  onFailure?: (src: string) => void;
}

/**
 * SafeOrchidImage
 *
 * Renders only real image URLs supplied by the Orchid Continuum data layer.
 * If the browser cannot resolve the URL, it falls back to a neutral botanical
 * placeholder instead of showing a broken-image icon.
 *
 * This component does not create, generate, or substitute AI imagery.
 */
const SafeOrchidImage: React.FC<SafeOrchidImageProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  placeholderClassName = '',
  loading = 'lazy',
  onFailure,
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const cleanSrc = typeof src === 'string' && src.trim().length > 0 ? src.trim() : undefined;

  if (!cleanSrc || failed) {
    return <SafeOrchidPlaceholder failed={failed} className={placeholderClassName} />;
  }

  return (
    <img
      src={cleanSrc}
      alt={alt}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => {
        setFailed(true);
        onFailure?.(cleanSrc);
      }}
      className={className}
    />
  );
};

export const SafeOrchidPlaceholder: React.FC<{ failed?: boolean; className?: string }> = ({
  failed = false,
  className = '',
}) => (
  <div className={`absolute inset-0 flex flex-col items-center justify-center text-center px-6 ${className}`}>
    <div className="absolute inset-4 border border-[#c9a24a]/15 rounded-sm" />
    <div className="absolute inset-6 border border-[#c9a24a]/8 rounded-sm" />

    <ImageOff className="h-7 w-7 text-[#c9a24a]/40 mb-3" strokeWidth={1.2} />
    <div className="font-mono text-[10px] tracking-[0.30em] uppercase text-[#c9a24a]/70 leading-relaxed">
      {failed ? 'IMAGE_URL' : 'REAL_ORCHID_IMAGE'}
      <br />
      {failed ? '_NEEDS_REPAIR' : '_FROM_DATABASE'}
    </div>
    <div className="mt-3 font-mono text-[9px] tracking-[0.18em] uppercase text-[#5e5a4e]">
      {failed ? 'fallback active' : 'pending hydration'}
    </div>
  </div>
);

export default SafeOrchidImage;
