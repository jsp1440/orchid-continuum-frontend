import { Activity, Database, Gauge, Gavel, Inbox, Layers3, MessageSquareWarning, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import FeedbackReview from './FeedbackReview';
import IntakeReview from './IntakeReview';
import IntelligenceCenter from './IntelligenceCenter';
import JudgeAdminConsole from './JudgeAdminConsole';
import LiveCompletionLedger from './LiveCompletionLedger';
import MissionControl from './MissionControl';
import TaxonomyOperations from './TaxonomyOperations';
import TaxonomyReleases from './TaxonomyReleases';
import UiConvergenceAudit from './UiConvergenceAudit';

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

  if (view === 'live-ledger') {
    return <LiveCompletionLedger />;
  }

  if (view === 'ui-convergence') {
    return <UiConvergenceAudit />;
  }

  if (view === 'taxonomy-releases') {
    return <TaxonomyReleases />;
  }

  if (view === 'taxonomy-operations') {
    return <TaxonomyOperations />;
  }

  if (view === 'intake-review') {
    return <IntakeReview />;
  }

  if (view === 'feedback-review') {
    return <FeedbackReview />;
  }

  if (view === 'judging') {
    return <JudgeAdminConsole />;
  }

  return (
    <>
      <MissionControl />
      <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-3">
        <Link
          to="/mission-control?view=ui-convergence"
          className="inline-flex items-center gap-2 rounded-full border border-violet-300/40 bg-[#102819] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-violet-100 shadow-2xl transition hover:bg-[#173823]"
          aria-label="Open UI Convergence Audit"
          data-testid="mission-control-ui-convergence-link"
        >
          <Layers3 className="h-4 w-4" /> UI Convergence
        </Link>
        <Link
          to="/mission-control?view=live-ledger"
          className="inline-flex items-center gap-2 rounded-full border border-emerald-300/45 bg-[#102819] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-100 shadow-2xl transition hover:bg-[#173823]"
          aria-label="Open Live Completion Ledger"
          data-testid="mission-control-live-ledger-link"
        >
          <Activity className="h-4 w-4" /> Completion Ledger
        </Link>
        <Link
          to="/mission-control?view=intake-review"
          className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/50 bg-[#102819] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6dc82] shadow-2xl transition hover:bg-[#173823]"
          aria-label="Open Intake Review"
          data-testid="mission-control-intake-review-link"
        >
          <ShieldCheck className="h-4 w-4" /> Intake Review
        </Link>
        <Link
          to="/mission-control/feedback-review"
          className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/50 bg-[#102819] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6dc82] shadow-2xl transition hover:bg-[#173823]"
          aria-label="Open Feedback Review"
          data-testid="mission-control-feedback-review-link"
        >
          <MessageSquareWarning className="h-4 w-4" /> Feedback Review
        </Link>
        <Link
          to="/mission-control/judging"
          className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/50 bg-[#102819] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6dc82] shadow-2xl transition hover:bg-[#173823]"
          aria-label="Open Show Judging"
          data-testid="mission-control-judging-link"
        >
          <Gavel className="h-4 w-4" /> Show Judging
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
