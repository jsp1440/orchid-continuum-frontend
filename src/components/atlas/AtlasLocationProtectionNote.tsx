import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { atlasLocationProtectionNotice, type AtlasOccurrenceSource } from '@/lib/atlasOccurrenceSource';

/**
 * Always-visible statement of how Atlas locations are shown: generalised at the
 * source by the protected view, or generalised in the browser while the
 * owner-applied migration is pending. Never claims more protection than the
 * read path that produced the records actually provides.
 */
const AtlasLocationProtectionNote: React.FC<{ source: AtlasOccurrenceSource }> = ({ source }) => {
  const notice = atlasLocationProtectionNotice(source);
  return (
    <div
      role="note"
      data-testid="atlas-location-protection-note"
      data-source={source}
      className="flex items-start gap-2 rounded-xl border border-[#c9a24a]/25 bg-[#0a0d1c]/70 px-4 py-3 text-[12px] leading-relaxed text-[#cfc8b8]/85"
    >
      <ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#c9a24a]" />
      <p>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c9a24a]">{notice.title}</span>
        <span className="ml-2">{notice.body}</span>
      </p>
    </div>
  );
};

export default AtlasLocationProtectionNote;
