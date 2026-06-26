import React, { useMemo } from 'react';
import DailyGenusFeatureV4 from '@/components/orchid/DailyGenusFeatureV4';
import DailyGenusRelationshipChips from '@/components/orchid/DailyGenusRelationshipChips';
import { featuredGenusEntry } from '@/lib/featuredGenus';

/**
 * BUILD 207D wrapper.
 *
 * Keeps the working V4 image rotation untouched while adding the first
 * universal exploration chips at the Genus-of-the-Day level. This is
 * intentionally conservative: no image logic, no slot rotation logic, and no
 * ecological-neighborhood fetches are changed here.
 */
const DailyGenusFeatureV5: React.FC = () => {
  const entry = useMemo(() => featuredGenusEntry(), []);

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
    </div>
  );
};

export default DailyGenusFeatureV5;
