import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Flower2,
  Bug,
  Sprout,
  CloudSun,
  Globe2,
  ShieldCheck,
  Home,
  BookOpen,
} from 'lucide-react';
import {
  fetchContinuumGraph,
  type ContinuumGraphData,
  type WebNodeData,
} from '@/lib/ocBackend';
import { useDailyGenus } from '@/lib/dailyGenusContext';

/**
 * ContinuumWeb — a LIVE knowledge-graph visualization.
 *
 * The center node is the current day's genus (GET /api/genus/daily). Around it
 * orbit seven satellite nodes, each populated from a live backend endpoint:
 * fungi, pollinators, climate, geography, conservation, cultivation, knowledge.
 * Edge thickness is proportional to record density; nodes with no data dim to a
 * muted gray-green "No data yet" state. Clicking a satellite expands its top-3
 * records; clicking the center navigates to /genus/{dailyGenus}. A traveling
 * dot animates along each edge to suggest live data flow.
 */

type NodeKey =
  | 'pollinators'
  | 'fungi'
  | 'climate'
  | 'geography'
  | 'conservation'
  | 'cultivation'
  | 'knowledge';

interface OrbitNode {
  key: NodeKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  angle: number;
  relationship: string;
  detail: string;
}

const NODES: OrbitNode[] = [
  {
    key: 'pollinators',
    label: 'Pollinators',
    icon: Bug,
    angle: -90,
    relationship: 'Orchids are connected to pollinators.',
    detail:
      'Many orchids depend on a single species of bee, moth, or fly. Lose the pollinator, and the orchid cannot reproduce.',
  },
  {
    key: 'fungi',
    label: 'Fungi',
    icon: Sprout,
    angle: -38,
    relationship: 'Every orchid depends on fungi.',
    detail:
      'An orchid seed can only germinate by partnering with mycorrhizal fungi that feed the seedling underground.',
  },
  {
    key: 'climate',
    label: 'Climate',
    icon: CloudSun,
    angle: 14,
    relationship: 'Every orchid lives within climate systems.',
    detail:
      'Temperature, humidity, and elevation decide where an orchid can survive — narrow bands that are shifting as the world warms.',
  },
  {
    key: 'geography',
    label: 'Geography',
    icon: Globe2,
    angle: 66,
    relationship: 'Orchids are written across the map of Earth.',
    detail:
      'Geography shapes which orchids exist where. Isolation on a single ridge can give rise to species found nowhere else.',
  },
  {
    key: 'conservation',
    label: 'Conservation',
    icon: ShieldCheck,
    angle: 118,
    relationship: 'Conservation requires understanding these connections.',
    detail:
      'You cannot save an orchid alone — conservation means protecting its pollinator, its fungus, its forest, and its climate together.',
  },
  {
    key: 'cultivation',
    label: 'Cultivation',
    icon: Home,
    angle: 170,
    relationship: 'Human cultivation can help preserve species.',
    detail:
      'Greenhouses and growers act as living arks, preserving genetic diversity and supplying seed for reintroduction.',
  },
  {
    key: 'knowledge',
    label: 'Knowledge',
    icon: BookOpen,
    angle: 222,
    relationship: 'Human knowledge connects every thread.',
    detail:
      'Shared records — literature, surveys, OREP extractions — turn scattered observations into a map of the living world.',
  },
];

const RADIUS = 210;
const CENTER = 280;

function nodeData(graph: ContinuumGraphData | null, key: NodeKey): WebNodeData | null {
  if (!graph) return null;
  return graph[key];
}

/** Edge weight 1–7px, scaled logarithmically against the largest node count. */
function edgeWidth(count: number | null, maxCount: number): number {
  if (!count || count <= 0) return 1;
  const ratio = Math.log(count + 1) / Math.log(maxCount + 1);
  return 1 + ratio * 6;
}

const STATUS_COLORS: Record<string, string> = {
  CR: '#e0584b',
  EN: '#e08a3c',
  VU: '#dcb13a',
  LC: '#5fae6b',
};

const ContinuumWeb: React.FC = () => {
  const navigate = useNavigate();
  // Consume the shared Genus of the Day — same genus as DailyGenusFeature,
  // SpeciesInFocus, and HomeAtlas. Never independently fetch the genus here.
  const { genus: dailyGenus, diagnostic } = useDailyGenus();
  const [graph, setGraph] = useState<ContinuumGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<NodeKey>('fungi');

  // Log the diagnostic to the browser console but never render it publicly.
  useEffect(() => {
    if (diagnostic) {
      console.warn('[ContinuumWeb] Genus-of-day diagnostic:', diagnostic);
    }
  }, [diagnostic]);

  useEffect(() => {
    const ctrl = new AbortController();
    let mounted = true;
    setLoading(true);
    fetchContinuumGraph(dailyGenus, ctrl.signal)
      .then((g) => {
        if (mounted) setGraph(g);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      ctrl.abort();
    };
  }, [dailyGenus]);

  const pos = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: CENTER + RADIUS * Math.cos(rad),
      y: CENTER + RADIUS * Math.sin(rad),
    };
  };

  const maxCount = Math.max(
    1,
    ...NODES.map((n) => nodeData(graph, n.key)?.count ?? 0),
  );

  const activeNode = NODES.find((n) => n.key === active)!;
  const activeData = nodeData(graph, active);

  const genusLabel = graph?.genus ?? 'Orchid';
  const speciesCount = graph?.speciesCount ?? null;

  const conservationColor = (key: NodeKey, isActive: boolean): string => {
    if (key === 'conservation') {
      const worst = nodeData(graph, 'conservation')?.worstStatus;
      if (worst && STATUS_COLORS[worst]) return STATUS_COLORS[worst];
    }
    return isActive ? '#d4b34a' : '#1f3622';
  };

  return (
    <section
      id="continuum-web"
      className="relative bg-[#16271a] text-[#f5f0e8] border-b border-white/[0.06] overflow-hidden"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(54,102,72,0.28) 0%, transparent 60%)',
        }}
      />
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-20 lg:py-28">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-3 font-mono text-[10px] tracking-[0.32em] uppercase text-[#c9a24a]">
            <span className="inline-block w-8 h-px bg-[#c9a24a]/60" />
            The Continuum
            <span className="inline-block w-8 h-px bg-[#c9a24a]/60" />
          </div>
          <h2
            className="mt-6 text-[#faf7f2] leading-[1.05]"
            style={{
              fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
              fontSize: 'clamp(2rem, 4.2vw, 3.4rem)',
              fontWeight: 500,
            }}
          >
            No orchid exists <span className="italic text-[#d4b34a]">alone</span>.
          </h2>
          <p className="mt-5 text-[#e7dfd1] font-body text-[16px] md:text-[18px] leading-[1.7]">
            Today's featured genus sits at the center of a live web of
            relationships drawn straight from the Orchid Continuum database.
            Touch a thread to follow the data.
          </p>
        </div>

        <div className="mt-14 grid lg:grid-cols-2 gap-12 items-center">
          {/* Interactive radial web */}
          <div className="relative flex justify-center">
            <svg
              viewBox="0 0 560 560"
              className="w-full max-w-[520px] h-auto"
              role="img"
              aria-label="Live web of orchid relationships"
            >
              {/* connecting threads (edge weight ∝ record count) + flow dots */}
              {NODES.map((n) => {
                const p = pos(n.angle);
                const d = nodeData(graph, n.key);
                const isActive = n.key === active;
                const hasData = !!d?.hasData;
                const w = hasData ? edgeWidth(d?.count ?? null, maxCount) : 1;
                return (
                  <g key={`line-${n.key}`}>
                    <line
                      x1={CENTER}
                      y1={CENTER}
                      x2={p.x}
                      y2={p.y}
                      stroke={isActive ? '#d4b34a' : hasData ? '#5a7a5f' : '#3a4a3d'}
                      strokeWidth={isActive ? Math.max(w, 2) : w}
                      strokeOpacity={isActive ? 0.95 : hasData ? 0.5 : 0.25}
                    />
                    {hasData && (
                      <circle r={isActive ? 4 : 3} fill={isActive ? '#f0d97a' : '#9fc6a4'}>
                        <animateMotion
                          dur={`${3 + (n.angle % 5) * 0.4}s`}
                          repeatCount="indefinite"
                          path={`M${CENTER},${CENTER} L${p.x},${p.y}`}
                        />
                        <animate
                          attributeName="opacity"
                          values="0;1;1;0"
                          dur={`${3 + (n.angle % 5) * 0.4}s`}
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                  </g>
                );
              })}

              {/* centre genus node (live, pulsing) */}
              <g
                onClick={() => navigate(`/genus/${encodeURIComponent(genusLabel)}`)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={60}
                  fill="#1f3622"
                  stroke="#d4b34a"
                  strokeOpacity={0.85}
                  strokeWidth={1.5}
                >
                  <animate
                    attributeName="r"
                    values="58;63;58"
                    dur="3.2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="stroke-opacity"
                    values="0.5;0.95;0.5"
                    dur="3.2s"
                    repeatCount="indefinite"
                  />
                </circle>
                <foreignObject x={CENTER - 60} y={CENTER - 60} width={120} height={120}>
                  <div className="w-full h-full flex flex-col items-center justify-center text-[#d4b34a] px-1 text-center">
                    <Flower2 className="h-6 w-6" />
                    <span
                      className="mt-1 leading-tight text-[#faf7f2] italic"
                      style={{
                        fontFamily:
                          '"Playfair Display","Cormorant Garamond",Georgia,serif',
                        fontSize: genusLabel.length > 10 ? '11px' : '13px',
                        fontWeight: 600,
                      }}
                    >
                      {genusLabel}
                    </span>
                    {speciesCount != null && (
                      <span className="mt-0.5 font-mono text-[8px] tracking-[0.12em] text-[#e7dfd1]/85">
                        {speciesCount.toLocaleString()} species
                      </span>
                    )}
                  </div>
                </foreignObject>
              </g>

              {/* orbit nodes */}
              {NODES.map((n) => {
                const p = pos(n.angle);
                const d = nodeData(graph, n.key);
                const isActive = n.key === active;
                const hasData = !!d?.hasData;
                const Icon = n.icon;
                const fill = hasData
                  ? conservationColor(n.key, isActive)
                  : '#27332a';
                const textColor = isActive
                  ? '#14281c'
                  : hasData
                    ? '#cfe0cf'
                    : '#7e8c80';
                return (
                  <g
                    key={n.key}
                    transform={`translate(${p.x}, ${p.y})`}
                    onClick={() => setActive(n.key)}
                    onMouseEnter={() => setActive(n.key)}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      r={44}
                      fill={fill}
                      stroke={isActive ? '#e6c763' : hasData ? '#5a7a5f' : '#3a4a3d'}
                      strokeWidth={1.5}
                      strokeOpacity={isActive ? 1 : hasData ? 0.55 : 0.4}
                    />
                    <foreignObject x={-44} y={-44} width={88} height={88}>
                      <div
                        className="w-full h-full flex flex-col items-center justify-center px-1 text-center"
                        style={{ color: textColor }}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="mt-0.5 font-mono text-[8px] tracking-[0.14em] uppercase leading-tight">
                          {n.label}
                        </span>
                        <span className="mt-0.5 font-mono text-[7.5px] tracking-[0.04em] leading-tight">
                          {loading ? '…' : d?.summary ?? 'No data yet'}
                        </span>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </svg>

            {/* LIVE DATA badge */}
            <div className="absolute bottom-1 right-1 inline-flex items-center gap-1.5 rounded-full bg-black/40 border border-[#d4b34a]/30 px-2.5 py-1 font-mono text-[8.5px] tracking-[0.18em] uppercase text-[#d4b34a]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d4b34a] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#d4b34a]" />
              </span>
              Live Data · Orchid Continuum DB
            </div>
          </div>

          {/* Relationship reading panel */}
          <div className="lg:pl-6">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.26em] uppercase text-[#c9a24a]">
              <activeNode.icon className="h-4 w-4" />
              {activeNode.label}
              {activeData?.hasData && activeData.summary && (
                <span className="text-[#e7dfd1]/80 normal-case tracking-normal">
                  · {activeData.summary}
                </span>
              )}
            </div>
            <h3
              className="mt-4 text-[#faf7f2] leading-snug"
              style={{
                fontFamily:
                  '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontSize: 'clamp(1.5rem, 2.6vw, 2.2rem)',
                fontWeight: 500,
              }}
            >
              {activeNode.relationship}
            </h3>
            <p className="mt-5 text-[#e7dfd1] font-body text-[16px] md:text-[17px] leading-[1.7] max-w-xl">
              {activeNode.detail}
            </p>

            {/* expanded top-3 records */}
            <div className="mt-6 max-w-xl">
              {loading ? (
                <p className="rounded-lg bg-[#1f3622]/50 border border-[#d4b34a]/15 px-4 py-3 text-[15px] text-[#cfe0cf]/80 italic">
                  Loading live data for {genusLabel}…
                </p>
              ) : activeData && activeData.hasData ? (
                activeData.items.length > 0 ? (
                  <ul className="space-y-2">
                    {activeData.items.map((item, i) => (
                      <li
                        key={`${active}-${i}`}
                        className="flex items-center gap-3 rounded-lg bg-[#1f3622]/70 border border-[#d4b34a]/20 px-4 py-2.5 text-[15px] text-[#f0ebe0]"
                      >
                        <span className="font-mono text-[10px] text-[#d4b34a]">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="leading-[1.5]">{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[15px] text-[#cfc8b8] italic">
                    {activeData.summary} recorded for {genusLabel}.
                  </p>
                )
              ) : (
                <p className="rounded-lg bg-[#27332a]/60 border border-white/10 px-4 py-3 text-[15px] text-[#9fb0a2] italic">
                  No data yet for {genusLabel} in this category.
                </p>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {NODES.map((n) => {
                const d = nodeData(graph, n.key);
                const dim = !d?.hasData;
                return (
                  <button
                    key={n.key}
                    type="button"
                    onClick={() => setActive(n.key)}
                    className={`px-3.5 py-1.5 rounded-full font-mono text-[10px] tracking-[0.18em] uppercase transition-colors ${
                      n.key === active
                        ? 'bg-[#d4b34a] text-[#14281c]'
                        : dim
                          ? 'border border-white/15 text-[#7e8c80]'
                          : 'border border-[#d4b34a]/30 text-[#e7dfd1]/85 hover:border-[#d4b34a]/70 hover:text-[#faf7f2]'
                    }`}
                  >
                    {n.label}
                  </button>
                );
              })}
            </div>

            {graph?.isFallback && (
              <p className="mt-5 font-mono text-[10px] tracking-[0.12em] uppercase text-[#9fb0a2]/70">
                Showing reference data · live feed unavailable.
              </p>
            )}
            {/* Diagnostic message is suppressed from public UI. Logged to console only. */}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContinuumWeb;
