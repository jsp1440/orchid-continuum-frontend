import { useEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function getReducedMotionPreference(
  matchMedia: typeof window.matchMedia | undefined =
    typeof window === 'undefined' ? undefined : window.matchMedia,
): boolean {
  return matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => getReducedMotionPreference());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reduced;
}
