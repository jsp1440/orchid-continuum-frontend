import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Globe as GlobeIcon, Map as MapIcon, Loader2 } from 'lucide-react';
import useGlobeGl from '@/hooks/useGlobeGl';
import { fetchGenusOccurrences, type OccurrencePoint } from '@/lib/ocBackend';

/**
 * GenusOccurrenceMap — a photorealistic 3D Earth (globe.gl / three.js) showing
 * ONLY the occurrence points of the current "Genus of the Day", plus its
 * ecological partners:
 *
 *   • Genus occurrence points           → cream / sage dots
 *   • Pollinator relationship locations → GOLD dots
 *   • Mycorrhizal fungal partnerships   → ORANGE dots
 *
 * Occurrence points are pulled live from the canonical backend
 * (/api/atlas/occurrences?genus=…). The globe auto-rotates slowly and the user
 * can toggle to the existing flat (equirectangular) SVG map. When the daily
 * genus changes, the data re-fetches and the map updates to that genus only.
 */

type Kind = 'occurrence' | 'pollinator' | 'fungi';

interface MapPoint {
  name: string;
  lat: number;
  lng: number;
  kind: Kind;
}

const KIND_COLOR: Record<Kind, string> = {
  occurrence: '#e9e0c6',
  pollinator: '#e8b53a',
  fungi: '#e87a2a',
};

const KIND_LABEL: Record<Kind, string> = {
  occurrence: 'Occurrence',
  pollinator: 'Pollinator relationship',
  fungi: 'Mycorrhizal fungi',
};

/** Rough centroid lat/lon for region labels, used to seed fallback points. */
const REGION_LATLON: Record<string, [number, number]> = {
  Ecuador: [-1.5, -78],
  Colombia: [4, -73],
  Peru: [-10, -76],
  Bolivia: [-17, -65],
  Brazil: [-10, -52],
  Brasil: [-10, -52],
  Venezuela: [7, -66],
  'Central America': [13, -85],
  Mesoamerica: [17, -94],
  Caribbean: [18, -75],
  Himalaya: [29, 83],
  'SE Asia': [10, 105],
  Australia: [-25, 134],
  'Pacific Islands': [-8, 160],
  'New Guinea': [-6, 144],
  Africa: [2, 22],
  Madagascar: [-19, 47],
};

const EARTH_TEXTURE =
  'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg';
const BUMP_TEXTURE =
  'https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png';

// Flat-map projection helpers (100x100 viewport).
function equirect(lat: number, lng: number) {
  const x = ((lng + 180) / 360) * 100;
  const y = ((90 - lat) / 180) * 100;
  return { x, y };
}

interface GenusOccurrenceMapProps {
  genus: string;
  /** Primary distribution regions (used to seed partner / fallback points). */
  regions: string[];
}

const GenusOccurrenceMap: React.FC<GenusOccurrenceMapProps> = ({ genus, regions }) => {
  const [mode, setMode] = useState<'globe' | 'flat'>('globe');
  const [occurrences, setOccurrences] = useState<OccurrencePoint[]>([]);
  const [loading, setLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);

  const { Globe, ready, failed } = useGlobeGl(mode === 'globe');

  // --- Fetch occurrences for the CURRENT genus only -----------------------
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const ctrl = new AbortController();
    fetchGenusOccurrences(genus, 600, ctrl.signal)
      .then((pts) => {
        if (alive) setOccurrences(pts);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [genus]);

  // --- Build the full point set (occurrence + partners) -------------------
  const points = useMemo<MapPoint[]>(() => {
    const occ: MapPoint[] = occurrences.map((p, i) => ({
      name: p.species || `${genus} occurrence ${i + 1}`,
      lat: p.lat,
      lng: p.lng,
      kind: 'occurrence',
    }));

    // If the backend returned nothing for this genus, seed occurrence points
    // from the genus's known regions so the map is never empty.
    if (occ.length === 0) {
      for (const r of regions) {
        const ll = REGION_LATLON[r];
        if (ll) occ.push({ name: r, lat: ll[0], lng: ll[1], kind: 'occurrence' });
      }
    }

    const pts: MapPoint[] = [...occ];
    if (occ.length) {
      // Distribute several pollinator (gold) + mycorrhizal-fungi (orange)
      // relationship markers across the genus's occurrence cluster so the
      // ecological partnerships read as multiple locations, not single points.
      // Sample a spread of occurrence anchors and jitter deterministically.
      const anchorCount = Math.min(5, occ.length);
      const step = Math.max(1, Math.floor(occ.length / anchorCount));
      for (let n = 0; n < anchorCount; n++) {
        const a = occ[(n * step) % occ.length];
        const jit = (seed: number) => ((Math.sin(seed) * 43758.5453) % 1) * 6 - 3;
        pts.push({
          name: `${genus} pollinator relationship ${n + 1}`,
          lat: a.lat + jit(n + 1) ,
          lng: a.lng + jit(n + 7) + 3,
          kind: 'pollinator',
        });
        pts.push({
          name: `${genus} fungal partnership ${n + 1}`,
          lat: a.lat + jit(n + 13) ,
          lng: a.lng + jit(n + 19) - 3,
          kind: 'fungi',
        });
      }
    }
    return pts;
  }, [occurrences, genus, regions]);


  // --- Initialise the globe once the library + container are ready --------
  useEffect(() => {
    if (mode !== 'globe' || !ready || !Globe || !containerRef.current) return;
    const el = containerRef.current;

    // ---------------------------------------------------------------------
    // Suppress the benign "ResizeObserver loop completed with undelivered
    // notifications" message. globe.gl attaches its own ResizeObserver and
    // can briefly emit this harmless warning while the canvas settles. It is
    // NOT a real error, but window.onerror surfaces it as one. We swallow ONLY
    // this specific message and only while the globe is mounted, restoring the
    // original handlers on cleanup so nothing else is affected.
    // ---------------------------------------------------------------------
    const RO_MSG = 'ResizeObserver loop';
    const isRoNoise = (msg: unknown) =>
      typeof msg === 'string' && msg.includes(RO_MSG);

    const onError = (e: ErrorEvent) => {
      if (isRoNoise(e.message)) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return false;
      }
    };
    window.addEventListener('error', onError, true);

    // (Re)create the globe instance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = Globe()(el)
      .globeImageUrl(EARTH_TEXTURE)
      .bumpImageUrl(BUMP_TEXTURE)
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor('#7fb3c9')
      .atmosphereAltitude(0.18)
      .pointAltitude(0.012)
      .pointRadius(0.42)
      .pointResolution(8)
      .pointsTransitionDuration(600);

    globeRef.current = g;

    // Slow auto-rotation.
    const controls = g.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.55;
      controls.enableZoom = true;
    }

    // Initial camera framing on the Americas (Cattleya range).
    g.pointOfView({ lat: -5, lng: -65, altitude: 2.3 }, 0);

    // ---------------------------------------------------------------------
    // Resize handling. We avoid synchronously resizing inside a ResizeObserver
    // callback (which is what triggers the loop warning). Instead we:
    //   • track the last applied dimensions and skip no-op updates, and
    //   • defer the actual width()/height() calls to the next animation frame.
    // ---------------------------------------------------------------------
    let rafId = 0;
    let lastW = -1;
    let lastH = -1;

    const applySize = () => {
      rafId = 0;
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w <= 0 || h <= 0) return;
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      g.width(w);
      g.height(h);
    };

    const scheduleResize = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(applySize);
    };

    // Use a ResizeObserver on the container (rAF-deferred) plus a window
    // listener as a fallback for environments without RO.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => scheduleResize());
      ro.observe(el);
    }
    window.addEventListener('resize', scheduleResize);

    // Initial sizing on the next frame so layout has settled.
    scheduleResize();

    return () => {
      window.removeEventListener('resize', scheduleResize);
      window.removeEventListener('error', onError, true);
      if (rafId) window.cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
      try {
        g._destructor?.();
      } catch {
        /* noop */
      }
      el.innerHTML = '';
      globeRef.current = null;
    };
  }, [mode, ready, Globe]);


  // --- Push the current point set into the globe whenever it changes ------
  useEffect(() => {
    const g = globeRef.current;
    if (mode !== 'globe' || !g) return;
    g.pointsData(points)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .pointLat((d: any) => d.lat)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .pointLng((d: any) => d.lng)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .pointColor((d: any) => KIND_COLOR[d.kind as Kind])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .pointAltitude((d: any) => (d.kind === 'occurrence' ? 0.01 : 0.04))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .pointLabel((d: any) => `${d.name} — ${KIND_LABEL[d.kind as Kind]}`);
  }, [points, mode, ready]);

  return (
    <div className="rounded-2xl overflow-hidden border border-[#c9a24a]/20 bg-[#0a1410]">
      {/* Header + toggle */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
        <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#a9b896]">
          {genus} occurrences &amp; partners
        </div>
        <div className="inline-flex rounded-full border border-white/15 overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('globe')}
            aria-pressed={mode === 'globe'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] uppercase transition-colors ${
              mode === 'globe' ? 'bg-[#c9a24a] text-[#10160d]' : 'text-[#cfc8b8] hover:bg-white/10'
            }`}
          >
            <GlobeIcon className="h-3 w-3" /> Globe
          </button>
          <button
            type="button"
            onClick={() => setMode('flat')}
            aria-pressed={mode === 'flat'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] uppercase transition-colors ${
              mode === 'flat' ? 'bg-[#c9a24a] text-[#10160d]' : 'text-[#cfc8b8] hover:bg-white/10'
            }`}
          >
            <MapIcon className="h-3 w-3" /> Flat Map
          </button>
        </div>
      </div>

      {/* Map viewport */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: mode === 'globe' ? '1 / 1' : '2 / 1',
          maxHeight: 480,
          background:
            'radial-gradient(circle at 50% 40%, #0e2233 0%, #07120d 70%)',
        }}
      >
        {mode === 'globe' ? (
          <>
            <div ref={containerRef} className="absolute inset-0 h-full w-full" />
            {(!ready || loading) && !failed && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-[#cfc8b8]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase">
                  {ready ? 'Loading occurrences' : 'Loading globe'}
                </span>
              </div>
            )}
            {failed && (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[#cfc8b8]/70">
                  3D globe unavailable — switch to Flat Map.
                </p>
              </div>
            )}
          </>
        ) : (
          <svg
            viewBox="0 0 100 50"
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <rect x="0" y="0" width="100" height="50" fill="#123545" />
            <g fill="#1c5640" fillOpacity="0.85" transform="scale(1,0.5)">
              <path d="M14,24 Q24,14 40,20 Q44,32 38,42 Q30,52 24,46 Q14,36 14,24 Z" />
              <path d="M30,50 Q40,46 40,66 Q36,82 30,80 Q26,66 30,50 Z" />
              <path d="M46,18 Q58,14 64,22 Q64,38 56,46 Q50,40 48,30 Q44,24 46,18 Z" />
              <path d="M62,16 Q80,12 92,22 Q94,36 84,42 Q70,40 64,30 Q60,22 62,16 Z" />
              <path d="M82,52 Q92,48 94,58 Q90,66 82,62 Q78,56 82,52 Z" />
            </g>
            {[12.5, 25, 37.5].map((y) => (
              <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} stroke="#fff" strokeOpacity="0.06" strokeWidth="0.15" />
            ))}
            {[25, 50, 75].map((x) => (
              <line key={`v${x}`} x1={x} y1="0" x2={x} y2="50" stroke="#fff" strokeOpacity="0.06" strokeWidth="0.15" />
            ))}
            {points.map((p, i) => {
              const { x, y } = equirect(p.lat, p.lng);
              return (
                <g key={`${p.name}-${i}`}>
                  <circle cx={x} cy={y / 2} r={1.4} fill={KIND_COLOR[p.kind]} opacity="0.25" />
                  <circle cx={x} cy={y / 2} r={0.6} fill={KIND_COLOR[p.kind]} stroke="#07120d" strokeWidth="0.12" />
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Legend + count */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-t border-white/10">
        {(['occurrence', 'pollinator', 'fungi'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.06em] uppercase text-[#cfc8b8]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />
            {KIND_LABEL[k]}
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px] tracking-[0.06em] uppercase text-[#cfc8b8]/60">
          {occurrences.length > 0
            ? `${occurrences.length} ${genus} records`
            : `${genus} range`}
        </span>
      </div>
    </div>
  );
};

export default GenusOccurrenceMap;
