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
  const habitat = entry.ecology?.habitat || 'habitat';
  const pollinator = entry.ecology?.pollinatorGuild || 'pollinators';
  const mycorrhiza = entry.ecology?.mycorrhizal || 'mycorrhizal fungi';

  return [
    {
      label: 'Habitat',
      title: 'Where it lives',
      body: habitat,
    },
    {
      label: 'Pollination',
      title: 'Who visits it',
      body: pollinator,
    },
    {
      label: 'Fungi',
      title: 'What seedlings need',
      body: mycorrhiza,
    },
    {
      label: 'Care',
      title: 'Why it matters',
      body: 'Follow the evidence into conservation, learning, and cultivation.',
    },
  ];
}

/**
 * BUILD-039 public triage.
 *
 * Keeps the working Featured Genus engine, but trims the public wrapper so this
 * section reads as a compact doorway rather than a second full manifesto.
 */
const DailyGenusFeatureV5: React.FC = () => {
  const entry = useMemo(() => featuredGenusEntry(), []);
  const trails = useMemo(() => buildDiscoveryTrails(entry), [entry]);

  return (
    <div className="space-y-3">
      <DailyGenusFeatureV4 />

      <section className="rounded-[1.5rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-3 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
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

      <section className="rounded-[1.5rem] border border-[#d9caa8] bg-[#fffaf0]/95 p-4 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Discovery Trails</p>
            <h3 className="mt-1 font-serif text-2xl text-[#24321f]">Choose a doorway into {entry.genus}</h3>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[#5d684c]">
            Each trail opens one question about today&apos;s genus: place, partners, fungi, or stewardship.
          </p>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-4">
          {trails.map((trail) => (
            <article key={trail.label} className="rounded-2xl border border-[#e0d4b5] bg-[#f8f1df] p-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8a6f2d]">{trail.label}</p>
              <h4 className="mt-1 font-serif text-lg leading-tight text-[#24321f]">{trail.title}</h4>
              <p className="mt-1 line-clamp-2 text-[12.5px] leading-5 text-[#5d684c]">{trail.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export default DailyGenusFeatureV5;
