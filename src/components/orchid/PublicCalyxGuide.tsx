import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, X } from 'lucide-react';
import { useHomepageFeatured } from '@/lib/homepageFeaturedContext';
import { useHomepageRelationships } from '@/lib/homepageRelationshipContext';
import { useHomepageAtlasContext } from '@/lib/homepageAtlasContext';
import { buildHomepageCalyxContext, storeHomepageCalyxContext } from '@/lib/homepageCalyxContext';

const PublicCalyxGuide: React.FC = () => {
  const [open, setOpen] = useState(false);
  const featured = useHomepageFeatured();
  const relationships = useHomepageRelationships();
  const atlas = useHomepageAtlasContext();
  const context = useMemo(() => buildHomepageCalyxContext(featured, relationships, atlas), [featured, relationships, atlas]);
  const subject = featured.activeSpecies || featured.genus;

  const openWorkspace = () => storeHomepageCalyxContext(context);

  return <div className="fixed bottom-4 right-4 z-[55] max-w-[calc(100vw-2rem)]">
    {open && <div className="mb-3 w-[360px] max-w-full rounded-2xl border border-[#d4b34a]/30 bg-[#0a170f]/95 p-4 text-[#f5f0e8] shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#d4b34a]">Ask Calyx</p><h2 className="mt-1 font-serif text-xl">About {subject}</h2></div>
        <button type="button" aria-label="Close Calyx guide" onClick={() => setOpen(false)} className="rounded-full p-1 text-[#c9bfa9] hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#d8cfbd]/80">Calyx can carry this page context into the conversation: the active orchid, current Atlas theme, relationship scope, evidence states, provenance, and caveats.</p>
      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-[#c9bfa9]">
        Atlas: <span className="text-[#f5f0e8]">{atlas.activeTheme}</span> · {atlas.dataStatus}<br />
        Relationships: <span className="text-[#f5f0e8]">{relationships.relationships.filter((r) => r.availability === 'available').length}</span> currently supported on the homepage
      </div>
      <Link to="/homepage-calyx" onClick={openWorkspace} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#d4b34a] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#14281c]">
        <MessageCircle className="h-4 w-4" /> Ask about this view
      </Link>
      <p className="mt-2 text-[10px] leading-4 text-[#9fa69d]">Calyx will not treat missing records, unavailable layers, or unexposed relationships as evidence of biological absence.</p>
    </div>}
    <button type="button" onClick={() => setOpen((value) => !value)} className="ml-auto flex items-center gap-2 rounded-full border border-[#d4b34a]/40 bg-[#0a170f] px-4 py-3 text-[#f5f0e8] shadow-xl hover:bg-[#13251a]" aria-expanded={open}>
      <MessageCircle className="h-4 w-4 text-[#d4b34a]" /><span className="font-mono text-[10px] uppercase tracking-[0.16em]">Ask Calyx</span>
    </button>
  </div>;
};

export default PublicCalyxGuide;
