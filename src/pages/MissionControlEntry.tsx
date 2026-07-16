import { useSearchParams } from 'react-router-dom';
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

  return <MissionControl />;
}
