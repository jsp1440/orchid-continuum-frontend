import { useEffect, useState } from 'react';
import { useAtlasFilters } from '@/contexts/AtlasFilterContext';
import {
  didAtlasLoadFail,
  fetchAtlasOccurrencePointsLazy,
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
 *
 * Atlas Next also consumes the shared AtlasFilterContext before records enter
 * its reasoning shell. That keeps canonical URL handoffs such as
 * `?genera=Vanilla` continuous across the current Atlas and Atlas Next without
 * inventing a second route-context format.
 */

export type AtlasDataState =
  | { kind: 'loading' }
  | { kind: 'ready'; points: AtlasOccurrencePoint[]; complete: boolean }
  | { kind: 'empty' }
  /** Transport failure. The map is blank because we could not read, which is
   *  not a statement about where orchids are. */
  | { kind: 'unavailable'; detail: string };

/** A coordinate must be real to be drawn. 0,0 is a data error, not a place. */
function usablePoints(points: AtlasOccurrencePoint[]): AtlasOccurrencePoint[] {
  return points.filter(
    (p) =>
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lng) <= 180 &&
      !(p.lat === 0 && p.lng === 0),
  );
}

export function useAtlasData(): AtlasDataState {
  const [state, setState] = useState<AtlasDataState>({ kind: 'loading' });
  const { applyTo } = useAtlasFilters();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { initial, full } = await fetchAtlasOccurrencePointsLazy();
        if (cancelled) return;

        const firstBatch = usablePoints(applyTo(initial));
        if (firstBatch.length) {
          setState({ kind: 'ready', points: firstBatch, complete: false });
        }

        const everything = usablePoints(applyTo(await full));
        if (cancelled) return;

        if (!everything.length) {
          // Nothing usable came back for the current canonical filter context.
          // Distinguish "no matching usable coordinates" from "we could not read".
          setState(
            didAtlasLoadFail()
              ? {
                  kind: 'unavailable',
                  detail: 'The occurrence store did not respond after retrying.',
                }
              : { kind: 'empty' },
          );
          return;
        }
        setState({ kind: 'ready', points: everything, complete: !didAtlasLoadFail() });
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
  }, [applyTo]);

  return state;
}
