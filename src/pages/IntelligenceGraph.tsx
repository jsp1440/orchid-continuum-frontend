/**
 * /intelligence-graph — Orchid Intelligence Graph foundation.
 *
 * A live SVG node-link visualization of the ecological knowledge graph
 * built from the database (species, genera, biomes, pollinators,
 * mycorrhizae, countries, IUCN status). Reads real edges, never invents.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Network } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import {
  fetchIntelligenceGraph,
  type GraphEdge,
  type GraphNode,
} from '@/lib/orchidContinuum';

const NODE_COLOR: Record<GraphNode['kind'], string> = {
  species: '#c9a24a',
  genus: '#deb866',
  pollinator: '#86efac',
  mycorrhiza: '#c084fc',
  biome: '#9ad6ff',
  country: '#fef3c7',
  iucn: '#ff9b6a',
};

const IntelligenceGraph: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const [filter, setFilter] = useState<GraphNode['kind'] | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    fetchIntelligenceGraph().then((g) => {
      if (!cancelled) { setGraph(g); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  // Simple radial layout grouped by kind
  const positioned = useMemo(() => {
    const W = 1200; const H = 700; const cx = W / 2; const cy = H / 2;
    const kinds: GraphNode['kind'][] = ['species', 'genus', 'biome', 'pollinator', 'mycorrhiza', 'country', 'iucn'];
    const positions = new Map<string, { x: number; y: number; node: GraphNode }>();
    kinds.forEach((kind, ringIndex) => {
      const list = graph.nodes.filter((n) => n.kind === kind);
      const radius = 80 + ringIndex * 70;
      list.forEach((node, i) => {
        const angle = (i / Math.max(1, list.length)) * Math.PI * 2;
        positions.set(node.id, {
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          node,
        });
      });
    });
    return { positions, W, H };
  }, [graph]);

  const visibleEdges = useMemo(
    () => graph.edges.filter((e) => positioned.positions.has(e.source) && positioned.positions.has(e.target)),
    [graph.edges, positioned.positions],
  );

  const visibleNodes = useMemo(
    () => Array.from(positioned.positions.values()).filter(({ node }) => filter === 'all' || node.kind === filter),
    [positioned.positions, filter],
  );

  return (
    <div className="min-h-screen bg-[#04050d] text-[#f5f0e8]" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <style>{`
        .font-display { font-family: 'Playfair Display', Georgia, serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>
      <Navbar />
      <main className="pt-20">
        <section className="max-w-[1500px] mx-auto px-6 lg:px-10 py-10">
          <Link to="/atlas" className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] mb-5">
            <ArrowLeft className="h-3.5 w-3.5" /> Atlas
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
            <div>
              <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85 mb-3">
                Orchid intelligence graph
              </div>
              <h1 className="font-display leading-[0.95]" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.4rem)' }}>
                The connected <span className="italic text-[#c9a24a]">knowledge layer</span>
              </h1>
              <p className="mt-3 max-w-2xl text-[14px] text-[#cfc8b8]/80 leading-relaxed">
                A living node-link of the Continuum's biodiversity relationships — orchids ↔
                habitats ↔ pollinators ↔ fungi ↔ countries ↔ conservation status. Every node and
                edge is derived from a real database record. Nothing is invented.
              </p>
            </div>
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/70">
              {graph.nodes.length} nodes · {graph.edges.length} edges
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {(['all', 'species', 'genus', 'biome', 'pollinator', 'mycorrhiza', 'country', 'iucn'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={[
                  'px-3 py-1 rounded-full text-[10px] tracking-[0.18em] uppercase border transition-colors font-mono',
                  filter === k
                    ? 'bg-[#c9a24a] border-[#c9a24a] text-[#14140a]'
                    : 'border-white/15 bg-white/[0.02] text-[#cfc8b8]/75 hover:border-[#c9a24a]/40',
                ].join(' ')}
              >
                {k}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/[0.08] overflow-hidden bg-[#06091a] relative">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/70">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Assembling graph…
                </div>
              </div>
            )}
            <svg viewBox={`0 0 ${positioned.W} ${positioned.H}`} className="w-full h-auto block">
              <defs>
                <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#0a1224" />
                  <stop offset="100%" stopColor="#04050d" />
                </radialGradient>
              </defs>
              <rect width={positioned.W} height={positioned.H} fill="url(#bgGrad)" />

              {visibleEdges.map((e, i) => {
                const a = positioned.positions.get(e.source)!;
                const b = positioned.positions.get(e.target)!;
                if (filter !== 'all' && a.node.kind !== filter && b.node.kind !== filter) return null;
                return (
                  <line
                    key={i}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={NODE_COLOR[a.node.kind]}
                    strokeOpacity={0.12}
                    strokeWidth={0.5}
                  />
                );
              })}

              {visibleNodes.map(({ x, y, node }) => (
                <g key={node.id}>
                  <circle
                    cx={x} cy={y}
                    r={node.kind === 'species' ? 3.5 : node.kind === 'genus' ? 6 : 4}
                    fill={NODE_COLOR[node.kind]}
                    opacity={0.85}
                  >
                    <title>{`${node.kind} · ${node.label}`}</title>
                  </circle>
                  {(node.kind === 'genus' || node.kind === 'biome' || node.kind === 'iucn') && (
                    <text x={x + 8} y={y + 3} fontSize="8" fontFamily="monospace" fill="#cfc8b8" opacity={0.7}>
                      {node.label}
                    </text>
                  )}
                </g>
              ))}
            </svg>

            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-3 font-mono text-[9px] tracking-[0.22em] uppercase text-[#cfc8b8]/70">
              <Network className="h-3 w-3 text-[#c9a24a]" />
              Live data · Orchid Continuum DB · species + atlas_occurrences + species_mycorrhizal
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-3 font-mono text-[10px] tracking-[0.18em] uppercase">
            {Object.entries(NODE_COLOR).map(([kind, color]) => (
              <span key={kind} className="inline-flex items-center gap-1.5 text-[#cfc8b8]/75">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                {kind}
              </span>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default IntelligenceGraph;
