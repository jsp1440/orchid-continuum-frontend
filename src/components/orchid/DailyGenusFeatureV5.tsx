import React, { useMemo } from 'react';
import DailyGenusFeatureV4 from '@/components/orchid/DailyGenusFeatureV4';
import DailyGenusRelationshipChips from '@/components/orchid/DailyGenusRelationshipChips';
import { featuredGenusEntry } from '@/lib/featuredGenus';

type DiscoveryTrail = {
  label: string;
  title: string;
  body: string;
};

function buildDiscoveryTrails(entry: ReturnType<typeof featuredGenusEntry>): DiscoveryTrail[] {
  const regions = entry.regions?.join(', ') || 'its native range';
  const habitat = entry.ecology?.habitat || 'its living habitat';
  const pollinator = entry.ecology?.pollinatorGuild || 'its pollinators';
  const mycorrhiza = entry.ecology?.mycorrhizal || 'orchid mycorrhizal fungi';

  return [
    {
      label: 'Story',
      title: `Why ${entry.genus} matters`,
      body: `Begin with beauty, then follow the science: ${entry.genus} opens into stories of evolution, ecology, and the people working to understand orchids before they disappear.`,
    },
    {
      label: 'Habitat',
      title: 'Step into the ecosystem',
      body: `Explore ${habitat.toLowerCase()} across ${regions}, where climate, elevation, neighboring plants, and seasonal rhythms shape each orchid's life.`,
    },
    {
      label: 'Relationships',
      title: 'Follow the living network',
      body: `Trace connections among ${pollinator.toLowerCase()}, ${mycorrhiza.toLowerCase()}, host trees, forests, and the orchids that depend on them.`,
    },
    {
      label: 'Conservation',
      title: 'Turn curiosity into care',
      body: 'Every discovery should lead somewhere: a question, an observation, a conservation action, or a deeper path through Orchid University.',
    },
  ];
}

/**
 * BUILD-029 homepage bridge.
 *
 * Keeps the working V4 image rotation untouched while adding an explicit
 * discovery trail that reflects the Orchid Continuum experience model: wonder,
 * habitat immersion, relationship science, and conservation action.
 */
const DailyGenusFeatureV5: React.FC = () => {
  const entry = useMemo(() => featuredGenusEntry(), []);
  const trails = useMemo(() => buildDiscoveryTrails(entry), [entry]);

  return (
    <div className="space-y-4">
      <DailyGenusFeatureV4 />

      <section className="rounded-[2rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-5 shadow-[0_16px_40px_rgba(30,40,20,0.08)]">
        <DailyGenusRelationshipChips
          genus={entry.genus}
          habitat={entry.ecology.habitat}
          geography={entry.regions.join(', ')}
          pollinator={entry.ecology.pollinatorGuild}
          fungus={entry.ecology.mycorrhizal}
          elevation={entry.ecology.elevation}
          sourceView="featuredGenusEntry"
          className="mt-0"
        />
      </section>

      <section className="rounded-[2rem] border border-[#d9caa8] bg-[#fffaf0]/95 p-5 shadow-[0_16px_40px_rgba(30,40,20,0.08)]">
        <div className="mb-4 max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#8a8062]">Discovery Trails</p>
          <h3 className="mt-1 font-serif text-3xl text-[#24321f]">Choose how to enter the Continuum</h3>
          <p className="mt-2 text-sm leading-6 text-[#5d684c]">
            The Orchid Continuum is not a single path. Follow the trail that sparks your curiosity, then let Calyx connect beauty, evidence, story, and conservation.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {trails.map((trail) => (
            <article key={trail.label} className="rounded-2xl border border-[#e0d4b5] bg-[#f8f1df] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#8a6f2d]">{trail.label}</p>
              <h4 className="mt-2 font-serif text-xl text-[#24321f]">{trail.title}</h4>
              <p className="mt-2 text-sm leading-6 text-[#5d684c]">{trail.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export default DailyGenusFeatureV5;
