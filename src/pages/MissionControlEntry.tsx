import { Bot, Database, Gauge, Inbox } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import IntelligenceCenter from './IntelligenceCenter';
import MissionControl from './MissionControl';
import TaxonomyOperations from './TaxonomyOperations';
import TaxonomyReleases from './TaxonomyReleases';

/**
 * Render static sites need an index.html rewrite for direct nested URLs.
 * Until that dashboard rule is guaranteed, expose Mission Control subviews
 * through the already-live /mission-control route using a query parameter.
 */
export default function MissionControlEntry() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');

  if (view === 'intelligence-center' || view === 'research-operations') {
    return <IntelligenceCenter />;
  }

  if (view === 'taxonomy-releases') {
    return <TaxonomyReleases />;
  }

  if (view === 'taxonomy-operations') {
    return <TaxonomyOperations />;
  }

  return (
    <>
      <MissionControl />
      <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-3">
        <Link
          to="/calyx"
          className="inline-flex items-center gap-2 rounded-full border border-[#4cc3c2]/50 bg-[#0a2018] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#4cc3c2] shadow-2xl transition hover:bg-[#0f2e21]"
          aria-label="Speak with CALYX"
        >
          <Bot className="h-4 w-4" /> Speak with CALYX
        </Link>
        <Link
          to="/mission-control?view=taxonomy-operations"
          className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/50 bg-[#102819] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6dc82] shadow-2xl transition hover:bg-[#173823]"
          aria-label="Open Taxonomy Operations"
        >
          <Gauge className="h-4 w-4" /> Taxonomy Operations
        </Link>
        <Link
          to="/mission-control?view=taxonomy-releases"
          className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/50 bg-[#102819] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6dc82] shadow-2xl transition hover:bg-[#173823]"
          aria-label="Open Taxonomy Releases"
        >
          <Database className="h-4 w-4" /> Taxonomy Releases
        </Link>
        <Link
          to="/mission-control?view=intelligence-center"
          className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/50 bg-[#102819] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6dc82] shadow-2xl transition hover:bg-[#173823]"
          aria-label="Open BUILD-071 Intelligence Center"
        >
          <Inbox className="h-4 w-4" /> Intelligence Center
        </Link>
      </div>
    </>
  );
}
