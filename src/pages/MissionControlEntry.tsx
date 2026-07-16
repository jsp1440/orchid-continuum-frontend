import { Inbox } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import IntelligenceCenter from './IntelligenceCenter';
import MissionControl from './MissionControl';

/**
 * Render static sites need an index.html rewrite for direct nested URLs.
 * Until that dashboard rule is guaranteed, expose BUILD-071 through the
 * already-live /mission-control route using a query parameter.
 */
export default function MissionControlEntry() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');

  if (view === 'intelligence-center' || view === 'research-operations') {
    return <IntelligenceCenter />;
  }

  return (
    <>
      <MissionControl />
      <Link
        to="/mission-control?view=intelligence-center"
        className="fixed bottom-5 right-5 z-[70] inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/50 bg-[#102819] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6dc82] shadow-2xl transition hover:bg-[#173823]"
        aria-label="Open BUILD-071 Intelligence Center"
      >
        <Inbox className="h-4 w-4" /> Intelligence Center
      </Link>
    </>
  );
}
