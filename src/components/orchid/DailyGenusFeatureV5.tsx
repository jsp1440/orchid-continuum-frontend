import React from 'react';
import DailyGenusRelationshipChips from '@/components/orchid/DailyGenusRelationshipChips';
import { featuredGenusEntry } from '@/lib/featuredGenus';
import { fetchPublicGenusImages } from '@/lib/publicImageSource';

const DailyGenusFeatureV5: React.FC = () => {
  const entry = featuredGenusEntry();

  React.useEffect(() => {
    const ctrl = new AbortController();

    fetchPublicGenusImages(entry.genus, ctrl.signal, 24).then((result) => {
      console.log('Approved Genus of the Day images:', result);
    });

    return () => ctrl.abort();
  }, [entry.genus]);

  return (
    <div className="space-y-4">
      <section className="rounded-[2rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-5 shadow-[0_16px_40px_rgba(30,40,20,0.08)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#8a8062]">
          Genus of the Day
        </p>

        <h2 className="mt-2 font-serif text-4xl italic text-[#24321f]">
          {entry.genus}
        </h2>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d684c]">
          Approved image wiring is now using the Orchid Continuum public image source.
        </p>
      </section>

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
    </div>
  );
};

export default DailyGenusFeatureV5;
