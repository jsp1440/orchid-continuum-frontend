import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAtlasOccurrencePoints } from '@/lib/orchidContinuum';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import {
  MAX_POINTS_DRAWN,
  POINT_MODE_MIN_ZOOM,
  SMALL_VIEW_POINTS,
  cellDegForZoom,
  clusterPoints,
  viewportContains,
  type Cluster,
  type Viewport,
} from './geo';
import {
  fromBackendPoint,
  fromCanonicalPoint,
  matchesFilters,
  queryBackend,
  type BackendSource,
  type ExplorerFilters,
  type ExplorerOccurrence,
  type ProviderId,
} from './occurrenceProvider';

export type CalyxState =
  | { kind: 'probing' }
  | { kind: 'available' }
  | { kind: 'source-unavailable'; source: BackendSource }
  | { kind: 'unreachable'; detail: string };

export type CanonicalState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; total: number }
  | { kind: 'unavailable'; detail: string };

export interface ViewData {
  status: 'loading' | 'ready' | 'unavailable';
  provider: ProviderId | null;
  mode: 'points' | 'clusters';
  cellDeg: number | null;
  /** Locality-safe records in view. Empty when the backend answered with clusters only. */
  records: ExplorerOccurrence[];
  clusters: Cluster[];
  totalInView: number;
  totalIsExact: boolean;
  truncated: boolean;
  truncationReason: string | null;
}

const EMPTY_VIEW: ViewData = {
  status: 'loading',
  provider: null,
  mode: 'clusters',
  cellDeg: null,
  records: [],
  clusters: [],
  totalInView: 0,
  totalIsExact: true,
  truncated: false,
  truncationReason: null,
};

// The canonical store is loaded at most once per page session and projected
// through the locality policy once; every view after that is a local filter.
let canonicalPromise: Promise<ExplorerOccurrence[]> | null = null;
function loadCanonical(): Promise<ExplorerOccurrence[]> {
  if (!canonicalPromise) {
    canonicalPromise = fetchAtlasOccurrencePoints()
      .then((points) => points.map(fromCanonicalPoint).filter((p): p is ExplorerOccurrence => p !== null))
      .catch((error) => {
        canonicalPromise = null;
        throw error;
      });
  }
  return canonicalPromise;
}

function fromBackendCluster(c: {
  cell_id: string;
  latitude: number;
  longitude: number;
  count: number;
  taxon_count: number;
  top_genera: string[];
  year_min: number | null;
  year_max: number | null;
  generalised_count: number;
}): Cluster {
  return {
    cellId: c.cell_id,
    latitude: c.latitude,
    longitude: c.longitude,
    count: c.count,
    taxonCount: c.taxon_count,
    topGenera: c.top_genera,
    yearMin: c.year_min,
    yearMax: c.year_max,
    generalisedCount: c.generalised_count,
  };
}

export function viewFromRecords(
  all: readonly ExplorerOccurrence[],
  view: Viewport,
  filters: ExplorerFilters,
): ViewData {
  const inView = all.filter(
    (r) => viewportContains(view, r.decimalLatitude, r.decimalLongitude) && matchesFilters(r, filters),
  );
  const asPoints =
    inView.length <= SMALL_VIEW_POINTS || (view.zoom >= POINT_MODE_MIN_ZOOM && inView.length <= MAX_POINTS_DRAWN);
  const cellDeg = cellDegForZoom(view.zoom);
  return {
    status: 'ready',
    provider: 'canonical-store',
    mode: asPoints ? 'points' : 'clusters',
    cellDeg: asPoints ? null : cellDeg,
    records: inView,
    clusters: asPoints ? [] : clusterPoints(inView, cellDeg),
    totalInView: inView.length,
    totalIsExact: true,
    truncated: false,
    truncationReason: null,
  };
}

/**
 * Viewport-driven occurrence data with provider fallback.
 *
 * Each viewport or filter change aborts the previous backend request. If the
 * Calyx service reports no configured source or cannot be reached, the hook
 * stops asking it for the rest of the session and serves the canonical store
 * instead, recording why so the interface can say so.
 */
export function useExplorerData(view: Viewport | null, filters: ExplorerFilters) {
  const [calyx, setCalyx] = useState<CalyxState>({ kind: 'probing' });
  const [canonical, setCanonical] = useState<CanonicalState>({ kind: 'idle' });
  const [canonicalRecords, setCanonicalRecords] = useState<ExplorerOccurrence[] | null>(null);
  const [backendView, setBackendView] = useState<ViewData | null>(null);
  const calyxRef = useRef(calyx);
  calyxRef.current = calyx;

  const useBackend = calyx.kind === 'probing' || calyx.kind === 'available';

  // Backend viewport query (with cancellation).
  useEffect(() => {
    if (!view || !useBackend) return;
    const controller = new AbortController();
    queryBackend(view, filters, controller.signal, { base: CALYX_BACKEND_BASE_URL })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.kind === 'ok') {
          const r = outcome.response;
          setCalyx({ kind: 'available' });
          const records = r.points.map(fromBackendPoint).filter((p): p is ExplorerOccurrence => p !== null);
          setBackendView({
            status: 'ready',
            provider: 'calyx-viewport',
            mode: r.mode,
            cellDeg: r.cell_deg,
            records,
            clusters: r.clusters.map(fromBackendCluster),
            totalInView: r.total_in_view,
            totalIsExact: r.total_is_exact,
            truncated: r.truncated,
            truncationReason: r.truncation_reason,
          });
        } else if (outcome.kind === 'source-unavailable') {
          setCalyx({ kind: 'source-unavailable', source: outcome.source });
        } else if (calyxRef.current.kind !== 'available') {
          // A transient failure after the service has answered once keeps the
          // last good view; a failure before it ever answered falls back.
          setCalyx({ kind: 'unreachable', detail: outcome.detail });
        }
      })
      .catch((error) => {
        if ((error as { name?: string })?.name !== 'AbortError') {
          setCalyx({ kind: 'unreachable', detail: 'The Calyx Atlas service could not be reached.' });
        }
      });
    return () => controller.abort();
  }, [view, filters, useBackend]);

  // Canonical store fallback (loaded once). The start guard is a ref, not
  // state: if the effect depended on its own loading state, setting it would
  // run the cleanup and discard the result.
  const canonicalStarted = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  useEffect(() => {
    if (useBackend || canonicalStarted.current) return;
    canonicalStarted.current = true;
    setCanonical({ kind: 'loading' });
    loadCanonical()
      .then((records) => {
        if (!mounted.current) return;
        setCanonicalRecords(records);
        setCanonical(
          records.length
            ? { kind: 'ready', total: records.length }
            : { kind: 'unavailable', detail: 'The canonical occurrence store returned no drawable records.' },
        );
      })
      .catch((error) => {
        if (!mounted.current) return;
        console.error('[Atlas Explorer] canonical store load failed', error);
        setCanonical({
          kind: 'unavailable',
          detail: 'The occurrence store could not be reached. No distribution has been substituted.',
        });
      });
  }, [useBackend]);

  const viewData: ViewData = useMemo(() => {
    if (useBackend) return backendView ?? EMPTY_VIEW;
    if (canonical.kind === 'unavailable') return { ...EMPTY_VIEW, status: 'unavailable' };
    if (!canonicalRecords || !view) return EMPTY_VIEW;
    return viewFromRecords(canonicalRecords, view, filters);
  }, [useBackend, backendView, canonical.kind, canonicalRecords, view, filters]);

  return { calyx, canonical, canonicalRecords, viewData };
}
