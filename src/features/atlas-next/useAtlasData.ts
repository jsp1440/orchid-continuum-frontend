import { useEffect, useState } from 'react';
import {
  didAtlasLoadFail,
  fetchAtlasOccurrencePoints,
  type AtlasOccurrencePoint,
} from '@/lib/orchidContinuum';

/**
 * ATLAS-NEXT — the only way records enter this Atlas.
 *
 * The Globe prototype called api.gbif.org directly from the browser, fell back
 * to a CORS proxy, and then fell back again to eighty hand-typed "biodiversity
 * hotspot" coordinates that were merged into the live results and counted in
 * the statistics bar. None of that is reused. Every mark drawn here comes from
 * the canonical `fetchAtlasOccurrencePoints()` contract, and when that contract
 * returns nothing the Atlas says so instead of drawing something.
 */

export type AtlasDataState =
  | { kind: 'loading' }
  | { kind: 'ready'; points: AtlasOccurrencePoint[] }
  | { kind: 'empty' }
  /** Transport failure. The map is blank because we could not read, which is
   *  not a statement about where orchids are. */
  | { kind: 'unavailable'; detail: string };

export function useAtlasData(): AtlasDataState {
  const [state, setState] = useState<AtlasDataState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const points = await fetchAtlasOccurrencePoints();
        if (cancelled) return;
        if (didAtlasLoadFail()) {
          setState({
            kind: 'unavailable',
            detail: 'The occurrence store did not respond after retrying.',
          });
          return;
        }
        const usable = points.filter(
          (p) =>
            Number.isFinite(p.lat) &&
            Number.isFinite(p.lng) &&
            Math.abs(p.lat) <= 90 &&
            Math.abs(p.lng) <= 180 &&
            !(p.lat === 0 && p.lng === 0), // a null island coordinate is a data error, not a place
        );
        setState(usable.length ? { kind: 'ready', points: usable } : { kind: 'empty' });
      } catch (e) {
        if (cancelled) return;
        setState({
          kind: 'unavailable',
          detail: e instanceof Error ? e.message : 'Unknown transport failure.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
