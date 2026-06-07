import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, PawPrint, Microscope, LineChart, ShieldCheck, GraduationCap, ArrowUpRight } from 'lucide-react';

const modules = [
  { name: 'Atlas', tag: 'Geospatial Layer', desc: 'Distribution maps, biodiversity hotspots, and habitat layers across six continents.', icon: Map, route: '/atlas' },
  { name: 'Orchid Zoo', tag: 'Citizen Science', desc: 'A reviewer-led participation network where the public helps grow the living orchid record.', icon: PawPrint, route: '/zoo' },
  { name: 'Species Explorer', tag: 'Living Catalogue', desc: 'Browse the full breadth of Orchidaceae with imagery, characteristics, ecology, and evolutionary context.', icon: Microscope, anchor: '#species' },
  { name: 'Research Dashboard', tag: 'Living Insights', desc: 'Living views of sighting trends, climate overlays, and morphological analysis.', icon: LineChart, anchor: '#atlas' },
  { name: 'OACS', tag: 'Greenhouse Sensors', desc: 'Orchid Adaptive Cultivation Sensors — temperature, humidity, PAR, and VPD compared against natural habitat conditions.', icon: ShieldCheck, route: '/oacs' },
  { name: 'Widgets', tag: 'Embeddable', desc: 'Six reusable widgets — Species Snapshot, Orchid of the Day, Atlas Teaser, Interaction Card, Zoo Card, OACS Snapshot.', icon: GraduationCap, route: '/widgets' },
];


const Modules: React.FC = () => {
  const navigate = useNavigate();
  const open = (m: typeof modules[number]) => {
    if (m.route) navigate(m.route);
    else if (m.anchor) document.querySelector(m.anchor)?.scrollIntoView({ behavior: 'smooth' });
  };
  return (
    <section id="modules" className="relative py-28 bg-[#f4f1e8]">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-16">
          <div className="max-w-2xl">
            <div className="text-xs tracking-[0.25em] uppercase text-emerald-800/70 mb-4">Featured Modules</div>
            <h2 className="font-serif text-4xl md:text-5xl text-[#1a3a2e] leading-tight">A unified system for orchid science</h2>
          </div>
          <p className="text-[#4a4238]/80 max-w-md leading-relaxed">Six interoperable modules forming a continuous flow from observation to scientific knowledge, analysis, and conservation action.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#1a3a2e]/15 border border-[#1a3a2e]/15 rounded-2xl overflow-hidden">
          {modules.map(m => {
            const Icon = m.icon;
            return (
              <button key={m.name} onClick={() => open(m)} className="group bg-[#f4f1e8] hover:bg-white text-left p-8 transition-all duration-500 relative overflow-hidden">
                <div className="absolute top-6 right-6 text-[#1a3a2e]/40 group-hover:text-emerald-700 group-hover:rotate-45 transition-all duration-500"><ArrowUpRight className="h-5 w-5" /></div>
                <div className="w-12 h-12 rounded-xl bg-[#1a3a2e]/5 border border-[#1a3a2e]/10 flex items-center justify-center mb-6 group-hover:bg-[#1a3a2e] group-hover:border-[#1a3a2e] transition-colors"><Icon className="h-5 w-5 text-[#1a3a2e] group-hover:text-emerald-200 transition-colors" /></div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-[#4a4238]/60 mb-2">{m.tag}</div>
                <h3 className="font-serif text-2xl text-[#1a3a2e] mb-3">{m.name}</h3>
                <p className="text-sm text-[#4a4238]/80 leading-relaxed">{m.desc}</p>
                <div className="mt-6 h-px w-12 bg-[#1a3a2e]/20 group-hover:w-24 group-hover:bg-emerald-700 transition-all duration-500" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Modules;
