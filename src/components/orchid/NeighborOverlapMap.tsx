import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { fetchGenusOccurrences, type OccurrencePoint } from '@/lib/ocBackend';

/**
 * NeighborOverlapMap — a flat (equirectangular) SVG world map that overlays the
 * occurrence cloud of the FOCAL genus (gold) with the occurrence clouds of its
 * co-occurring NEIGHBOUR genera, each in a distinct colour. This visualises the
 * geographic OVERLAP between the focal genus and the neighbours surfaced on the
 * /genus/:name detail page — the spatial basis for their ecological adjacency.
 *
 * Data comes only from the OC harvester occurrence endpoint
 * (fetchGenusOccurrences) — never an external API directly. Each genus is
 * fetched with a small cap so the map stays responsive; clouds that return no
 * points simply contribute nothing (their legend chip is dimmed).
 */

/** A distinct palette for neighbour clouds (focal genus is always gold). */
const NEIGHBOR_COLORS = [
  '#6cb6ff', // blue
  '#7ee0a0', // green
  '#f08ab0', // pink
  '#c79bff', // violet
  '#ff9b6c', // coral
  '#67d9d2', // teal
  '#e8d36a', // soft yellow
  '#b6d36c', // lime
];
const FOCAL_COLOR = '#e8b53a';

interface CloudSpec {
  genus: string;
  color: string;
  focal?: boolean;
}

interface ResolvedCloud extends CloudSpec {
  points: OccurrencePoint[];
}

/** Equirectangular projection into a 100 × 50 viewport. */
function equirect(lat: number, lng: number) {
  const x = ((lng + 180) / 360) * 100;
  const y = ((90 - lat) / 180) * 50;
  return { x, y };
}

interface NeighborOverlapMapProps {
  /** The focal genus whose range anchors the overlap view. */
  focalGenus: string;
  /** Neighbour genus names to overlay (in priority order). */
  neighborGenera: string[];
  /** Max neighbour clouds to draw (keeps the network + SVG light). */
  maxClouds?: number;
}

const NeighborOverlapMap: React.FC<NeighborOverlapMapProps> = ({
  focalGenus,
  neighborGenera,
  maxClouds = 6,
}) => {
  const specs = useMemo<CloudSpec[]>(() => {
    const out: CloudSpec[] = [
      { genus: focalGenus, color: FOCAL_COLOR, focal: true },
    ];
    neighborGenera.slice(0, maxClouds).forEach((g, i) => {
      out.push({ genus: g, color: NEIGHBOR_COLORS[i % NEIGHBOR_COLORS.length] });
    });
    return out;
  }, [focalGenus, neighborGenera, maxClouds]);

  const [clouds, setClouds] = useState<ResolvedCloud[]>([]);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const id = ++reqId.current;
    setLoading(true);
    setClouds([]);

    (async () => {
      const settled = await Promise.all(
        specs.map(async (s) => {
          // Focal genus gets a denser cloud; neighbours a lighter one.
          const cap = s.focal ? 280 : 140;
          const pts = await fetchGenusOccurrences(s.genus, cap, ctrl.signal);
          return { ...s, points: pts } as ResolvedCloud;
        }),
      );
      if (ctrl.signal.aborted || id !== reqId.current) return;
      setClouds(settled);
      setLoading(false);
    })();

    return () => ctrl.abort();
  }, [specs]);

  const totalPoints = clouds.reduce((n, c) => n + c.points.length, 0);

  return (
    <div className="rounded-2xl overflow-hidden border border-[#c9a24a]/20 bg-[#0a1410]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
        <div className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase text-[#a9b896]">
          <MapPin className="h-3.5 w-3.5 text-[#c9a24a]" />
          Occurrence overlap · {focalGenus} &amp; neighbours
        </div>
        <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#cfc8b8]/60">
          {totalPoints > 0 ? `${totalPoints} records` : 'mapping range'}
        </span>
      </div>

      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: '2 / 1',
          maxHeight: 460,
          background:
            'radial-gradient(circle at 50% 40%, #0e2233 0%, #07120d 70%)',
        }}
      >
        <svg
          viewBox="0 0 100 50"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <rect x="0" y="0" width="100" height="50" fill="#123545" />
          {/* Stylised land masses (decorative). */}
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

          {/* Neighbour clouds first (underneath), focal cloud on top. */}
          {[...clouds]
            .sort((a, b) => Number(a.focal) - Number(b.focal))
            .map((cloud) =>
              cloud.points.map((p, i) => {
                const { x, y } = equirect(p.lat, p.lng);
                return (
                  <g key={`${cloud.genus}-${p.id || i}`}>
                    <circle cx={x} cy={y / 2} r={cloud.focal ? 1.5 : 1.1} fill={cloud.color} opacity="0.22" />
                    <circle
                      cx={x}
                      cy={y / 2}
                      r={cloud.focal ? 0.7 : 0.5}
                      fill={cloud.color}
                      stroke="#07120d"
                      strokeWidth="0.1"
                    />
                  </g>
                );
              }),
            )}
        </svg>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-[#cfc8b8] bg-[#07120d]/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase">
              Mapping occurrence overlap
            </span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-t border-white/10">
        {clouds.map((c) => (
          <span
            key={c.genus}
            className={`inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.06em] uppercase ${
              c.points.length === 0 ? 'text-[#cfc8b8]/35' : 'text-[#cfc8b8]'
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
            {c.genus}
            {c.focal ? ' · focal' : ''}
            {c.points.length > 0 ? ` (${c.points.length})` : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

export default NeighborOverlapMap;
