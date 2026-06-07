import React, { useState } from 'react';

type Node = { id: string; label: string; sub: string; x: number; y: number; r: number };

const nodes: Node[] = [
  { id: 'orchid', label: 'Orchids', sub: '~30,000 species', x: 50, y: 50, r: 9 },
  { id: 'fungi', label: 'Mycorrhizal Fungi', sub: 'Symbiotic partners', x: 22, y: 30, r: 6.5 },
  { id: 'pollinators', label: 'Pollinators', sub: 'Bees, moths, flies', x: 78, y: 30, r: 6.5 },
  { id: 'climate', label: 'Climate', sub: 'Temp, humidity, light', x: 18, y: 70, r: 6 },
  { id: 'habitats', label: 'Habitats', sub: 'Canopy, forest floor', x: 82, y: 70, r: 6 },
  { id: 'people', label: 'People', sub: 'Citizens & researchers', x: 50, y: 88, r: 6 },
];

const edges = [
  ['orchid', 'fungi'],
  ['orchid', 'pollinators'],
  ['orchid', 'climate'],
  ['orchid', 'habitats'],
  ['orchid', 'people'],
  ['fungi', 'climate'],
  ['pollinators', 'habitats'],
  ['habitats', 'people'],
];

const POLLINATOR_IMG = 'https://d64gsuwffb70l.cloudfront.net/69fa6c8ae577acf1894f7208_1778019978925_ed839afd.png';

const EcoNetwork: React.FC = () => {
  const [active, setActive] = useState<string>('orchid');
  const activeNode = nodes.find(n => n.id === active)!;

  const isConnected = (a: string, b: string) =>
    a === active || b === active;

  return (
    <section id="network" className="relative py-28 bg-[#f4f1e8] overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="text-xs tracking-[0.25em] uppercase text-emerald-800/70 mb-4">
            Ecological Network
          </div>
          <h2 className="font-serif text-4xl md:text-5xl text-[#1a3a2e] leading-tight">
            Every orchid is a thread<br />
            <span className="italic">in a continuum of life.</span>
          </h2>
          <p className="text-[#4a4238]/80 mt-6 leading-relaxed">
            Hover or tap any node to trace the relationships that hold this living
            system together — from microbial roots to global communities of practice.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-center">
          <div className="lg:col-span-3 relative">
            <div className="aspect-square relative">
              <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
                {/* concentric rings */}
                {[42, 32, 22, 12].map(r => (
                  <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#1a3a2e" strokeOpacity="0.06" strokeWidth="0.2" />
                ))}
                {/* edges */}
                {edges.map(([a, b]) => {
                  const na = nodes.find(n => n.id === a)!;
                  const nb = nodes.find(n => n.id === b)!;
                  const highlight = isConnected(a, b);
                  return (
                    <line
                      key={a + b}
                      x1={na.x}
                      y1={na.y}
                      x2={nb.x}
                      y2={nb.y}
                      stroke={highlight ? '#1a3a2e' : '#1a3a2e'}
                      strokeOpacity={highlight ? 0.55 : 0.12}
                      strokeWidth={highlight ? 0.4 : 0.2}
                      className="transition-all duration-500"
                    />
                  );
                })}
                {/* nodes */}
                {nodes.map(n => {
                  const isActive = n.id === active;
                  return (
                    <g
                      key={n.id}
                      onMouseEnter={() => setActive(n.id)}
                      onClick={() => setActive(n.id)}
                      className="cursor-pointer"
                    >
                      {isActive && (
                        <circle cx={n.x} cy={n.y} r={n.r + 4} fill="#1a3a2e" opacity="0.08" className="animate-pulse" />
                      )}
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={n.r}
                        fill={isActive ? '#1a3a2e' : '#f4f1e8'}
                        stroke="#1a3a2e"
                        strokeWidth="0.4"
                        className="transition-all duration-500"
                      />
                      <text
                        x={n.x}
                        y={n.y + n.r + 4}
                        textAnchor="middle"
                        fontSize="2.4"
                        fill="#1a3a2e"
                        className="font-serif"
                      >
                        {n.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-2xl overflow-hidden border border-[#1a3a2e]/15 bg-white">
              <div className="aspect-[3/2] overflow-hidden">
                <img src={POLLINATOR_IMG} alt="Pollinator interaction" className="w-full h-full object-cover" />
              </div>
              <div className="p-6">
                <div className="text-[10px] tracking-[0.25em] uppercase text-[#4a4238]/60 mb-2">
                  Active relationship
                </div>
                <h3 className="font-serif text-2xl text-[#1a3a2e]">{activeNode.label}</h3>
                <p className="text-sm text-[#4a4238]/80 mt-2">{activeNode.sub}</p>
                <div className="h-px w-12 bg-[#1a3a2e]/30 my-4" />
                <p className="text-sm text-[#4a4238]/75 leading-relaxed">
                  The Continuum models orchids as living nodes within a wider ecological
                  graph — surfacing dependencies that conservation strategies must protect.
                </p>
                <div className="flex flex-wrap gap-2 mt-5">
                  {nodes.filter(n => n.id !== active).map(n => (
                    <button
                      key={n.id}
                      onClick={() => setActive(n.id)}
                      className="text-xs px-3 py-1.5 rounded-full border border-[#1a3a2e]/20 text-[#1a3a2e]/80 hover:bg-[#1a3a2e] hover:text-white transition-colors"
                    >
                      {n.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EcoNetwork;
