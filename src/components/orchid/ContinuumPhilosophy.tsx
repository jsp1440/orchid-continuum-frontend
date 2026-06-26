import React from 'react';

const connectionSteps = [
  'Knowledge is fragmented.',
  'The Continuum connects it.',
  'Connections reveal relationships.',
  'Relationships generate understanding.',
  'Understanding enables conservation.',
];

const systems = [
  ['Taxonomy Engine', 'connects names'],
  ['Atlas', 'connects species to places'],
  ['Literature Pipeline', 'connects publications to species and traits'],
  ['Image Network', 'connects photographs to taxonomy, morphology, and time'],
  ['Pollinator Network', 'connects orchids to pollinators'],
  ['Mycorrhizal Network', 'connects orchids to fungi'],
  ['Relationship Matrix', 'connects traits, ecology, and evolution'],
  ['Collaboration Network', 'connects researchers and institutions'],
];

const ContinuumPhilosophy: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-[#f6f0df] text-[#24321f] border-y border-[#d9caa8]">
      <div
        className="absolute inset-0 pointer-events-none opacity-70"
        style={{
          background:
            'radial-gradient(ellipse at 12% 10%, rgba(201,162,74,0.18) 0%, transparent 46%), radial-gradient(ellipse at 90% 85%, rgba(31,61,43,0.12) 0%, transparent 50%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 py-18 lg:px-10 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#8a6a18]">
              The architectural mission
            </div>
            <h2
              className="mt-4 leading-[1.05] text-[#24321f]"
              style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 'clamp(2.1rem, 4vw, 3.8rem)', fontWeight: 500 }}
            >
              The Orchid Continuum exists to connect what has been disconnected.
            </h2>
            <p className="mt-6 max-w-2xl text-[16px] leading-8 text-[#4f5b44] md:text-[18px]">
              Orchid knowledge is scattered across the world — in scientific literature, herbaria, museums, botanical gardens, living collections, citizen science platforms, field notebooks, private collections, photographs, and the experience of researchers and growers.
            </p>
            <p className="mt-5 max-w-2xl text-[16px] leading-8 text-[#4f5b44] md:text-[18px]">
              The Continuum brings these fragmented sources together into a connected, living knowledge system where relationships become visible and new understanding can emerge.
            </p>
          </div>

          <div className="rounded-[2rem] border border-[#d1bd83] bg-[#fffaf0]/85 p-6 shadow-[0_24px_60px_rgba(63,54,29,0.10)] lg:p-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#8a6a18]">
              From knowledge to conservation
            </div>
            <ol className="mt-6 space-y-4">
              {connectionSteps.map((step, index) => (
                <li key={step} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#c9a24a]/50 bg-[#f2e7c8] font-mono text-[11px] text-[#6b5519]">
                    {index + 1}
                  </span>
                  <span className="pt-1 font-serif text-xl leading-snug text-[#26351f]">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-8 rounded-2xl border border-[#c9a24a]/35 bg-[#f8edcd] p-5">
              <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#7d6421]">
                Guiding question
              </div>
              <p className="mt-3 font-serif text-2xl leading-snug text-[#24321f]">
                Does this feature create meaningful new connections?
              </p>
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {systems.map(([name, verb]) => (
            <div key={name} className="rounded-2xl border border-[#d9caa8] bg-[#fffaf0] p-5">
              <div className="font-serif text-xl text-[#24321f]">{name}</div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#7c765f]">
                {verb}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center rounded-[2rem] border border-[#d1bd83] bg-[#24321f] p-6 text-[#fffaf0] lg:p-8">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#d4b34a]">
              Mission
            </div>
            <p className="mt-3 max-w-4xl font-serif text-2xl leading-snug lg:text-3xl">
              The Orchid Continuum connects the world’s fragmented orchid knowledge into a living network of relationships that advances discovery, collaboration, education, and conservation.
            </p>
          </div>
          <div className="rounded-full border border-[#d4b34a]/45 px-5 py-3 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[#d4b34a]">
            Connecting people to knowledge<br />Connecting knowledge to conservation
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContinuumPhilosophy;
