import React, { useState } from 'react';
import {
  BookOpen,
  Bug,
  Camera,
  CloudSun,
  Database,
  Flower2,
  Globe2,
  Leaf,
  Network,
  Sprout,
} from 'lucide-react';

type NodeKey =
  | 'orchid'
  | 'names'
  | 'images'
  | 'occurrences'
  | 'habitat'
  | 'pollinators'
  | 'fungi'
  | 'climate'
  | 'literature'
  | 'conservation';

interface GraphNode {
  key: NodeKey;
  label: string;
  short: string;
  x: number;
  y: number;
  icon: React.ComponentType<{ className?: string }>;
  story: string;
}

const NODES: GraphNode[] = [
  {
    key: 'orchid',
    label: 'Orchid',
    short: 'The living plant',
    x: 300,
    y: 250,
    icon: Flower2,
    story:
      'The orchid is the starting point, but it is not the whole story. Each species is connected to names, places, images, habitats, pollinators, fungi, climate, literature, and conservation decisions.',
  },
  {
    key: 'names',
    label: 'Names',
    short: 'Identity through time',
    x: 300,
    y: 72,
    icon: Leaf,
    story:
      'Orchid names change as science changes. A plant described a century ago may have been renamed, moved, split, or merged several times. The Continuum keeps those names connected so old records still point to today’s understanding.',
  },
  {
    key: 'images',
    label: 'Images',
    short: 'Photos as evidence',
    x: 492,
    y: 130,
    icon: Camera,
    story:
      'A photograph is more than a picture. It can show where an orchid was found, when it flowered, what traits were visible, and what habitat surrounded it.',
  },
  {
    key: 'occurrences',
    label: 'Occurrences',
    short: 'Where orchids live',
    x: 540,
    y: 315,
    icon: Globe2,
    story:
      'Every observation is a moment in space and time. Together, occurrence records show where orchids live, when they flower, and whether their ranges are stable, shifting, fragmented, or disappearing.',
  },
  {
    key: 'habitat',
    label: 'Habitat',
    short: 'The ecological stage',
    x: 420,
    y: 455,
    icon: Network,
    story:
      'Habitat is where orchid relationships become visible: cloud forests, grasslands, wetlands, canopy branches, dry forests, bogs, cliffs, and Mediterranean shrublands all shape which orchids, fungi, pollinators, and climates occur together.',
  },
  {
    key: 'pollinators',
    label: 'Pollinators',
    short: 'Animal partners',
    x: 180,
    y: 455,
    icon: Bug,
    story:
      'Many orchids depend on particular pollinators. Some share pollinators, while others divide them through fragrance, timing, flower shape, or reward chemistry.',
  },
  {
    key: 'fungi',
    label: 'Fungi',
    short: 'Germination partners',
    x: 60,
    y: 315,
    icon: Sprout,
    story:
      'Orchid seeds contain very little stored food and usually depend on mycorrhizal fungi to germinate, whether they land in soil, moss, bark, leaf litter, or a tree canopy.',
  },
  {
    key: 'climate',
    label: 'Climate',
    short: 'Conditions through time',
    x: 108,
    y: 130,
    icon: CloudSun,
    story:
      'Temperature, rainfall, fog, humidity, elevation, seasonality, and day length help explain where orchids and their partners can survive now — and where they may survive in the future.',
  },
  {
    key: 'literature',
    label: 'Literature',
    short: 'Scientific memory',
    x: 300,
    y: 520,
    icon: BookOpen,
    story:
      'Scientific papers, books, field reports, society newsletters, and historical descriptions are the memory of orchid science. The Continuum connects those observations to names, places, images, traits, and relationships.',
  },
  {
    key: 'conservation',
    label: 'Conservation',
    short: 'Protecting relationships',
    x: 300,
    y: 250,
    icon: Database,
    story:
      'Conservation decisions become stronger when they are connected to identity, habitat, pollinators, fungi, climate, geography, images, and literature.',
  },
];

const EDGES: Array<[NodeKey, NodeKey, string]> = [
  ['orchid', 'names', 'identity'],
  ['orchid', 'images', 'evidence'],
  ['orchid', 'occurrences', 'place + time'],
  ['orchid', 'habitat', 'community'],
  ['orchid', 'pollinators', 'reproduction'],
  ['orchid', 'fungi', 'germination'],
  ['orchid', 'climate', 'survival'],
  ['orchid', 'literature', 'knowledge'],
  ['names', 'literature', 'old names'],
  ['names', 'images', 'ID clues'],
  ['images', 'occurrences', 'photo location'],
  ['occurrences', 'climate', 'range + climate'],
  ['occurrences', 'habitat', 'where habitat occurs'],
  ['habitat', 'pollinators', 'shared habitat'],
  ['habitat', 'fungi', 'shared habitat'],
  ['habitat', 'climate', 'climate shapes habitat'],
  ['pollinators', 'climate', 'climate affects pollinators'],
  ['fungi', 'climate', 'moisture + temperature'],
  ['literature', 'pollinators', 'pollination studies'],
  ['literature', 'fungi', 'mycorrhiza studies'],
  ['literature', 'habitat', 'field reports'],
  ['literature', 'conservation', 'evidence for action'],
  ['conservation', 'habitat', 'protect habitat'],
  ['conservation', 'occurrences', 'where protection matters'],
];

const DATA_SOURCES = [
  {
    label: 'GBIF',
    detail: 'Global biodiversity occurrence records',
  },
  {
    label: 'iNaturalist',
    detail: 'Field observations and living photographs',
  },
  {
    label: 'EOL',
    detail: 'Traits, images, and species information',
  },
  {
    label: 'World Plants',
    detail: 'Taxonomy, names, distributions, and synonyms',
  },
  {
    label: 'BHL',
    detail: 'Historic books, plates, and orchid literature',
  },
  {
    label: 'Literature',
    detail: 'Pollination, fungi, ecology, conservation, and morphology',
  },
];

function nodeByKey(key: NodeKey): GraphNode {
  return NODES.find((n) => n.key === key)!;
}

const TheKnowledgeGraph: React.FC = () => {
  const [active, setActive] = useState<NodeKey>('orchid');
  const activeNode = nodeByKey(active);
  const ActiveIcon = activeNode.icon;

  return (
    <section
      id="the-knowledge-graph"
      className="relative border-y border-white/[0.06] overflow-hidden"
      style={{ background: '#0d2535' }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-90"
        style={{
          background:
            'radial-gradient(ellipse at 20% 10%, rgba(212,179,74,0.14) 0%, transparent 48%),' +
            'radial-gradient(ellipse at 82% 70%, rgba(74,134,150,0.18) 0%, transparent 52%)',
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="flex items-center gap-3">
              <span
                className="inline-block w-8 h-px"
                style={{ background: 'rgba(212,179,74,0.6)' }}
              />
              <span
                className="font-mono uppercase"
                style={{
                  fontSize: 13,
                  letterSpacing: '0.36em',
                  color: '#d4b34a',
                  fontWeight: 600,
                }}
              >
                The Knowledge Graph
              </span>
            </div>

            <h2
              className="mt-7"
              style={{
                fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontSize: 'clamp(2.25rem, 4.5vw, 3.35rem)',
                fontWeight: 700,
                color: '#f0ebe0',
                lineHeight: 1.12,
              }}
            >
              Orchid knowledge becomes powerful when the connections are visible.
            </h2>

            <div
              className="mt-8 space-y-5"
              style={{
                fontFamily: '"Cormorant Garamond",Georgia,serif',
                color: '#f0ebe0',
                fontSize: 'clamp(1.12rem, 1.5vw, 1.28rem)',
                fontWeight: 400,
                lineHeight: 1.78,
              }}
            >
              <p>
                Orchid science is scattered across names, images, occurrence
                records, field notes, pollination studies, fungal associations,
                climate data, conservation records, and more than two centuries
                of literature.
              </p>

              <p>
                A knowledge graph does not simply store those facts. It connects
                them. A photograph can connect to a species name, a location, a
                flowering date, a habitat, a pollinator, a paper, and a
                conservation question.
              </p>

              <p style={{ fontWeight: 600, color: '#ffffff' }}>
                When those links are connected, the Orchid Continuum becomes a
                scientific intelligence system: not just a collection of
                databases, but a way to ask better questions about orchid life
                on Earth.
              </p>
            </div>

            <div className="mt-8 grid sm:grid-cols-2 gap-3">
              {DATA_SOURCES.map((source) => (
                <div
                  key={source.label}
                  className="rounded-2xl border border-[#d4b34a]/20 bg-white/[0.04] p-4"
                >
                  <div className="font-mono text-[11px] tracking-[0.22em] uppercase text-[#d4b34a]">
                    {source.label}
                  </div>
                  <div className="mt-2 text-[#e7dfd1] text-[15px] leading-[1.5]">
                    {source.detail}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-[#d4b34a]/25 bg-white/[0.04] p-5">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#d4b34a]">
                <ActiveIcon className="h-4 w-4" />
                Selected node
              </div>

              <h3
                className="mt-3 text-[#faf7f2]"
                style={{
                  fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                  fontSize: 'clamp(1.45rem, 2.2vw, 2rem)',
                  lineHeight: 1.2,
                }}
              >
                {activeNode.label}
              </h3>

              <p className="mt-3 text-[#e7dfd1] text-[16px] leading-[1.7]">
                {activeNode.story}
              </p>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-[2rem] border border-white/[0.08] bg-[#071b27]/72 p-4 md:p-6 shadow-2xl shadow-black/25">
              <svg
                viewBox="0 0 600 590"
                className="w-full h-auto"
                role="img"
                aria-label="Connected orchid knowledge graph"
              >
                <defs>
                  <filter id="oc-node-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {EDGES.map(([from, to, label], index) => {
                  const a = nodeByKey(from);
                  const b = nodeByKey(to);
                  const isActive = from === active || to === active;

                  return (
                    <g key={`${from}-${to}-${index}`}>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={isActive ? '#d4b34a' : '#6b8a76'}
                        strokeWidth={isActive ? 2.5 : 1.1}
                        strokeOpacity={isActive ? 0.9 : 0.26}
                      />

                      {isActive && (
                        <text
                          x={(a.x + b.x) / 2}
                          y={(a.y + b.y) / 2 - 6}
                          textAnchor="middle"
                          fill="#f0d97a"
                          fontSize="8.5"
                          letterSpacing="0.08em"
                          style={{ textTransform: 'uppercase' }}
                        >
                          {label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {NODES.map((node) => {
                  const Icon = node.icon;
                  const isActive = node.key === active;
                  const isCenter = node.key === 'orchid';

                  return (
                    <g
                      key={node.key}
                      transform={`translate(${node.x}, ${node.y})`}
                      onClick={() => setActive(node.key)}
                      onMouseEnter={() => setActive(node.key)}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle
                        r={isCenter ? 62 : 46}
                        fill={isActive ? '#d4b34a' : isCenter ? '#1f3622' : '#123522'}
                        stroke={isActive ? '#f0d97a' : '#6b8a76'}
                        strokeWidth={isActive ? 2.5 : 1.2}
                        strokeOpacity={isActive ? 1 : 0.68}
                        filter={isActive ? 'url(#oc-node-glow)' : undefined}
                      />

                      <foreignObject
                        x={isCenter ? -58 : -42}
                        y={isCenter ? -48 : -38}
                        width={isCenter ? 116 : 84}
                        height={isCenter ? 96 : 76}
                      >
                        <div
                          className="h-full w-full flex flex-col items-center justify-center text-center px-1"
                          style={{ color: isActive ? '#14281c' : '#f0ebe0' }}
                        >
                          <Icon className={isCenter ? 'h-7 w-7' : 'h-5 w-5'} />

                          <div
                            className="mt-1 font-mono uppercase leading-tight"
                            style={{
                              fontSize: isCenter ? 10 : 8.5,
                              letterSpacing: '0.12em',
                              fontWeight: 700,
                            }}
                          >
                            {node.label}
                          </div>

                          <div
                            className="mt-0.5 leading-tight opacity-80"
                            style={{ fontSize: isCenter ? 9 : 7.5 }}
                          >
                            {node.short}
                          </div>
                        </div>
                      </foreignObject>
                    </g>
                  );
                })}
              </svg>
            </div>

            <p className="mt-4 text-center text-[#cfc8b8]/75 text-[14px] leading-[1.6]">
              Hover or tap a node. Gold lines show example relationships. Not
              every node connects to every other node — only biologically
              meaningful edges belong in the graph.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TheKnowledgeGraph;
