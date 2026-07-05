import React from 'react';
import { ArrowRight, BookOpen, Globe2, Leaf, Microscope, Network, ShieldCheck } from 'lucide-react';

const pathways = [
  {
    label: 'Beauty',
    title: 'Begin with wonder',
    body: 'A flower opens the door. Color, form, fragrance, motion, and story invite visitors into science instead of asking them to start with terminology.',
    icon: Leaf,
  },
  {
    label: 'Discovery',
    title: 'Follow the evidence',
    body: 'Each orchid connects to names, images, locations, literature, histories, cultivation knowledge, and unanswered questions.',
    icon: Microscope,
  },
  {
    label: 'Relationships',
    title: 'See the living network',
    body: 'The Continuum links orchids with pollinators, mycorrhizal fungi, climate, habitat, geography, people, and conservation action.',
    icon: Network,
  },
  {
    label: 'Stewardship',
    title: 'Turn knowledge into care',
    body: 'Discovery should lead to better decisions: habitat protection, propagation, education, research priorities, and community participation.',
    icon: ShieldCheck,
  },
];

const proofPoints = [
  ['Taxonomy', 'accepted names, synonyms, and species records'],
  ['Ecology', 'pollinators, fungi, habitat, climate, and elevation'],
  ['Atlas', 'occurrences, maps, geography, and conservation context'],
  ['Literature', 'papers, claims, citations, and knowledge gaps'],
  ['Education', 'glossary, lessons, visual learning, and Orchid University'],
  ['Calyx', 'mission control, governance, and constitutional orchestration'],
];

const WhyContinuumExists: React.FC = () => {
  return (
    <section
      id="why-continuum-exists"
      className="relative overflow-hidden border-b border-white/[0.08] bg-[#101f14] text-[#f5f0e8]"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 10% 0%, rgba(212,179,74,0.13) 0%, transparent 45%),' +
            'radial-gradient(ellipse at 88% 30%, rgba(76,211,194,0.10) 0%, transparent 45%),' +
            'linear-gradient(180deg, #102416 0%, #0a170f 100%)',
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-18 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-3 font-mono text-[10px] tracking-[0.30em] uppercase text-[#d4b34a]">
              <span className="inline-block h-px w-8 bg-[#d4b34a]/60" />
              Beauty → Discovery → Relationships → Stewardship
            </div>

            <h2
              className="mt-6 max-w-3xl leading-[1.02] tracking-[-0.012em] text-[#fffaf0]"
              style={{
                fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontSize: 'clamp(2.4rem, 5vw, 4.6rem)',
                fontWeight: 560,
              }}
            >
              A living orchid knowledge system, built for science and public wonder.
            </h2>

            <div className="mt-6 max-w-3xl space-y-4 text-[16px] leading-7 text-[#d8cfbd]/88 md:text-[18px] md:leading-8">
              <p>
                The Orchid Continuum is not simply an orchid website. It is an integrated platform for connecting taxonomy, images, maps, literature, ecology, cultivation, education, and conservation into one navigable experience.
              </p>
              <p>
                Its purpose is to help visitors move from awe to understanding: an orchid becomes a story, a story becomes a relationship, and that relationship becomes a reason to care.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#species-in-focus"
                className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-6 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#14281c] transition-colors hover:bg-[#e6c763]"
              >
                <BookOpen className="h-4 w-4" />
                Follow today&apos;s orchid
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#continuum-web"
                className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/40 px-6 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a] hover:bg-[#d4b34a]/10"
              >
                <Globe2 className="h-4 w-4" />
                Explore the living web
              </a>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {pathways.map((path) => {
              const Icon = path.icon;
              return (
                <article key={path.label} className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.045] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d4b34a]/30 bg-[#d4b34a]/10 text-[#d4b34a]">
                      <Icon className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#d4b34a]/80">{path.label}</span>
                  </div>
                  <h3 className="mt-4 font-serif text-2xl text-[#fffaf0]">{path.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#d8cfbd]/78">{path.body}</p>
                </article>
              );
            })}
          </div>
        </div>

        <div className="mt-12 rounded-[2rem] border border-[#d4b34a]/18 bg-[#d4b34a]/8 p-5 lg:p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#d4b34a]">Grant-ready platform evidence</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {proofPoints.map(([label, body]) => (
              <div key={label} className="rounded-2xl border border-white/[0.08] bg-black/15 p-4">
                <div className="font-serif text-xl text-[#fffaf0]">{label}</div>
                <p className="mt-1 text-sm leading-6 text-[#d8cfbd]/72">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyContinuumExists;
