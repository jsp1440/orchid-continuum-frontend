import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Database,
  Download,
  DollarSign,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  FileDown,
  Filter,
  GitBranch,
  Handshake,
  Info,
  Inbox,
  KeyRound,
  LockKeyhole,
  Layers,
  PauseCircle,
  PlayCircle,
  Radar,
  RefreshCw,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Telescope,
  TrendingUp,
  Workflow,
  Zap,
} from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import {
  type ContinuumSubsystem,
  type ControlState,
  type EndpointDiagnostic,
  type HarvesterStatus,
  type MissionControlOperations,
  type MissionControlStatus,
  type Recommendation,
  type RecentActivity,
  type RepositoryStatus,
  type SafetyBoundary,
} from '@/lib/missionControlOps';
import { MissionControlProvider } from '@/lib/mission-control/MissionControlProvider';
import { missionStatusToCardState, useMissionControl } from '@/lib/mission-control/MissionControlHooks';
import {
  deriveDailyMetrics,
  deriveScientificInsights,
  scoreSubsystems,
  getGreeting,
  toNarrativeTitle,
  buildExecutivePlatformStatus,
  priorityBandMeta,
  FALLBACK_ACTIVITY_EVENTS,
  type PriorityBand,
  type ScoredSubsystem,
} from '@/lib/mission-control/intelligentMissionControl';
import {
  createSourceBriefing,
  grantItems,
  intelligenceCategories,
  intelligenceSummary,
  loadIntelligenceStore,
  opportunityItems,
  parseTwinDailyBriefing,
  saveBriefingWithItems,
  saveIntelligenceStore,
  type IntelligenceCategory,
  type IntelligenceItem,
  type IntelligencePriority,
  type IntelligenceStatus,
  type IntelligenceStore,
} from '@/lib/missionControlIntelligence';
import {
  createOwnerSession,
  endOwnerSession,
  createResearchRequest,
  executiveAuditTemplates,
  fetchOwnerOperationsState,
  generateOwnerAudit,
  generatePartnershipPacket,
  importLocalIntelligenceToBackend,
  lifecycleProjects,
  operationsQueue,
  ownerGuides,
  ownerManualTopics,
  partnershipTemplates,
  researchCommands,
  researchInbox,
  runHarvesterOwnerAction,
  runRuntimeOwnerAction,
  saveSourceBriefingToBackend,
  submitOwnerCommand,
  transitionOwnerQueueItem,
  updateBackendIntelligenceItem,
  validateOwnerSession,
  type BackendOperationsQueueItem,
  type ExecutiveAuditTemplate,
  type OwnerAllowedActions,
  type OwnerOperationsState,
  type OwnerSession,
  type OwnerSubsystemGuide,
  type PartnershipTemplate,
  type ResearchCommandTemplate,
} from '@/lib/ownerOperationsConsole';

type MissionControlErrorBoundaryState = { error: Error | null };
type PanelErrorBoundaryState = { error: Error | null };
type DisplayTextScale = 'standard' | 'large' | 'extra';
type MissionFilter = 'overview' | 'needs_attention' | 'waiting_owner' | 'recommendations' | 'recent_changes' | 'healthy' | 'all';
type PriorityKind = 'urgent' | 'attention' | 'recommendation' | 'info' | 'healthy' | 'inactive';
type FocusItemKind = 'subsystem' | 'harvester' | 'repository' | 'recommendation' | 'activity' | 'safety';

type DisplayPreferences = {
  textScale: DisplayTextScale;
  comfortableSpacing: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  focusModeDefault: boolean;
  hideHealthyDefault: boolean;
};

type FocusItem = {
  id: string;
  kind: FocusItemKind;
  title: string;
  source: string;
  statusLabel: string;
  priority: PriorityKind;
  interpretation: string;
  nextAction: string;
  metric: string;
  details: string[];
  calyx: string[];
};

const ACCESS_STORAGE_KEY = 'oc_mission_control_owner_access_v1';
const BACKEND_OWNER_AUTHORIZATION_LABEL = 'Requires backend owner authorization.';
const DISPLAY_PREFS_STORAGE_KEY = 'oc_mission_control_display_preferences_v1';

const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  textScale: 'standard',
  comfortableSpacing: false,
  highContrast: false,
  reduceMotion: false,
  focusModeDefault: true,
  hideHealthyDefault: false,
};

const INTELLIGENCE_STORAGE_KEY = 'oc_mission_control_intelligence_v1';

const navigationItems = [
  { label: 'Daily Brief', targetId: 'mission-control-daily-brief', icon: Zap },
  { label: 'Owner Guide', targetId: 'mission-control-owner-guide', icon: BookOpen },
  { label: 'Command', targetId: 'mission-control-command', icon: Send },
  { label: 'Calyx Queue', targetId: 'mission-control-calyx-queue', icon: ClipboardList },
  { label: 'Audits', targetId: 'mission-control-executive-audits', icon: FileDown },
  { label: 'Research', targetId: 'mission-control-research-command', icon: Search },
  { label: 'Health', targetId: 'mission-control-health', icon: Activity },
  { label: 'Completeness', targetId: 'mission-control-completeness', icon: SlidersHorizontal },
  { label: 'Harvesters', targetId: 'mission-control-harvesters', icon: Radar },
  { label: 'Calyx Audit', targetId: 'mission-control-calyx-audit', icon: Bot },
  { label: 'Builds', targetId: 'mission-control-builds', icon: GitBranch },
  { label: 'Governance', targetId: 'mission-control-governance', icon: ShieldCheck },
  { label: 'Recommendations', targetId: 'mission-control-recommendations', icon: Sparkles },
  { label: 'Insights', targetId: 'mission-control-insights', icon: Brain },
  { label: 'Activity Feed', targetId: 'mission-control-activity-feed', icon: TrendingUp },
  { label: 'Intelligence', targetId: 'mission-control-intelligence', icon: Inbox },
  { label: 'Grant Office', targetId: 'mission-control-grants', icon: DollarSign },
  { label: 'Partnerships', targetId: 'mission-control-partnerships', icon: Handshake },
  { label: 'Manual', targetId: 'mission-control-owner-manual', icon: BookOpen },
  { label: 'Lifecycle', targetId: 'mission-control-lifecycle', icon: Layers },
  { label: 'Safety', targetId: 'mission-control-safety', icon: LockKeyhole },
];

const priorityOptions: IntelligencePriority[] = ['critical', 'high', 'medium', 'low'];
const statusOptions: IntelligenceStatus[] = ['new', 'triaged', 'active', 'waiting', 'submitted', 'completed', 'declined', 'archived'];
const missionFilters: { id: MissionFilter; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'needs_attention', label: 'Needs attention' },
  { id: 'waiting_owner', label: 'Waiting owner' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'recent_changes', label: 'Recent changes' },
  { id: 'healthy', label: 'Healthy' },
  { id: 'all', label: 'All' },
];

function safeGetStorage(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    // The owner console must still render when browser storage is unavailable.
  }
}

function safeRemoveStorage(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    // Non-fatal: locking still clears in-memory state below.
  }
}

function loadDisplayPreferences(): DisplayPreferences {
  const stored = safeGetStorage(DISPLAY_PREFS_STORAGE_KEY);
  if (!stored) return DEFAULT_DISPLAY_PREFERENCES;
  try {
    const parsed = JSON.parse(stored) as Partial<DisplayPreferences>;
    return {
      ...DEFAULT_DISPLAY_PREFERENCES,
      ...parsed,
      textScale: parsed.textScale === 'large' || parsed.textScale === 'extra' ? parsed.textScale : 'standard',
    };
  } catch {
    return DEFAULT_DISPLAY_PREFERENCES;
  }
}

function saveDisplayPreferences(preferences: DisplayPreferences): void {
  safeSetStorage(DISPLAY_PREFS_STORAGE_KEY, JSON.stringify(preferences));
}

function resetMissionControlLocalData(): void {
  safeRemoveStorage(ACCESS_STORAGE_KEY);
  safeRemoveStorage(INTELLIGENCE_STORAGE_KEY);
  safeRemoveStorage(DISPLAY_PREFS_STORAGE_KEY);
}

function safeArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function safeCategories(item: IntelligenceItem): IntelligenceCategory[] {
  return safeArray(item.category).length ? safeArray(item.category) : ['Unknown'];
}

function MissionControlCrashFallback({ error }: { error: Error | null }) {
  return (
    <div className="min-h-screen bg-[#06110b] text-[#f5f0e8]">
      <Navbar />
      <main className="flex min-h-screen items-center justify-center px-6 pt-28">
        <section className="w-full max-w-2xl rounded-lg border border-red-300/25 bg-red-300/10 p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200/30 bg-red-200/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-red-100">
            <AlertTriangle className="h-3.5 w-3.5" /> Mission Control safe mode
          </div>
          <h1 className="mt-5 text-4xl leading-tight" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            Mission Control stayed online, but one panel crashed.
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#f5f0e8]/82">
            The route did not white-screen. Refresh, clear Mission Control browser storage if needed, or continue from the public site while this panel is repaired.
          </p>
          {error ? (
            <pre className="mt-4 max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-red-100/85">
              {error.message}
            </pre>
          ) : null}
          <Link to="/" className="mt-5 inline-block rounded-full border border-[#d4b34a]/35 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d4b34a]">
            Return to public site
          </Link>
        </section>
      </main>
    </div>
  );
}

class MissionControlErrorBoundary extends React.Component<{ children: React.ReactNode }, MissionControlErrorBoundaryState> {
  state: MissionControlErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): MissionControlErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[MissionControl] render crash caught by safe mode', error);
  }

  render() {
    if (this.state.error) return <MissionControlCrashFallback error={this.state.error} />;
    return this.props.children;
  }
}

function PanelUnavailable({ title, error }: { title: string; error: Error | null }) {
  return (
    <section className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-5">
      <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-100">
        <AlertTriangle className="h-3.5 w-3.5" /> Mission Control panel unavailable
      </div>
      <h2 className="mt-4 text-2xl text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
        {title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-[#f5f0e8]/78">
        This panel was isolated so Mission Control can stay visible. Other panels, including Intelligence Inbox, remain available.
      </p>
      {error ? (
        <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-amber-100/80">
          {error.message}
        </pre>
      ) : null}
    </section>
  );
}

class PanelErrorBoundary extends React.Component<{ title: string; children: React.ReactNode }, PanelErrorBoundaryState> {
  state: PanelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[MissionControl] panel crashed: ${this.props.title}`, error);
  }

  render() {
    if (this.state.error) return <PanelUnavailable title={this.props.title} error={this.state.error} />;
    return this.props.children;
  }
}

function SafePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <PanelErrorBoundary title={title}>{children}</PanelErrorBoundary>;
}

function statusClass(status: MissionControlStatus): string {
  const cardState = missionStatusToCardState(status);
  if (cardState === 'healthy') return 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100';
  if (cardState === 'warning') return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
  if (cardState === 'critical') return 'border-red-300/25 bg-red-300/10 text-red-100';
  if (cardState === 'stale') return 'border-[#d4b34a]/35 bg-[#d4b34a]/15 text-[#f1d878]';
  if (cardState === 'offline') return 'border-sky-300/20 bg-sky-300/10 text-sky-100';
  return 'border-white/10 bg-white/[0.05] text-[#cfc8b8]';
}

function controlLabel(state: ControlState): string {
  if (state === 'read_only') return 'read-only';
  if (state === 'requires_owner_authorization' || state === 'disabled' || state === 'planned') return BACKEND_OWNER_AUTHORIZATION_LABEL;
  return state;
}

function ownerActionAllowed(actions: OwnerAllowedActions | undefined, action: string): boolean {
  return Boolean(actions?.[action]?.allowed);
}

function isWebUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function repositoryUrl(name: string): string | null {
  return /^[\w.-]+\/[\w.-]+$/.test(name) ? `https://github.com/${name}` : null;
}

function scrollToSection(targetId: string) {
  document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function displayTime(value?: string): string {
  if (!value || value === 'not connected') return value ?? 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function priorityMeta(priority: PriorityKind): { label: string; className: string } {
  if (priority === 'urgent') return { label: 'Urgent', className: 'border-red-200/35 bg-red-300/15 text-red-100' };
  if (priority === 'attention') return { label: 'Needs attention', className: 'border-amber-200/35 bg-amber-300/15 text-amber-100' };
  if (priority === 'recommendation') return { label: 'Recommendation', className: 'border-[#d4b34a]/35 bg-[#d4b34a]/15 text-[#f1d878]' };
  if (priority === 'healthy') return { label: 'Healthy', className: 'border-emerald-200/35 bg-emerald-300/15 text-emerald-100' };
  if (priority === 'inactive') return { label: 'Inactive', className: 'border-sky-200/25 bg-sky-300/10 text-sky-100' };
  return { label: 'Information', className: 'border-white/15 bg-white/[0.06] text-[#f5f0e8]' };
}

function missionPriorityFromStatus(status: MissionControlStatus): PriorityKind {
  if (status === 'critical' || status === 'error') return 'urgent';
  if (status === 'warning') return 'attention';
  if (status === 'stub' || status === 'offline' || status === 'stale') return 'inactive';
  if (status === 'healthy') return 'healthy';
  return 'info';
}

function harvesterPriority(harvester: HarvesterStatus): PriorityKind {
  if (harvester.state === 'error' || harvester.state === 'failed' || safeArray(harvester.errors).length) return 'urgent';
  if (harvester.approvalStatus?.toLowerCase().includes('owner') || harvester.state === 'needs_review' || harvester.state === 'redirect_pending') return 'recommendation';
  if (harvester.warningCount > 0 || (harvester.sourceExhaustion ?? 0) >= 0.7 || (harvester.duplicateRate ?? 0) >= 0.35) return 'attention';
  if (harvester.state === 'retired' || harvester.state === 'planned') return 'inactive';
  return 'healthy';
}

function repositoryPriority(repository: RepositoryStatus): PriorityKind {
  if (repository.deployStatus === 'error') return 'urgent';
  if (repository.backendDeployNeeded || repository.frontendDeployNeeded || safeArray(repository.knownBlockers).length) return 'attention';
  return missionPriorityFromStatus(repository.deployStatus);
}

function recommendationPriority(recommendation: Recommendation): PriorityKind {
  if (recommendation.priority === 'critical') return 'urgent';
  if (recommendation.priority === 'high') return 'attention';
  return 'recommendation';
}

function itemMatchesFilter(item: FocusItem, filter: MissionFilter, hideHealthy: boolean): boolean {
  if (filter === 'all') return true;
  if (filter === 'overview') return hideHealthy ? item.priority !== 'healthy' : true;
  if (filter === 'needs_attention') return item.priority === 'urgent' || item.priority === 'attention';
  if (filter === 'waiting_owner') return item.details.some((detail) => detail.toLowerCase().includes('owner') || detail.toLowerCase().includes('authorization'));
  if (filter === 'recommendations') return item.kind === 'recommendation' || item.priority === 'recommendation';
  if (filter === 'recent_changes') return item.kind === 'activity';
  if (filter === 'healthy') return item.priority === 'healthy';
  return true;
}

function buildFocusItems(dashboard: MissionControlOperations): FocusItem[] {
  const subsystemItems = safeArray(dashboard.globalHealth).map((subsystem): FocusItem => ({
    id: `subsystem-${subsystem.id}`,
    kind: 'subsystem',
    title: subsystem.name,
    source: subsystem.category,
    statusLabel: subsystem.status,
    priority: missionPriorityFromStatus(subsystem.status),
    interpretation: subsystem.summary,
    nextAction: subsystem.recommendedNextAction,
    metric: `${subsystem.completeness}% complete`,
    details: [`Last checked: ${displayTime(subsystem.lastChecked)}`, ...safeArray(subsystem.blockers).map((blocker) => `Blocker: ${blocker}`)],
    calyx: [
      `Calyx classifies this as ${subsystem.status} from the ${subsystem.category} lane.`,
      subsystem.blockers.length ? 'Resolve the first blocker before treating this as stable.' : 'No blocker is reported in the current telemetry.',
    ],
  }));

  const harvesterItems = safeArray(dashboard.harvesters).map((harvester): FocusItem => ({
    id: `harvester-${harvester.id}`,
    kind: 'harvester',
    title: harvester.name,
    source: harvester.source,
    statusLabel: harvester.state,
    priority: harvesterPriority(harvester),
    interpretation: harvester.logSummary,
    nextAction: harvester.recommendation ?? 'Review source freshness and owner approval state.',
    metric: `${harvester.rowsProcessed ?? 0} rows, ${Math.round((harvester.duplicateRate ?? 0) * 100)}% duplicates`,
    details: [
      `Target: ${harvester.target ?? 'unknown'}`,
      `Schedule: ${harvester.schedule ?? 'unknown'}`,
      `Freshness: ${harvester.freshness ?? 'unknown'}`,
      `Approval: ${harvester.approvalStatus ?? BACKEND_OWNER_AUTHORIZATION_LABEL}`,
      ...safeArray(harvester.errors).map((harvesterError) => `Error: ${harvesterError}`),
    ],
    calyx: [
      'Operational controls stay disabled until the backend returns authenticated action permissions for this harvester.',
      `Current recommendation signal: ${harvester.recommendation ?? 'none returned'}.`,
    ],
  }));

  const repositoryItems = safeArray(dashboard.repositories).map((repository): FocusItem => ({
    id: `repository-${repository.name}`,
    kind: 'repository',
    title: repository.name,
    source: 'Delivery',
    statusLabel: repository.deployStatus,
    priority: repositoryPriority(repository),
    interpretation: `Deployment target: ${repository.deploymentTarget}`,
    nextAction: safeArray(repository.knownBlockers)[0] ?? 'Review open pull requests and deploy status before promoting changes.',
    metric: `${repository.openPullRequests ?? 'unknown'} open PRs`,
    details: [
      `Default branch: ${repository.defaultBranch}`,
      `Frontend deploy needed: ${repository.frontendDeployNeeded ? 'yes' : 'no'}`,
      `Backend deploy needed: ${repository.backendDeployNeeded ? 'yes' : 'no'}`,
      ...safeArray(repository.knownBlockers).map((blocker) => `Blocker: ${blocker}`),
    ],
    calyx: [
      'Calyx treats deployment signals as read-only here.',
      'Production action requires backend owner authorization and a deployment workflow outside this browser gate.',
    ],
  }));

  const recommendationItems = safeArray(dashboard.recommendations).map((recommendation): FocusItem => ({
    id: `recommendation-${recommendation.id}`,
    kind: 'recommendation',
    title: recommendation.title,
    source: 'Calyx recommendation',
    statusLabel: recommendation.priority,
    priority: recommendationPriority(recommendation),
    interpretation: recommendation.rationale,
    nextAction: recommendation.ownerDecisionNeeded,
    metric: `Next build: ${recommendation.nextBuild}`,
    details: [`Owner decision: ${recommendation.ownerDecisionNeeded}`],
    calyx: [
      'This is advisory. It does not change repository, backend, or harvester state from the frontend.',
      `Calyx linked this recommendation to ${recommendation.nextBuild}.`,
    ],
  }));

  const activityItems = safeArray(dashboard.recentActivity).slice(0, 10).map((activity: RecentActivity): FocusItem => ({
    id: `activity-${activity.id}`,
    kind: 'activity',
    title: activity.label,
    source: activity.source,
    statusLabel: displayTime(activity.timestamp),
    priority: activity.source === 'planned' ? 'inactive' : 'info',
    interpretation: activity.detail,
    nextAction: 'Use this as recent context before changing deployment or harvester state.',
    metric: activity.source,
    details: [`Timestamp: ${displayTime(activity.timestamp)}`],
    calyx: ['Recent activity is context, not proof of a safe action path.', 'Check the related panel before taking owner action.'],
  }));

  const safetyItems = safeArray(dashboard.safetyBoundaries).map((boundary): FocusItem => ({
    id: `safety-${boundary.id}`,
    kind: 'safety',
    title: boundary.label,
    source: 'Safety boundary',
    statusLabel: controlLabel(boundary.state),
    priority: 'attention',
    interpretation: boundary.detail,
    nextAction: 'Keep this boundary enforced until the backend explicitly authorizes the matching owner workflow.',
    metric: controlLabel(boundary.state),
    details: [`Boundary state: ${controlLabel(boundary.state)}`],
    calyx: ['Safety boundaries are intentionally sticky.', 'Mission Control can explain them, but it cannot override them from local UI state.'],
  }));

  return [...subsystemItems, ...harvesterItems, ...repositoryItems, ...recommendationItems, ...activityItems, ...safetyItems];
}

function Panel({
  id,
  eyebrow,
  title,
  icon: Icon,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  icon: typeof Activity;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 rounded-lg border border-white/[0.08] bg-[#0d1d13]/90 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">{eyebrow}</div>
          <h2 className="mt-2 text-2xl text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            {title}
          </h2>
        </div>
        <Icon className="h-5 w-5 shrink-0 text-[#d4b34a]" strokeWidth={1.5} />
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a24a]">{label}</div>
      <div className="mt-3 text-3xl text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
        {value}
      </div>
      <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/70">{detail}</p>
    </div>
  );
}

function SubsystemCard({ subsystem }: { subsystem: ContinuumSubsystem }) {
  const blockers = safeArray(subsystem.blockers);
  const sourceCounts = Object.entries(subsystem.sourceRecordCounts ?? {});
  // BUILD-059: compute priority band for this subsystem
  const scored = useMemo(() => scoreSubsystems([subsystem])[0], [subsystem]);
  const band = priorityBandMeta(scored.priorityBand);
  return (
    <article className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a24a]">{subsystem.category}</div>
          <h3 className="mt-1 text-lg text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            {subsystem.name}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${band.className}`}>
            {band.label}
          </span>
          <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${statusClass(subsystem.status)}`}>
            {subsystem.status}
          </span>
        </div>
      </div>
      <p className="mt-3 text-[13px] font-medium leading-5 text-emerald-100/90">→ {subsystem.recommendedNextAction}</p>
      <p className="mt-3 text-[12.5px] leading-5 text-[#cfc8b8]/76">{subsystem.summary}</p>
      <div className="mt-3 grid gap-2 text-[11px] text-[#cfc8b8]/72 sm:grid-cols-2">
        <div>Data coverage: {subsystem.dataCoverage ?? 0}%</div>
        <div>Evidence quality: {subsystem.evidenceQuality ?? 0}%</div>
        <div>Integration: {subsystem.integrationReadiness ?? 0}%</div>
        <div>Automation: {subsystem.automationReadiness ?? 0}%</div>
        <div>Reliability: {subsystem.operationalReliability ?? 0}%</div>
        <div>Active jobs: {subsystem.activeJobs ?? 0}</div>
      </div>
      <details className="mt-3 rounded-lg border border-white/[0.06] bg-black/15 p-2">
        <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.14em] text-[#cfc8b8]/55">Completeness: {subsystem.completeness}%</summary>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#d4b34a]/60" style={{ width: `${Math.max(0, Math.min(100, subsystem.completeness))}%` }} />
        </div>
      </details>
      {sourceCounts.length ? (
        <p className="mt-3 break-all font-mono text-[9px] leading-4 text-[#cfc8b8]/62">
          Source count: {sourceCounts.slice(0, 2).map(([table, count]) => `${table}=${count.toLocaleString()}`).join('; ')}
        </p>
      ) : null}
      {subsystem.telemetryFreshness ? (
        <p className="mt-2 text-[11px] leading-4 text-[#cfc8b8]/62">Freshness: {subsystem.telemetryFreshness}</p>
      ) : null}
      {blockers.length ? (
        <p className="mt-3 text-[12px] leading-5 text-amber-100/82">Blocker: {blockers[0]}</p>
      ) : null}
      {safeArray(subsystem.failures).length ? (
        <p className="mt-2 text-[12px] leading-5 text-red-100/78">Failure: {safeArray(subsystem.failures)[0]}</p>
      ) : null}
    </article>
  );
}

function CompletenessRow({ subsystem }: { subsystem: ContinuumSubsystem }) {
  const scored = useMemo(() => scoreSubsystems([subsystem])[0], [subsystem]);
  const band = priorityBandMeta(scored.priorityBand);
  return (
    <div className="grid gap-3 rounded-lg border border-white/[0.07] bg-black/18 p-3 sm:grid-cols-[190px_1fr_120px_80px] sm:items-center">
      <div>
        <div className="text-sm text-[#faf7f2]">{subsystem.name}</div>
        <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[#c9a24a]">{subsystem.category}</div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#d4b34a]/60" style={{ width: `${subsystem.completeness}%` }} />
      </div>
      <span className={`rounded-full border px-2.5 py-1 text-center font-mono text-[9px] uppercase tracking-[0.16em] ${band.className}`}>
        {band.label}
      </span>
      <span className="text-center font-mono text-[9px] text-[#cfc8b8]/50">{subsystem.completeness}%</span>
    </div>
  );
}

function HarvesterRow({
  harvester,
  ownerAuthorized,
  pendingAction,
  onAction,
}: {
  harvester: HarvesterStatus;
  ownerAuthorized: boolean;
  pendingAction: string | null;
  onAction: (harvester: HarvesterStatus, action: 'run-once' | 'pause' | 'resume' | 'retire' | 'restore' | 'reassess') => void;
}) {
  const authReason = ownerAuthorized
    ? 'This action will be sent to the authenticated Calyx backend and logged.'
    : 'Disabled until the Calyx backend authorizes this exact harvester action for an authenticated owner.';
  const pauseResumeAction = harvester.state === 'paused' ? 'resume' : 'pause';
  const retiredAction = harvester.state === 'retired' ? 'restore' : 'retire';
  const buttonClass = (enabled: boolean) =>
    enabled
      ? 'inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] hover:bg-[#d4b34a]/10 disabled:cursor-wait disabled:opacity-60'
      : 'inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#cfc8b8]/55';
  const isPending = (action: string) => pendingAction === `${harvester.id}:${action}`;
  const actionLabel = (state: ControlState) => (ownerAuthorized ? 'owner authorized' : controlLabel(state));
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            {harvester.name}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#cfc8b8]/70">{harvester.source}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${statusClass(harvester.state === 'planned' ? 'stub' : harvester.state === 'error' ? 'error' : 'unknown')}`}>
          {harvester.state}
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-[12px] text-[#cfc8b8]/78 sm:grid-cols-2">
        <div>Target: {harvester.target ?? 'unknown'}</div>
        <div>Schedule: {harvester.schedule ?? 'unknown'}</div>
        <div>Last run: {displayTime(harvester.lastRun)}</div>
        <div>Next run: {harvester.nextRun ?? 'unknown'}</div>
        <div>Rows processed: {harvester.rowsProcessed ?? 0}</div>
        <div>Rows inserted: {harvester.rowsInserted ?? 0}</div>
        <div>Rows updated: {harvester.rowsUpdated ?? 0}</div>
        <div>Duplicates: {harvester.duplicatesDetected ?? 0}</div>
        <div>Duplicate rate: {Math.round((harvester.duplicateRate ?? 0) * 100)}%</div>
        <div>Novelty/yield: {Math.round((harvester.noveltyRate ?? 0) * 100)}%</div>
        <div>Freshness: {harvester.freshness ?? 'unknown'}</div>
        <div>Source exhaustion: {Math.round((harvester.sourceExhaustion ?? 0) * 100)}%</div>
        <div>Recommendation: {harvester.recommendation ?? 'unknown'}</div>
        <div>Approval: {harvester.approvalStatus ?? BACKEND_OWNER_AUTHORIZATION_LABEL}</div>
        <div>Checkpoint: {harvester.checkpoint ?? 'not exposed'}</div>
        <div>Warnings: {harvester.warningCount}</div>
      </div>
      {safeArray(harvester.errors).length ? (
        <p className="mt-3 text-[12px] leading-5 text-red-100/80">Recent error: {safeArray(harvester.errors)[0]}</p>
      ) : null}
      <p className="mt-3 text-[12px] leading-5 text-[#cfc8b8]/70">{harvester.logSummary}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          disabled={!ownerAuthorized || isPending('run-once')}
          title={authReason}
          onClick={() => onAction(harvester, 'run-once')}
          className={buttonClass(ownerAuthorized)}
        >
          <PlayCircle className="h-3.5 w-3.5" /> {isPending('run-once') ? 'Running...' : `Run now: ${actionLabel(harvester.runNow)}`}
        </button>
        <button
          disabled={!ownerAuthorized || isPending(pauseResumeAction)}
          title={authReason}
          onClick={() => onAction(harvester, pauseResumeAction)}
          className={buttonClass(ownerAuthorized)}
        >
          <PauseCircle className="h-3.5 w-3.5" /> {isPending(pauseResumeAction) ? 'Updating...' : `${pauseResumeAction}: ${actionLabel(harvester.pauseResume)}`}
        </button>
        <button disabled title={authReason} className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#cfc8b8]/55">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Change target: backend form pending
        </button>
        <button disabled title={authReason} className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#cfc8b8]/55">
          <RefreshCw className="h-3.5 w-3.5" /> Schedule: backend form pending
        </button>
        <button
          disabled={!ownerAuthorized || isPending('reassess')}
          title={authReason}
          onClick={() => onAction(harvester, 'reassess')}
          className={buttonClass(ownerAuthorized)}
        >
          <RefreshCw className="h-3.5 w-3.5" /> {isPending('reassess') ? 'Reassessing...' : `Reassess: ${actionLabel(harvester.reassess)}`}
        </button>
        <button disabled title="Recommendation approval requires a selected backend proposal ID." className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#cfc8b8]/55">
          <Check className="h-3.5 w-3.5" /> Approve recommendation: needs proposal
        </button>
        <button
          disabled={!ownerAuthorized || isPending(retiredAction)}
          title={authReason}
          onClick={() => onAction(harvester, retiredAction)}
          className={buttonClass(ownerAuthorized)}
        >
          <AlertTriangle className="h-3.5 w-3.5" /> {isPending(retiredAction) ? 'Updating...' : `${retiredAction}: logged`}
        </button>
      </div>
    </div>
  );
}

function DisplayPreferencesPanel({
  preferences,
  onChange,
}: {
  preferences: DisplayPreferences;
  onChange: (preferences: DisplayPreferences) => void;
}) {
  const setPreference = <Key extends keyof DisplayPreferences>(key: Key, value: DisplayPreferences[Key]) => {
    onChange({ ...preferences, [key]: value });
  };

  return (
    <section className="rounded-lg border border-white/[0.08] bg-[#0b1c11]/85 p-4" aria-labelledby="mission-display-preferences">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">Display preferences</div>
          <h2 id="mission-display-preferences" className="mt-1 text-lg text-[#faf7f2]">
            Accessible reading controls
          </h2>
        </div>
        <Eye className="h-5 w-5 text-[#d4b34a]" strokeWidth={1.5} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr]">
        <label className="text-sm text-[#f5f0e8]/84">
          Text scale
          <select
            value={preferences.textScale}
            onChange={(event) => setPreference('textScale', event.target.value as DisplayTextScale)}
            className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[#f5f0e8] outline-none focus:border-[#d4b34a]/70"
          >
            <option value="standard">Standard</option>
            <option value="large">Large</option>
            <option value="extra">Extra large</option>
          </select>
        </label>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ['comfortableSpacing', 'Comfortable spacing'],
            ['highContrast', 'Higher contrast'],
            ['reduceMotion', 'Reduce motion'],
            ['focusModeDefault', 'Prefer focus mode'],
            ['hideHealthyDefault', 'Hide healthy in overview'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-black/18 px-3 py-2 text-sm text-[#f5f0e8]/84">
              <input
                type="checkbox"
                checked={Boolean(preferences[key as keyof DisplayPreferences])}
                onChange={(event) => setPreference(key as keyof DisplayPreferences, event.target.checked as never)}
                className="h-4 w-4 accent-[#d4b34a]"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function AttentionSummary({
  items,
  activeFilter,
  onFilterChange,
}: {
  items: FocusItem[];
  activeFilter: MissionFilter;
  onFilterChange: (filter: MissionFilter) => void;
}) {
  const counts = {
    urgent: items.filter((item) => item.priority === 'urgent').length,
    attention: items.filter((item) => item.priority === 'attention').length,
    owner: items.filter((item) => item.details.some((detail) => detail.toLowerCase().includes('owner') || detail.toLowerCase().includes('authorization'))).length,
    recommendations: items.filter((item) => item.kind === 'recommendation' || item.priority === 'recommendation').length,
  };

  return (
    <section className="rounded-lg border border-white/[0.08] bg-[#102116]/90 p-4" aria-labelledby="mission-attention-summary">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">Attention summary</div>
          <h2 id="mission-attention-summary" className="mt-1 text-xl text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            Prioritized operations queue
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <div className="rounded-lg border border-red-200/25 bg-red-300/10 px-3 py-2"><div className="text-xl text-red-100">{counts.urgent}</div><div className="font-mono text-[8px] uppercase tracking-[0.14em] text-red-100/70">Urgent</div></div>
          <div className="rounded-lg border border-amber-200/25 bg-amber-300/10 px-3 py-2"><div className="text-xl text-amber-100">{counts.attention}</div><div className="font-mono text-[8px] uppercase tracking-[0.14em] text-amber-100/70">Attention</div></div>
          <div className="rounded-lg border border-sky-200/25 bg-sky-300/10 px-3 py-2"><div className="text-xl text-sky-100">{counts.owner}</div><div className="font-mono text-[8px] uppercase tracking-[0.14em] text-sky-100/70">Owner</div></div>
          <div className="rounded-lg border border-[#d4b34a]/25 bg-[#d4b34a]/10 px-3 py-2"><div className="text-xl text-[#f1d878]">{counts.recommendations}</div><div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#f1d878]/70">Calyx</div></div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Mission Control semantic filters">
        {missionFilters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => onFilterChange(filter.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors ${
              activeFilter === filter.id
                ? 'border-[#d4b34a]/70 bg-[#d4b34a]/18 text-[#f1d878]'
                : 'border-white/12 bg-black/18 text-[#f5f0e8]/75 hover:border-[#d4b34a]/45 hover:text-[#d4b34a]'
            }`}
          >
            <Filter className="h-3.5 w-3.5" /> {filter.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function FocusItemCard({ item, onOpen }: { item: FocusItem; onOpen: (item: FocusItem) => void }) {
  const meta = priorityMeta(item.priority);
  return (
    <article className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a24a]">{item.kind} / {item.source}</div>
          <h3 className="mt-1 text-lg text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            {item.title}
          </h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${meta.className}`}>
          {meta.label}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#f5f0e8]/84">{item.interpretation}</p>
      <div className="mt-3 grid gap-2 text-[12px] text-[#cfc8b8]/78 sm:grid-cols-2">
        <div>Status: {item.statusLabel}</div>
        <div>Metric: {item.metric}</div>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-emerald-100/82">Next: {item.nextAction}</p>
      <details className="mt-3 rounded-lg border border-white/[0.07] bg-black/20 p-3">
        <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a]">Calyx explanation</summary>
        <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/78">
          {item.calyx.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </details>
      <button
        onClick={() => onOpen(item)}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/25 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] transition-colors hover:border-[#d4b34a]/60 hover:bg-[#d4b34a]/10 focus:outline-none focus:ring-2 focus:ring-[#d4b34a]/70"
      >
        <Eye className="h-3.5 w-3.5" /> Open focus view
      </button>
    </article>
  );
}

function downloadTextFile(filename: string, content: string, mime = 'text/markdown'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildPdfAuditPlaceholder(sourceEndpoint: string, missingEvidence: string): string {
  return [
    'Mission Control Audit Placeholder (PDF fallback)',
    `Timestamp: ${new Date().toISOString()}`,
    'Confidence: medium',
    `Evidence source: ${sourceEndpoint}`,
    'Subsystem coverage: live/cached Mission Control telemetry',
    `Missing evidence: ${missingEvidence}`,
  ].join('\n');
}

function OwnerGuideCard({ guide }: { guide: OwnerSubsystemGuide }) {
  return (
    <article className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a24a]">{guide.category}</div>
          <h3 className="mt-1 text-lg text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            {guide.name}
          </h3>
        </div>
        <span className="rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#f1d878]">
          {guide.readiness}% ready
        </span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-white/[0.07] bg-black/16 p-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#d4b34a]">What is this?</div>
          <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/82">{guide.purpose}</p>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-black/16 p-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#d4b34a]">Why it matters</div>
          <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/82">{guide.scientificImportance}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-[12px] leading-5 text-[#cfc8b8]/78 sm:grid-cols-2">
        <div>Completion: {guide.completion}%</div>
        <div>Exports: {guide.exportOptions.join(', ')}</div>
        <div>Sources: {guide.dataSources.join(', ')}</div>
        <div>Dependencies: {guide.dependencies.join(', ')}</div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-emerald-100">What can I do?</div>
          <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/82">
            {guide.ownerActions.map((action) => <li key={action}>{action}</li>)}
          </ul>
        </div>
        <div className="rounded-lg border border-sky-300/20 bg-sky-300/10 p-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-sky-100">What is Calyx doing?</div>
          <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/82">
            {guide.automaticCalyxActions.map((action) => <li key={action}>{action}</li>)}
          </ul>
        </div>
        <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
          <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-amber-100">Decision needed</div>
          <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/82">{guide.limitations[0] ?? 'Choose the next owner-approved capability.'}</p>
          <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/70">Next: {guide.plannedCapability}</p>
        </div>
      </div>
    </article>
  );
}

function OwnerGuidePanel() {
  return (
    <Panel id="mission-control-owner-guide" eyebrow="Owner Guide" title="Subsystem Owner Guide" icon={BookOpen}>
      <div className="mb-4 rounded-lg border border-[#d4b34a]/20 bg-[#d4b34a]/10 p-4 text-sm leading-6 text-[#f5f0e8]/84">
        Every subsystem answers: what is this, what can I do, what is Calyx doing, and what decision does Calyx need from me.
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {ownerGuides.map((guide) => <OwnerGuideCard key={guide.id} guide={guide} />)}
      </div>
    </Panel>
  );
}

// ─── BUILD-059: Daily Brief ───────────────────────────────────────────────────

function DailyBriefPanel({
  dashboard,
  focusModeActive,
  onToggleFocusMode,
}: {
  dashboard: MissionControlOperations | null;
  focusModeActive: boolean;
  onToggleFocusMode: () => void;
}) {
  const greeting = useMemo(() => getGreeting(), []);
  const metrics = useMemo(() => deriveDailyMetrics(dashboard), [dashboard]);
  const scoredSystems = useMemo(
    () => scoreSubsystems([...(dashboard?.globalHealth ?? []), ...(dashboard?.scientificSystems ?? [])]).slice(0, 5),
    [dashboard],
  );
  const healthLabel = (h: typeof metrics.runtimeHealth) =>
    h === 'healthy' ? '✓ Healthy' : h === 'degraded' ? '⚠ Degraded' : h === 'offline' ? '✗ Offline' : '— Unknown';

  return (
    <section id="mission-control-daily-brief" className="scroll-mt-28 rounded-lg border border-[#d4b34a]/30 bg-gradient-to-br from-[#0d1d13]/95 to-[#0b1a10]/90 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">BUILD-059 — Intelligent Mission Control</div>
          <h2 className="mt-2 text-3xl text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            {greeting}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-[#d4b34a]" strokeWidth={1.5} />
          <button
            onClick={onToggleFocusMode}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors ${
              focusModeActive
                ? 'border-[#d4b34a]/70 bg-[#d4b34a]/18 text-[#f1d878]'
                : 'border-white/15 text-[#f5f0e8]/80 hover:border-[#d4b34a]/50 hover:text-[#d4b34a]'
            }`}
          >
            <Eye className="h-3.5 w-3.5" /> {focusModeActive ? 'Focus mode on' : 'Focus mode'}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Today's activity */}
        <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#c9a24a]">Today's activity</div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-[#f5f0e8]/86">
            <li className="flex items-center justify-between gap-3">
              <span>New observations processed</span>
              <span className="font-mono text-[#d4b34a]">{metrics.observationsProcessed || '—'}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Images processed</span>
              <span className="font-mono text-[#d4b34a]">{metrics.imagesProcessed || '—'}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Literature added</span>
              <span className="font-mono text-[#d4b34a]">{metrics.literatureAdded || '—'}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Taxonomy conflicts</span>
              <span className={`font-mono ${metrics.taxonomyConflicts > 0 ? 'text-amber-300' : 'text-[#d4b34a]'}`}>{metrics.taxonomyConflicts || '—'}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Knowledge graph changes</span>
              <span className="font-mono text-[#d4b34a]">{metrics.knowledgeGraphChanges || '—'}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>New grants</span>
              <span className="font-mono text-[#d4b34a]">{metrics.newGrants || '—'}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Runtime health</span>
              <span className={`font-mono ${metrics.runtimeHealth === 'healthy' ? 'text-emerald-300' : metrics.runtimeHealth === 'degraded' ? 'text-amber-300' : 'text-red-300'}`}>
                {healthLabel(metrics.runtimeHealth)}
              </span>
            </li>
          </ul>
        </div>

        {/* Top 5 priorities */}
        <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#c9a24a]">Top 5 priorities</div>
          <p className="mt-1 text-[11px] text-[#cfc8b8]/60">Ordered by urgency · scientific value · grant impact · system dependency</p>
          {scoredSystems.length ? (
            <ol className="mt-4 space-y-3">
              {scoredSystems.map((sys, index) => {
                const band = priorityBandMeta(sys.priorityBand);
                return (
                  <li key={sys.id} className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-[10px] text-[#c9a24a]">{index + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-[#faf7f2]">{sys.name}</span>
                        <span className={`rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] ${band.className}`}>{band.label}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-emerald-100/80">{sys.recommendedNextAction}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-[#cfc8b8]/65">Loading priority data...</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── BUILD-059: Live Activity Feed ────────────────────────────────────────────

function LiveActivityFeedPanel({ activities }: { activities: RecentActivity[] }) {
  const feedRef = useRef<HTMLDivElement>(null);
  const events = activities.length ? activities : FALLBACK_ACTIVITY_EVENTS;
  const isFallback = activities.length === 0;

  return (
    <Panel id="mission-control-activity-feed" eyebrow="Live activity" title="Activity Timeline" icon={TrendingUp}>
      {isFallback && (
        <div className="mb-4 rounded-lg border border-[#d4b34a]/20 bg-[#d4b34a]/08 p-3 text-[11px] leading-5 text-[#f5f0e8]/70">
          Showing demo events — live backend events will appear here when connected.
        </div>
      )}
      <div ref={feedRef} className="max-h-96 space-y-2 overflow-y-auto pr-1">
        {events.map((event) => {
          const time = (() => {
            try {
              return new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch {
              return '';
            }
          })();
          return (
            <div key={event.id} className="flex gap-3 rounded-lg border border-white/[0.06] bg-black/15 p-3">
              <span className="mt-0.5 shrink-0 font-mono text-[9px] text-[#c9a24a]">{time}</span>
              <div className="min-w-0">
                <div className="text-sm text-[#faf7f2]">{event.label}</div>
                <p className="mt-1 text-[11px] leading-4 text-[#cfc8b8]/72">{event.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ─── BUILD-059: Scientific Insights ──────────────────────────────────────────

function ScientificInsightsPanel({ dashboard }: { dashboard: MissionControlOperations | null }) {
  const insights = useMemo(() => deriveScientificInsights(dashboard), [dashboard]);
  const categoryIcon = (cat: string) => {
    if (cat === 'gap') return '◌';
    if (cat === 'discovery') return '✦';
    if (cat === 'opportunity') return '→';
    if (cat === 'relationship') return '⟷';
    if (cat === 'grant') return '$';
    return '·';
  };

  return (
    <Panel id="mission-control-insights" eyebrow="Scientific intelligence" title="Today's Scientific Insights" icon={Brain}>
      <div className="mb-4 rounded-lg border border-[#d4b34a]/15 bg-[#d4b34a]/08 p-3 text-[12px] leading-5 text-[#f5f0e8]/78">
        Gaps, discoveries, opportunities, and relationships surfaced from the current platform state.
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {insights.map((insight) => (
          <article key={insight.id} className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg text-[#d4b34a]">{categoryIcon(insight.category)}</span>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c9a24a]">{insight.category}</div>
                <h3 className="mt-1 text-base text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
                  {insight.label}
                </h3>
              </div>
            </div>
            <p className="mt-3 text-[12.5px] leading-5 text-[#cfc8b8]/82">{insight.detail}</p>
            <p className="mt-3 text-[12px] leading-5 text-emerald-100/82">→ {insight.actionHint}</p>
          </article>
        ))}
      </div>
    </Panel>
  );
}

// ─── BUILD-059: Owner Focus Mode Widget ───────────────────────────────────────

function OwnerFocusModeWidget({
  scoredSystems,
  ownerDecisionItems,
  waitingExternalItems,
  onClose,
}: {
  scoredSystems: ScoredSubsystem[];
  ownerDecisionItems: string[];
  waitingExternalItems: string[];
  onClose: () => void;
}) {
  const top = scoredSystems[0];
  const band = top ? priorityBandMeta(top.priorityBand) : null;

  return (
    <section className="rounded-lg border border-[#d4b34a]/40 bg-gradient-to-br from-[#0e1f14]/95 to-[#0a1910]/90 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#d4b34a]">Owner focus mode</div>
          <h2 className="mt-1 text-2xl text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            What needs your attention now
          </h2>
        </div>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#f5f0e8] hover:border-[#d4b34a]/60 hover:text-[#d4b34a]"
        >
          <EyeOff className="h-3.5 w-3.5" /> Exit focus
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Current priority */}
        <div className="rounded-lg border border-white/[0.08] bg-black/20 p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a24a]">Current priority</div>
          {top ? (
            <>
              <h3 className="mt-2 text-base text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>{top.name}</h3>
              {band && <span className={`mt-2 inline-block rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${band.className}`}>{band.label}</span>}
            </>
          ) : (
            <p className="mt-2 text-sm text-[#cfc8b8]/65">No critical items found.</p>
          )}
        </div>

        {/* Next action */}
        <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/08 p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-200">Next action</div>
          <p className="mt-2 text-sm leading-6 text-[#f5f0e8]/90">
            {top?.recommendedNextAction ?? 'All priorities resolved.'}
          </p>
        </div>

        {/* Owner decisions */}
        <div className="rounded-lg border border-amber-300/20 bg-amber-300/08 p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-amber-200">Required owner decisions</div>
          {ownerDecisionItems.length ? (
            <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/84">
              {ownerDecisionItems.slice(0, 4).map((item) => <li key={item}>· {item}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-[#cfc8b8]/60">No owner decisions pending.</p>
          )}
        </div>

        {/* Waiting external */}
        <div className="rounded-lg border border-sky-300/20 bg-sky-300/08 p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-sky-200">Waiting external</div>
          {waitingExternalItems.length ? (
            <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/84">
              {waitingExternalItems.slice(0, 4).map((item) => <li key={item}>· {item}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-[#cfc8b8]/60">No external dependencies pending.</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── BUILD-059: Executive Platform Status Panel ───────────────────────────────

function ExecutivePlatformStatusPanel({ dashboard }: { dashboard: MissionControlOperations | null }) {
  const status = useMemo(() => buildExecutivePlatformStatus(dashboard), [dashboard]);
  return (
    <Panel id="mission-control-calyx-audit" eyebrow="Calyx" title="Current Platform Status" icon={Bot}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-200">Healthy systems</div>
            {status.healthySystems.length ? (
              <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/84">
                {status.healthySystems.map((s) => <li key={s}>✓ {s}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-[12px] text-[#cfc8b8]/60">No systems confirmed healthy.</p>
            )}
          </div>
          <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-amber-200">Systems needing attention</div>
            {status.needsAttentionSystems.length ? (
              <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/84">
                {status.needsAttentionSystems.map((s) => <li key={s}>⚠ {s}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-[12px] text-[#cfc8b8]/60">No attention items.</p>
            )}
          </div>
        </div>
        {status.criticalBlockers.length > 0 && (
          <div className="rounded-lg border border-red-300/20 bg-red-300/10 p-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-red-200">Critical blockers</div>
            <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/84">
              {status.criticalBlockers.map((s) => <li key={s}>✗ {s}</li>)}
            </ul>
          </div>
        )}
        <div className="rounded-lg border border-[#d4b34a]/20 bg-[#d4b34a]/08 p-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#d4b34a]">Recommended build</div>
          <p className="mt-2 text-[12px] leading-5 text-[#f5f0e8]/84">{status.recommendedBuild}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/[0.08] bg-black/18 p-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a24a]">Scientific readiness</div>
            <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/84">{status.estimatedScientificReadiness}</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-black/18 p-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a24a]">Grant readiness</div>
            <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/84">{status.estimatedGrantReadiness}</p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function CalyxOperationsQueuePanel({
  backendItems,
  ownerAuthorized,
  onTransition,
}: {
  backendItems: BackendOperationsQueueItem[];
  ownerAuthorized: boolean;
  onTransition: (item: BackendOperationsQueueItem, transition: 'approve' | 'reject' | 'cancel' | 'retry') => void;
}) {
  const lanes = ['Now Working', 'Queued', 'Waiting Owner', 'Waiting External', 'Completed Today'] as const;
  const commandStateLabel = (status?: string, authorizationState?: string): string => {
    if (authorizationState === 'pending_owner' || status === 'awaiting_owner' || status === 'proposed' || status === 'approved') return 'Pending Owner Approval';
    if (status === 'running') return 'Running';
    if (status === 'completed' || status === 'completed_degraded') return 'Completed';
    if (status === 'failed' || status === 'blocked') return 'Failed';
    return 'Queued';
  };
  const laneForBackendStatus = (status?: string): (typeof lanes)[number] => {
    if (status === 'running') return 'Now Working';
    if (status === 'awaiting_owner' || status === 'proposed' || status === 'approved') return 'Waiting Owner';
    if (status === 'completed' || status === 'completed_degraded') return 'Completed Today';
    if (status === 'blocked') return 'Waiting External';
    return 'Queued';
  };
  const displayItems = backendItems.length
    ? backendItems.map((item) => ({
        ...item,
        lane: laneForBackendStatus(item.status),
        subsystem: item.related_subsystem ?? item.task_type ?? 'Mission Control',
        detail: item.result_summary ?? item.next_required_action ?? 'Backend queue item recorded.',
        ownerDecision: item.next_required_action,
        commandState: commandStateLabel(item.status, item.authorization_state),
      }))
    : operationsQueue;
  return (
    <Panel id="mission-control-calyx-queue" eyebrow="Calyx Operations" title="Now Working and Decision Queue" icon={ClipboardList}>
      <div className="mb-4 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-[12px] leading-5 text-emerald-100/82">
        Operational level: {backendItems.length ? 'Live database queue' : 'Static fallback queue until an owner backend session loads.'}
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        {lanes.map((lane) => (
          <div key={lane} className="rounded-lg border border-white/[0.08] bg-black/18 p-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a]">{lane}</div>
            <div className="mt-3 space-y-3">
              {displayItems.filter((item) => item.lane === lane).map((item) => (
                <article key={item.id} className="rounded-lg border border-white/[0.07] bg-[#0d1d13]/80 p-3">
                  <div className="text-sm text-[#faf7f2]">{item.title}</div>
                  <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#cfc8b8]/58">{item.subsystem}</div>
                  <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/78">{item.detail}</p>
                  {item.ownerDecision ? <p className="mt-2 text-[12px] leading-5 text-amber-100/82">Decision: {item.ownerDecision}</p> : null}
                  {'commandState' in item ? (
                    <div className="mt-2 font-mono text-[8px] uppercase tracking-[0.14em] text-[#d4b34a]">{item.commandState}</div>
                  ) : null}
                  {'status' in item ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(['approve', 'reject', 'cancel', 'retry'] as const).map((transition) => (
                        <button
                          key={transition}
                          disabled={!ownerAuthorized}
                          onClick={() => onTransition(item as BackendOperationsQueueItem, transition)}
                          className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#cfc8b8]/75 hover:border-[#d4b34a]/50 hover:text-[#d4b34a] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {transition}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ExecutiveAuditPanel({
  onDownload,
  disabled,
}: {
  onDownload: (template: ExecutiveAuditTemplate, format: 'markdown' | 'json' | 'pdf') => void;
  disabled: boolean;
}) {
  return (
    <Panel id="mission-control-executive-audits" eyebrow="Executive Audit Engine" title="Downloadable Audit Packages" icon={FileDown}>
      <div className="grid gap-4 lg:grid-cols-2">
        {executiveAuditTemplates.map((template) => (
          <article key={template.id} className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>{template.title}</h3>
                <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/76">{template.scope}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={disabled} onClick={() => onDownload(template, 'markdown')} className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] hover:bg-[#d4b34a]/10 disabled:cursor-not-allowed disabled:opacity-45">
                  <Download className="h-3.5 w-3.5" /> Markdown
                </button>
                <button disabled={disabled} onClick={() => onDownload(template, 'json')} className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] hover:bg-[#d4b34a]/10 disabled:cursor-not-allowed disabled:opacity-45">
                  <FileText className="h-3.5 w-3.5" /> JSON
                </button>
                <button disabled={disabled} onClick={() => onDownload(template, 'pdf')} className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] hover:bg-[#d4b34a]/10 disabled:cursor-not-allowed disabled:opacity-45">
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {template.formats.map((format) => <span key={format} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#cfc8b8]/75">{format}</span>)}
            </div>
            <p className="mt-3 text-[12px] leading-5 text-emerald-100/75">Includes: {template.includes.join(', ')}</p>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function PartnershipGeneratorPanel({ onDownload, disabled }: { onDownload: (template: PartnershipTemplate) => void; disabled: boolean }) {
  return (
    <Panel id="mission-control-partnerships" eyebrow="Partnership Generator" title="Partner-Specific Reports" icon={Handshake}>
      <div className="grid gap-4 lg:grid-cols-2">
        {partnershipTemplates.map((template) => (
          <article key={template.id} className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>{template.partner}</h3>
                <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/76">{template.mission}</p>
              </div>
              <button disabled={disabled} onClick={() => onDownload(template)} className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] hover:bg-[#d4b34a]/10 disabled:cursor-not-allowed disabled:opacity-45">
                <Download className="h-3.5 w-3.5" /> Packet
              </button>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[#cfc8b8]/82">Federation: {template.federationOpportunity}</p>
            <p className="mt-3 text-[12px] leading-5 text-sky-100/80">Integrations: {template.desiredIntegrations.join(', ')}</p>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function ResearchCommandPanel({ onPrepare, disabled }: { onPrepare: (template: ResearchCommandTemplate) => void; disabled: boolean }) {
  return (
    <Panel id="mission-control-research-command" eyebrow="Research Command Center" title="Owner-Launched Research" icon={Search}>
      <div className="grid gap-4 lg:grid-cols-2">
        {researchCommands.map((template) => (
          <article key={template.id} className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>{template.label}</h3>
                <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/76">{template.prompt}</p>
              </div>
              <button disabled={disabled} onClick={() => onPrepare(template)} className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] hover:bg-[#d4b34a]/10 disabled:cursor-not-allowed disabled:opacity-45">
                <Send className="h-3.5 w-3.5" /> Save request
              </button>
            </div>
            <div className="mt-3 grid gap-2 text-[12px] text-[#cfc8b8]/78 sm:grid-cols-2">
              <div>Output: {template.output}</div>
              <div>Review: {template.ownerReview}</div>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function ResearchInboxPanel() {
  return (
    <Panel eyebrow="Research Inbox" title="Daily Owner Workflow" icon={Inbox}>
      <div className="grid gap-3 md:grid-cols-2">
        {researchInbox.map((item) => (
          <article key={item.id} className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm text-[#faf7f2]">{item.title}</h3>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#c9a24a]">{item.source}</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#cfc8b8]/75">{item.status}</span>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[#cfc8b8]/78">{item.detail}</p>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function OwnerManualPanel() {
  return (
    <Panel id="mission-control-owner-manual" eyebrow="Owner Manual" title="Operating Manual" icon={BookOpen}>
      <div className="grid gap-4 lg:grid-cols-2">
        {ownerManualTopics.map((topic) => (
          <article key={topic.id} className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
            <h3 className="text-lg text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>{topic.title}</h3>
            <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/80">{topic.workflow}</p>
            <ol className="mt-3 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/72">
              {topic.steps.map((step, index) => <li key={step}>{index + 1}. {step}</li>)}
            </ol>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function LifecyclePanel() {
  const stages = ['Dream', 'Specification', 'Building', 'Validation', 'Production', 'Maintenance'] as const;
  return (
    <Panel id="mission-control-lifecycle" eyebrow="Development Lifecycle" title="Official Continuum Roadmap" icon={Layers}>
      <div className="grid gap-3 xl:grid-cols-6">
        {stages.map((stage) => (
          <div key={stage} className="rounded-lg border border-white/[0.08] bg-black/18 p-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a]">{stage}</div>
            <div className="mt-3 space-y-3">
              {lifecycleProjects.filter((project) => project.stage === stage).map((project) => (
                <article key={project.id} className="rounded-lg border border-white/[0.07] bg-[#0d1d13]/80 p-3">
                  <div className="text-sm text-[#faf7f2]">{project.name}</div>
                  <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/72">{project.nextCheckpoint}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CommandBarPanel({
  value,
  onChange,
  onSubmit,
  disabled,
  statusMessage,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  statusMessage: string | null;
}) {
  // BUILD-059: natural language prompts for conversational CALYX
  const nlPrompts = [
    'What should I work on tonight?',
    'Prepare a grant.',
    'Audit pollinators.',
    'Review Atlas.',
    'Generate today\'s executive report.',
    'Find missing habitat data.',
    'Audit Orchid Continuum',
    'Generate Grant Report',
  ];
  return (
    <Panel id="mission-control-command" eyebrow="Conversational Calyx" title="Ask Calyx What To Do Next" icon={Send}>
      <div className="mb-4 rounded-lg border border-[#d4b34a]/20 bg-[#d4b34a]/08 p-3 text-[12px] leading-5 text-[#f5f0e8]/80">
        Use natural language. Ask what to work on, request a grant package, audit a system, or generate a report.
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a24a]">Natural language prompt</span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSubmit();
            }}
            placeholder="What should I work on tonight?"
            className="mt-2 w-full rounded-lg border border-white/12 bg-black/25 px-4 py-3 text-sm text-[#f5f0e8] outline-none focus:border-[#d4b34a]/70"
          />
        </label>
        <button disabled={disabled} onClick={onSubmit} className="inline-flex h-fit items-center justify-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#12170d] hover:bg-[#e5c85c] disabled:cursor-not-allowed disabled:opacity-45 lg:self-end">
          <Send className="h-3.5 w-3.5" /> Submit
        </button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {nlPrompts.slice(0, 8).map((sample) => (
          <button key={sample} onClick={() => onChange(sample)} className="rounded-lg border border-white/[0.08] bg-black/18 px-3 py-2 text-left text-[12px] text-[#cfc8b8]/82 hover:border-[#d4b34a]/45 hover:text-[#d4b34a]">
            {sample}
          </button>
        ))}
      </div>
      <p className="mt-4 text-[12px] leading-5 text-[#cfc8b8]/70">
        Operational level: {disabled ? 'Requires live backend owner session.' : 'Live backend command record with durable operations queue entry.'}
      </p>
      {statusMessage ? <p className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100/84">{statusMessage}</p> : null}
    </Panel>
  );
}

function FocusModeDialog({
  items,
  activeItem,
  onClose,
  onChange,
}: {
  items: FocusItem[];
  activeItem: FocusItem | null;
  onClose: () => void;
  onChange: (item: FocusItem) => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!activeItem) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => {
      returnFocusRef.current?.focus();
    };
  }, [activeItem]);

  useEffect(() => {
    if (!activeItem) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const index = items.findIndex((item) => item.id === activeItem.id);
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'ArrowRight' && items.length) {
        event.preventDefault();
        onChange(items[(index + 1 + items.length) % items.length]);
      }
      if (event.key === 'ArrowLeft' && items.length) {
        event.preventDefault();
        onChange(items[(index - 1 + items.length) % items.length]);
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, a, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')).filter(
          (element) => !element.hasAttribute('disabled') && element.offsetParent !== null,
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeItem, items, onChange, onClose]);

  if (!activeItem) return null;

  const index = Math.max(0, items.findIndex((item) => item.id === activeItem.id));
  const meta = priorityMeta(activeItem.priority);
  const previousItem = items[(index - 1 + items.length) % items.length];
  const nextItem = items[(index + 1) % items.length];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-focus-title"
        tabIndex={-1}
        className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-lg border border-[#d4b34a]/30 bg-[#07140d] p-5 text-[#f5f0e8] shadow-2xl outline-none focus:ring-2 focus:ring-[#d4b34a]/70"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">
              Focus mode {index + 1} of {items.length}
            </div>
            <h2 id="mission-focus-title" className="mt-2 text-3xl leading-tight text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
              {activeItem.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a]/60 hover:text-[#d4b34a]"
          >
            <EyeOff className="h-3.5 w-3.5" /> Close
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div className="rounded-lg border border-white/[0.08] bg-black/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${meta.className}`}>{meta.label}</span>
                <span className="rounded-full border border-white/12 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#cfc8b8]">{activeItem.kind}</span>
                <span className="rounded-full border border-white/12 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#cfc8b8]">{activeItem.source}</span>
              </div>
              <p className="mt-4 text-base leading-7 text-[#f5f0e8]/88">{activeItem.interpretation}</p>
              <p className="mt-4 text-sm leading-6 text-emerald-100/84">Next: {activeItem.nextAction}</p>
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-black/20 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c9a24a]">Operational details</div>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><dt className="text-[11px] uppercase text-[#cfc8b8]/60">Status</dt><dd className="mt-1 text-sm text-[#f5f0e8]">{activeItem.statusLabel}</dd></div>
                <div><dt className="text-[11px] uppercase text-[#cfc8b8]/60">Metric</dt><dd className="mt-1 text-sm text-[#f5f0e8]">{activeItem.metric}</dd></div>
              </dl>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-[#cfc8b8]/82">
                {activeItem.details.map((detail) => <li key={detail}>{detail}</li>)}
              </ul>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-[#d4b34a]/20 bg-[#d4b34a]/10 p-4">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f1d878]">
                <Info className="h-3.5 w-3.5" /> Calyx context
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[#f5f0e8]/82">
                {activeItem.calyx.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onChange(previousItem)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a]/60 hover:text-[#d4b34a]"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <button
                onClick={() => onChange(nextItem)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a]/60 hover:text-[#d4b34a]"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function RepositoryRow({
  repository,
  onCopy,
  copiedKey,
}: {
  repository: RepositoryStatus;
  onCopy: (key: string, value: string) => void;
  copiedKey: string | null;
}) {
  const knownBlockers = safeArray(repository.knownBlockers);
  const githubUrl = repositoryUrl(repository.name);
  const deploymentUrl = isWebUrl(repository.deploymentTarget) ? repository.deploymentTarget : null;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base text-[#faf7f2]">{repository.name}</h3>
          <p className="mt-1 text-xs text-[#cfc8b8]/70">Default branch: {repository.defaultBranch}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${statusClass(repository.deployStatus)}`}>
          {repository.deployStatus}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-[12px] text-[#cfc8b8]/78 sm:grid-cols-2">
        <div>Target: {repository.deploymentTarget}</div>
        <div>Open PRs: {repository.openPullRequests ?? 'unknown'}</div>
        <div>Frontend deploy needed: {repository.frontendDeployNeeded ? 'yes' : 'no'}</div>
        <div>Backend deploy needed: {repository.backendDeployNeeded ? 'yes' : 'no'}</div>
      </div>
      {knownBlockers.length ? (
        <p className="mt-3 text-[12px] leading-5 text-amber-100/80">{knownBlockers[0]}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {githubUrl ? (
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/25 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] transition-colors hover:border-[#d4b34a]/60 hover:bg-[#d4b34a]/10"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open GitHub
          </a>
        ) : null}
        {deploymentUrl ? (
          <a
            href={deploymentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/25 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] transition-colors hover:border-[#d4b34a]/60 hover:bg-[#d4b34a]/10"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open deployment
          </a>
        ) : null}
        <button
          onClick={() => onCopy(`repo-${repository.name}`, repository.name)}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a]/60 hover:text-[#d4b34a]"
        >
          {copiedKey === `repo-${repository.name}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy repo
        </button>
        <button
          disabled
          title="Production deployment requires backend owner authorization and cannot be triggered from this frontend."
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#cfc8b8]/55"
        >
          <Rocket className="h-3.5 w-3.5" /> Deploy: {BACKEND_OWNER_AUTHORIZATION_LABEL}
        </button>
      </div>
    </div>
  );
}

function RecommendationCard({
  recommendation,
  onCopy,
  copiedKey,
}: {
  recommendation: Recommendation;
  onCopy: (key: string, value: string) => void;
  copiedKey: string | null;
}) {
  // BUILD-059: convert terse labels to narrative guidance
  const narrativeTitle = toNarrativeTitle(recommendation.title);
  const isNarrative = narrativeTitle !== recommendation.title;
  const copyText = [
    recommendation.title,
    `Priority: ${recommendation.priority}`,
    `Rationale: ${recommendation.rationale}`,
    `Owner decision: ${recommendation.ownerDecisionNeeded}`,
    `Next build: ${recommendation.nextBuild}`,
  ].join('\n');

  return (
    <div className="rounded-lg border border-[#d4b34a]/20 bg-[#d4b34a]/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
          {isNarrative ? recommendation.title : recommendation.title}
        </h3>
        <span className="rounded-full border border-[#d4b34a]/30 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a]">
          {recommendation.priority}
        </span>
      </div>
      {isNarrative && (
        <p className="mt-3 text-base leading-7 text-[#f5f0e8]/90 italic">{narrativeTitle}</p>
      )}
      <p className="mt-3 text-sm leading-6 text-[#f5f0e8]/84">{recommendation.rationale}</p>
      <p className="mt-3 text-[12px] leading-5 text-[#cfc8b8]/78">Owner decision: {recommendation.ownerDecisionNeeded}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-200">Next: {recommendation.nextBuild}</p>
        <button
          onClick={() => onCopy(`recommendation-${recommendation.id}`, copyText)}
          className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/25 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] transition-colors hover:border-[#d4b34a]/60 hover:bg-[#d4b34a]/10"
        >
          {copiedKey === `recommendation-${recommendation.id}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy build
        </button>
      </div>
    </div>
  );
}

function DiagnosticRow({
  diagnostic,
  onCopy,
  copiedKey,
}: {
  diagnostic: EndpointDiagnostic;
  onCopy: (key: string, value: string) => void;
  copiedKey: string | null;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/18 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-[#faf7f2]">{diagnostic.label}</div>
          <div className="mt-1 break-all font-mono text-[9px] text-[#cfc8b8]/55">{diagnostic.endpoint}</div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${statusClass(diagnostic.status)}`}>
          {diagnostic.status}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/74">{diagnostic.detail}</p>
      <button
        onClick={() => onCopy(`endpoint-${diagnostic.endpoint}`, diagnostic.endpoint)}
        className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a]/60 hover:text-[#d4b34a]"
      >
        {copiedKey === `endpoint-${diagnostic.endpoint}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy endpoint
      </button>
    </div>
  );
}

function SafetyRow({ boundary }: { boundary: SafetyBoundary }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/18 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm text-[#faf7f2]">{boundary.label}</div>
        <span className="rounded-full border border-amber-200/25 bg-amber-200/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-amber-100">
          {controlLabel(boundary.state)}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/74">{boundary.detail}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#c9a24a]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px] text-[#f5f0e8] outline-none focus:border-[#d4b34a]/55"
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#c9a24a]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px] text-[#f5f0e8] outline-none focus:border-[#d4b34a]/55"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-[#0d1d13]">
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CategoryEditor({ item, onChange }: { item: IntelligenceItem; onChange: (categories: IntelligenceCategory[]) => void }) {
  const categories = safeCategories(item);
  const toggle = (category: IntelligenceCategory) => {
    const next = categories.includes(category)
      ? categories.filter((value) => value !== category)
      : [...categories.filter((value) => value !== 'Unknown'), category];
    onChange(next.length ? next : ['Unknown']);
  };

  return (
    <div>
      <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#c9a24a]">Category</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {intelligenceCategories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => toggle(category)}
            className={`rounded-full border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] ${
              categories.includes(category)
                ? 'border-[#d4b34a]/55 bg-[#d4b34a]/16 text-[#f6dc82]'
                : 'border-white/10 bg-black/18 text-[#cfc8b8]/62'
            }`}
          >
            {category}
          </button>
        ))}
      </div>
    </div>
  );
}

function ItemEditor({
  item,
  onChange,
}: {
  item: IntelligenceItem;
  onChange: (item: IntelligenceItem) => void;
}) {
  const patch = (changes: Partial<IntelligenceItem>) => onChange({ ...item, ...changes, updated_at: new Date().toISOString() });

  return (
    <article className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Title" value={item.title} onChange={(title) => patch({ title })} />
        <Field label="Organization" value={item.organization ?? ''} onChange={(organization) => patch({ organization })} placeholder="Funder, partner, lab, source" />
        <Field label="Deadline" value={item.deadline_date ?? ''} onChange={(deadline_date) => patch({ deadline_date })} placeholder="YYYY-MM-DD" />
        <Field label="Funding amount" value={item.funding_amount ?? ''} onChange={(funding_amount) => patch({ funding_amount })} placeholder="$0" />
        <SelectField label="Priority" value={item.priority} options={priorityOptions} onChange={(priority) => patch({ priority })} />
        <SelectField label="Status" value={item.status} options={statusOptions} onChange={(status) => patch({ status })} />
        <Field label="Owner" value={item.owner} onChange={(owner) => patch({ owner })} placeholder="Jeff, partner, team" />
        <Field label="Source link" value={item.source_link ?? ''} onChange={(source_link) => patch({ source_link })} />
      </div>
      <div className="mt-3">
        <CategoryEditor item={item} onChange={(category) => patch({ category })} />
      </div>
      <label className="mt-3 block">
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#c9a24a]">Summary</span>
        <textarea
          value={item.summary}
          onChange={(event) => patch({ summary: event.target.value })}
          className="mt-1 min-h-20 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px] leading-5 text-[#f5f0e8] outline-none focus:border-[#d4b34a]/55"
        />
      </label>
      <label className="mt-3 block">
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#c9a24a]">Recommended action</span>
        <textarea
          value={item.recommended_action}
          onChange={(event) => patch({ recommended_action: event.target.value })}
          className="mt-1 min-h-16 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px] leading-5 text-[#f5f0e8] outline-none focus:border-[#d4b34a]/55"
        />
      </label>
      <details className="mt-3 rounded-lg border border-white/[0.07] bg-black/15 p-3">
        <summary className="cursor-pointer font-mono text-[8px] uppercase tracking-[0.16em] text-[#cfc8b8]/70">Original excerpt</summary>
        <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[#cfc8b8]/75">{item.source_excerpt}</p>
      </details>
    </article>
  );
}

function GrantOpportunityRow({ item }: { item: IntelligenceItem }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base text-[#faf7f2]">{item.title}</h3>
          <p className="mt-1 text-[12px] leading-5 text-[#cfc8b8]/72">{item.organization ?? 'Funder not detected'}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${item.priority === 'critical' ? 'border-red-300/30 bg-red-300/12 text-red-100' : item.priority === 'high' ? 'border-amber-300/30 bg-amber-300/12 text-amber-100' : 'border-white/10 bg-white/[0.05] text-[#cfc8b8]'}`}>
          {item.priority}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-[12px] text-[#cfc8b8]/78 sm:grid-cols-2">
        <div>Amount: {item.funding_amount ?? 'not detected'}</div>
        <div>Deadline: {item.deadline_date ?? 'not detected'}</div>
        <div>Status: {item.status}</div>
        <div>Progress: {item.application_progress ?? 0}%</div>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-[#f5f0e8]/80">Eligibility: {item.eligibility_summary ?? 'Needs review.'}</p>
      <p className="mt-2 text-[12px] leading-5 text-amber-100/78">Missing: {item.missing_information ?? 'Application owner and source verification.'}</p>
      <p className="mt-2 text-[12px] leading-5 text-emerald-100/78">Next: {item.recommended_action}</p>
      {item.source_link ? <a href={item.source_link} className="mt-3 inline-block text-[12px] text-[#d4b34a] underline">Source link</a> : null}
    </div>
  );
}

function OpportunityRow({ item }: { item: IntelligenceItem }) {
  const categories = safeCategories(item);
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base text-[#faf7f2]">{item.title}</h3>
          <p className="mt-1 text-[12px] text-[#cfc8b8]/70">{item.organization ?? item.source}</p>
        </div>
        <span className="rounded-full border border-[#d4b34a]/25 bg-[#d4b34a]/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a]">
          {item.status}
        </span>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-[#f5f0e8]/80">{item.summary}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <span key={category} className="rounded-full border border-white/10 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#cfc8b8]/70">
            {category}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-5 text-emerald-100/78">Next: {item.recommended_action}</p>
    </div>
  );
}

function IntelligenceWorkspace({
  store,
  setStore,
  ownerSessionToken,
  ownerOperations,
  onRefreshOwnerOperations,
  onActionMessage,
}: {
  store: IntelligenceStore;
  setStore: (store: IntelligenceStore) => void;
  ownerSessionToken: string | null;
  ownerOperations: OwnerOperationsState | null;
  onRefreshOwnerOperations: () => Promise<void>;
  onActionMessage: (message: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const sourceBriefings = ownerOperations?.sourceBriefings.length ? ownerOperations.sourceBriefings : safeArray(store?.sourceBriefings);
  const intelligenceItems = ownerOperations?.intelligenceItems.length ? ownerOperations.intelligenceItems : safeArray(store?.intelligenceItems);
  const [source, setSource] = useState('Twin Daily Brief');
  const [sourceDate, setSourceDate] = useState(today);
  const [rawText, setRawText] = useState('');
  const [parsedItems, setParsedItems] = useState<IntelligenceItem[]>([]);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  const grants = grantItems(intelligenceItems);
  const opportunities = opportunityItems(intelligenceItems);
  const summary = intelligenceSummary(intelligenceItems);

  const parse = () => {
    const items = parseTwinDailyBriefing(rawText, source, sourceDate);
    setParsedItems(items);
    setLastSummary(`Parsed ${items.length} item(s): ${grantItems(items).length} grant/funding and ${opportunityItems(items).length} partnership/research/data lead(s).`);
  };

  const save = async () => {
    if (!rawText.trim() || parsedItems.length === 0) return;
    if (ownerSessionToken) {
      const saved = await saveSourceBriefingToBackend(ownerSessionToken, {
        source,
        source_date: sourceDate,
        raw_text: rawText,
        provenance: { frontend_preview_count: parsedItems.length, migration_source: INTELLIGENCE_STORAGE_KEY },
      });
      await onRefreshOwnerOperations();
      setParsedItems([]);
      setRawText('');
      setLastSummary(`Saved ${saved.items.length} item(s) from ${source} to the Calyx backend. Grant and partnership queues now reload from central persistence.`);
      return;
    }
    const briefing = createSourceBriefing(rawText, source, sourceDate);
    const next = saveBriefingWithItems(store, briefing, parsedItems);
    setStore(next);
    setParsedItems([]);
    setRawText('');
    setLastSummary(`Saved ${parsedItems.length} item(s) locally. Backend owner session is required for central persistence.`);
  };

  const importLocalRecords = async () => {
    if (!ownerSessionToken) return;
    const localStore = loadIntelligenceStore();
    const result = await importLocalIntelligenceToBackend(ownerSessionToken, safeArray(localStore.intelligenceItems));
    await onRefreshOwnerOperations();
    onActionMessage(`Imported ${result.imported.length} local intelligence record(s); skipped ${result.skipped_duplicates} duplicate(s). Local records were not deleted.`);
  };

  const updateSavedItem = async (item: IntelligenceItem) => {
    if (ownerSessionToken && ownerOperations?.intelligenceItems.some((existing) => existing.id === item.id)) {
      const updated = await updateBackendIntelligenceItem(ownerSessionToken, item);
      await onRefreshOwnerOperations();
      onActionMessage(`Updated backend intelligence item ${updated.id}.`);
      return;
    }
    const next = {
      ...store,
      sourceBriefings,
      intelligenceItems: intelligenceItems.map((existing) => (existing.id === item.id ? item : existing)),
    };
    saveIntelligenceStore(next);
    setStore(next);
  };

  return (
    <>
      <SafePanel title="Intelligence Triage Snapshot">
      <Panel eyebrow="Daily executive summary" title="Intelligence Triage Snapshot" icon={ClipboardList}>
        <div className="mb-4 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-[12px] leading-5 text-emerald-100/82">
          Operational level: {ownerSessionToken ? 'Live database intelligence workspace' : 'Local browser only until backend owner session is active.'}
        </div>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="New items" value={summary.newItems} detail="Saved items still awaiting triage." />
          <MetricCard label="Urgent grants" value={summary.urgentGrants} detail="Critical/high funding deadlines surfaced by date." />
          <MetricCard label="Partnerships" value={summary.partnershipNeedsAction} detail="Partnership, research, dataset, API, or technology leads needing action." />
          <MetricCard label="Research/data" value={summary.researchDatasetLeads} detail="Research, dataset, and API leads in queue." />
          <MetricCard label="Waiting Jeff" value={summary.waitingOnJeff} detail="Items marked waiting with Jeff as owner." />
          <MetricCard label="Waiting external" value={summary.waitingOnExternal} detail="Waiting items owned by external partner or unassigned." />
        </div>
      </Panel>
      </SafePanel>

      <SafePanel title="Intelligence Inbox">
      <Panel eyebrow="Intelligence Inbox" title="Paste Twin Daily Brief" icon={Inbox}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Source" value={source} onChange={setSource} />
              <Field label="Source date" value={sourceDate} onChange={setSourceDate} placeholder="YYYY-MM-DD" />
            </div>
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="Paste Twin Daily Brief text here. Headings like Funding and Grants, Research and Publications, Partnership Opportunities, or Technology and Infrastructure Opportunities will be used for routing."
              className="mt-4 min-h-64 w-full rounded-lg border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-[#f5f0e8] outline-none focus:border-[#d4b34a]/55"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={parse} disabled={!rawText.trim()} className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#12170d] transition-colors hover:bg-[#e5c85c] disabled:cursor-not-allowed disabled:opacity-45">
                <FileText className="h-3.5 w-3.5" /> Parse brief
              </button>
              <button onClick={() => void save()} disabled={!rawText.trim() || parsedItems.length === 0} className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d4b34a] transition-colors hover:border-[#d4b34a]/70 disabled:cursor-not-allowed disabled:opacity-45">
                <Inbox className="h-3.5 w-3.5" /> {ownerSessionToken ? 'Save to Calyx' : 'Save locally'}
              </button>
              <button onClick={() => void importLocalRecords()} disabled={!ownerSessionToken || safeArray(loadIntelligenceStore().intelligenceItems).length === 0} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a]/60 hover:text-[#d4b34a] disabled:cursor-not-allowed disabled:opacity-45">
                <Database className="h-3.5 w-3.5" /> Import local records
              </button>
            </div>
            {lastSummary ? <p className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100/84">{lastSummary}</p> : null}
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#c9a24a]">Source archive</div>
            <p className="mt-3 text-sm leading-6 text-[#cfc8b8]/78">{sourceBriefings.length} briefing(s) archived with raw text preserved {ownerSessionToken ? 'in the Calyx backend database.' : 'in browser storage for this owner console.'}</p>
            <div className="mt-4 space-y-3">
              {sourceBriefings.slice(0, 5).map((briefing) => (
                <details key={briefing.id} className="rounded-lg border border-white/[0.07] bg-black/15 p-3">
                  <summary className="cursor-pointer text-sm text-[#faf7f2]">{briefing.source} - {briefing.source_date}</summary>
                  <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[12px] leading-5 text-[#cfc8b8]/70">{briefing.raw_text}</p>
                </details>
              ))}
            </div>
          </div>
        </div>

        {parsedItems.length ? (
          <div className="mt-5">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#c9a24a]">Parsed items preview - editable before save</div>
            <div className="space-y-4">
              {parsedItems.map((item) => (
                <ItemEditor
                  key={item.id}
                  item={item}
                  onChange={(next) => setParsedItems((items) => items.map((existing) => (existing.id === next.id ? next : existing)))}
                />
              ))}
            </div>
          </div>
        ) : null}
      </Panel>
      </SafePanel>

      <SafePanel title="Grant Office">
      <Panel id="mission-control-grants" eyebrow="Grant Office" title="Urgent Deadlines and Application Pipeline" icon={DollarSign}>
        <div className="grid gap-4 lg:grid-cols-2">
          {grants.length ? grants.map((item) => <GrantOpportunityRow key={item.id} item={item} />) : (
            <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4 text-sm text-[#cfc8b8]/75">No grant or funding records saved yet. Paste a brief with funding or grant items to populate this view.</div>
          )}
        </div>
      </Panel>
      </SafePanel>

      <SafePanel title="Partnership / Research Queue">
      <Panel id="mission-control-opportunities" eyebrow="Partnership / Research Queue" title="Opportunities Needing Follow-up" icon={Handshake}>
        <div className="grid gap-4 lg:grid-cols-2">
          {opportunities.length ? opportunities.map((item) => <OpportunityRow key={item.id} item={item} />) : (
            <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4 text-sm text-[#cfc8b8]/75">No partnership, research, dataset, API, or technology leads saved yet.</div>
          )}
        </div>
      </Panel>
      </SafePanel>

      {intelligenceItems.length ? (
        <SafePanel title="Saved Intelligence Records">
        <Panel eyebrow="Triage" title="Saved Intelligence Records" icon={Database}>
          <div className="space-y-4">
            {intelligenceItems.slice(0, 8).map((item) => (
              <ItemEditor key={item.id} item={item} onChange={updateSavedItem} />
            ))}
          </div>
        </Panel>
        </SafePanel>
      ) : null}
    </>
  );
}

const MissionControlContent: React.FC = () => {
  const {
    status: missionControlLoadState,
    data: dashboard,
    error: missionControlError,
    meta: missionControlMeta,
    refresh,
    dataAgeMs,
  } = useMissionControl();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [intelligenceStore, setIntelligenceStore] = useState<IntelligenceStore>(() => loadIntelligenceStore());
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [displayPreferences, setDisplayPreferences] = useState<DisplayPreferences>(() => loadDisplayPreferences());
  const [activeFilter, setActiveFilter] = useState<MissionFilter>('overview');
  const [focusedItem, setFocusedItem] = useState<FocusItem | null>(null);
  const [commandText, setCommandText] = useState('What should I work on tonight?');
  const [ownerSession, setOwnerSession] = useState<OwnerSession | null>(null);
  const [ownerOperations, setOwnerOperations] = useState<OwnerOperationsState | null>(null);
  const [ownerSessionStatus, setOwnerSessionStatus] = useState<'missing' | 'authenticated' | 'error'>('missing');
  const [ownerActionMessage, setOwnerActionMessage] = useState<string | null>(null);
  const [lastSessionCheck, setLastSessionCheck] = useState<string | null>(null);
  const [pendingHarvesterAction, setPendingHarvesterAction] = useState<string | null>(null);
  // BUILD-059: Owner Focus Mode toggle
  const [focusModeActive, setFocusModeActive] = useState(false);

  const loadOwnerOperations = useCallback(async (token = ownerSession?.token) => {
    try {
      const validatedSession = await validateOwnerSession(token);
      setLastSessionCheck(new Date().toISOString());
      // BUILD-058: use the shared validated result — token is only set when both
      // authenticated === true and owner identity are confirmed. Checking token
      // prevents privileged state from being set when authenticated is true but
      // owner is absent.
      if (!validatedSession.token) throw new Error(validatedSession.reason || 'Owner session is not active or owner identity absent');
      setOwnerSession(validatedSession);
      setOwnerSessionStatus('authenticated');
      const next = await fetchOwnerOperationsState(token || 'cookie');
      setOwnerOperations(next);
    } catch (err) {
      setLastSessionCheck(new Date().toISOString());
      setOwnerSession(null);
      setOwnerOperations(null);
      setOwnerSessionStatus('error');
      setOwnerActionMessage(err instanceof Error ? `Stored backend owner session rejected: ${err.message}` : 'Stored backend owner session rejected.');
    }
  }, [ownerSession?.token]);

  useEffect(() => {
    // BUILD-058: rely on the shared validated result (session.token) which is
    // only set when validateOwnerSession confirms both authenticated === true
    // AND a non-empty owner identity. Never activate privileged controls from
    // session.authenticated alone.
    void validateOwnerSession().then((session) => {
      setLastSessionCheck(new Date().toISOString());
      if (session.token) {
        setOwnerSession(session);
        setOwnerSessionStatus('authenticated');
        setIsUnlocked(true);
      }
    }).catch(() => setLastSessionCheck(new Date().toISOString()));
  }, []);

  useEffect(() => {
    if (isUnlocked) {
      setIntelligenceStore(loadIntelligenceStore());
      void refresh();
      if (ownerSession?.token) void loadOwnerOperations(ownerSession.token);
    }
  }, [isUnlocked, loadOwnerOperations, ownerSession?.token, refresh]);

  useEffect(() => {
    saveDisplayPreferences(displayPreferences);
  }, [displayPreferences]);

  const unlock = async () => {
    const enteredCode = accessCode.trim();
    setError(null);
    setOwnerActionMessage(null);
    try {
      // createOwnerSession performs the login POST then immediately inspects the
      // cookie session (BUILD-057). It throws if inspection does not explicitly
      // confirm authenticated === true and owner permissions are present.
      // Privileged state is only set after that inspection succeeds.
      const session = await createOwnerSession(enteredCode);
      setAccessCode('');
      setOwnerSession(session);
      setOwnerSessionStatus('authenticated');
      setIsUnlocked(true);
      await loadOwnerOperations(session.token);
      setOwnerActionMessage('Backend owner session established. Privileged controls are authorized only where the server allows them.');
      return;
    } catch (err) {
      // Clear any in-memory auth state if login or inspection fails.
      setOwnerSession(null);
      setOwnerSessionStatus('error');
      setError(err instanceof Error ? err.message : 'Owner session failed');
    }
  };

  const lock = async () => {
    await endOwnerSession().catch(() => undefined);
    safeRemoveStorage(ACCESS_STORAGE_KEY);
    setIsUnlocked(false);
    setAccessCode('');
    setOwnerSession(null);
    setOwnerOperations(null);
    setOwnerSessionStatus('missing');
    setOwnerActionMessage(null);
  };

  const resetLocalData = () => {
    resetMissionControlLocalData();
    setIsUnlocked(false);
    setAccessCode('');
    setOwnerSession(null);
    setOwnerOperations(null);
    setOwnerSessionStatus('missing');
    setOwnerActionMessage(null);
    setDisplayPreferences(DEFAULT_DISPLAY_PREFERENCES);
    setFocusedItem(null);
    setActiveFilter('overview');
    setCommandText('What should I work on tonight?');
    setIntelligenceStore(loadIntelligenceStore());
    setFocusModeActive(false);
  };

  const copyToClipboard = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clipboard copy failed');
    }
  };

  const prepareCommand = async () => {
    if (!ownerSession?.token) {
      setOwnerActionMessage('Backend owner session required before Calyx can create a durable command record.');
      return;
    }
    const command = commandText.trim() || 'Audit Orchid Continuum';
    try {
      const result = await submitOwnerCommand(ownerSession.token, command, false);
      await loadOwnerOperations(ownerSession.token);
      setOwnerActionMessage(`Command ${result.command.id} recorded as ${result.status}; queue item ${result.queue_item.id} was created.`);
    } catch (err) {
      setOwnerActionMessage(err instanceof Error ? err.message : 'Command submission failed');
    }
  };

  const downloadAudit = async (template: ExecutiveAuditTemplate, format: 'markdown' | 'json' | 'pdf') => {
    if (!ownerSession?.token && format !== 'pdf') {
      setOwnerActionMessage('Backend owner session required before Mission Control can generate live audits.');
      return;
    }
    try {
      if (format === 'pdf' && !ownerSession?.token) {
        const placeholder = buildPdfAuditPlaceholder(
          missionControlMeta.sourceEndpoint,
          'backend PDF generator unavailable in current session',
        );
        downloadTextFile(`${template.id}-executive-audit-placeholder.pdf.txt`, placeholder);
        setOwnerActionMessage('PDF placeholder generated because backend owner audit session is unavailable.');
        return;
      }
      if (!ownerSession?.token) {
        setOwnerActionMessage('Backend owner session required before Mission Control can generate live audits.');
        return;
      }
      const result = await generateOwnerAudit(ownerSession.token, template.id, format);
      const content = typeof result.audit.content === 'string' ? result.audit.content : JSON.stringify(result.audit.content, null, 2);
      const extension = format === 'json' ? 'json' : format === 'pdf' ? 'pdf.txt' : 'md';
      downloadTextFile(`${template.id}-executive-audit-${result.audit.id}.${extension}`, content);
      await loadOwnerOperations(ownerSession.token);
      setOwnerActionMessage(`Generated live backend audit ${result.audit.id} (${format.toUpperCase()}).`);
    } catch (err) {
      if (format === 'pdf') {
        const placeholder = buildPdfAuditPlaceholder(
          missionControlMeta.sourceEndpoint,
          err instanceof Error ? err.message : 'backend PDF response unavailable',
        );
        downloadTextFile(`${template.id}-executive-audit-placeholder.pdf.txt`, placeholder);
        setOwnerActionMessage('Backend PDF export unavailable; generated PDF placeholder with missing evidence summary.');
        return;
      }
      setOwnerActionMessage(err instanceof Error ? err.message : 'Audit generation failed');
    }
  };

  const downloadPartnershipPacket = async (template: PartnershipTemplate) => {
    if (!ownerSession?.token) {
      setOwnerActionMessage('Backend owner session required before Mission Control can generate partner packets.');
      return;
    }
    try {
      const result = await generatePartnershipPacket(ownerSession.token, template);
      const content = typeof result.packet.content === 'string' ? result.packet.content : JSON.stringify(result.packet.content, null, 2);
      downloadTextFile(`${template.id}-partnership-packet-${result.packet.id}.md`, content);
      setOwnerActionMessage(`Generated backend partnership packet ${result.packet.id}.`);
    } catch (err) {
      setOwnerActionMessage(err instanceof Error ? err.message : 'Partnership packet generation failed');
    }
  };

  const prepareResearchCommand = async (template: ResearchCommandTemplate) => {
    if (!ownerSession?.token) {
      setOwnerActionMessage('Backend owner session required before Mission Control can save research requests.');
      return;
    }
    setCommandText(template.prompt);
    try {
      const result = await createResearchRequest(ownerSession.token, template);
      await loadOwnerOperations(ownerSession.token);
      setOwnerActionMessage(`Research request saved as ${result.status}.`);
    } catch (err) {
      setOwnerActionMessage(err instanceof Error ? err.message : 'Research request failed');
    }
  };

  const handleHarvesterAction = async (harvester: HarvesterStatus, action: 'run-once' | 'pause' | 'resume' | 'retire' | 'restore' | 'reassess') => {
    if (!ownerSession?.token) {
      setOwnerActionMessage('Backend owner session required before harvester mutation.');
      return;
    }
    setPendingHarvesterAction(`${harvester.id}:${action}`);
    try {
      await runHarvesterOwnerAction(ownerSession.token, harvester, action);
      await refresh();
      setOwnerActionMessage(`${harvester.name} ${action} accepted by the Calyx backend and logged.`);
    } catch (err) {
      setOwnerActionMessage(err instanceof Error ? err.message : `${harvester.name} ${action} failed`);
    } finally {
      setPendingHarvesterAction(null);
    }
  };

  const handleRuntimeAction = async (action: 'cycle' | 'start' | 'stop' | 'restart') => {
    if (!ownerAuthorized) return;
    try {
      await runRuntimeOwnerAction(action);
      await refresh();
      setOwnerActionMessage(`Runtime ${action} accepted by the authenticated backend session.`);
    } catch (err) {
      setOwnerActionMessage(err instanceof Error ? err.message : `Runtime ${action} failed`);
    }
  };

  const handleQueueTransition = async (item: BackendOperationsQueueItem, transition: 'approve' | 'reject' | 'cancel' | 'retry') => {
    if (!ownerSession?.token) {
      setOwnerActionMessage('Backend owner session required before queue transition.');
      return;
    }
    try {
      const result = await transitionOwnerQueueItem(ownerSession.token, item.id, transition, `Owner selected ${transition} in Mission Control.`);
      await loadOwnerOperations(ownerSession.token);
      setOwnerActionMessage(`Queue item ${item.id} moved to ${result.status}.`);
    } catch (err) {
      setOwnerActionMessage(err instanceof Error ? err.message : 'Queue transition failed');
    }
  };

  const stats = useMemo(() => {
    const health = safeArray(dashboard?.globalHealth);
    const average = health.length
      ? Math.round(health.reduce((sum, item) => sum + item.completeness, 0) / health.length)
      : 0;
    return {
      average,
      healthy: health.filter((item) => item.status === 'healthy').length,
      warning: health.filter((item) => item.status === 'warning').length,
      blocked: health.filter((item) => item.status === 'error' || item.status === 'stub').length,
    };
  }, [dashboard]);

  // BUILD-059: scored subsystems for Daily Brief, Focus Mode, and Priority Engine
  const scoredSubsystems = useMemo(
    () => scoreSubsystems([...(dashboard?.globalHealth ?? []), ...(dashboard?.scientificSystems ?? [])]),
    [dashboard],
  );

  // BUILD-059: owner decision items from queue + blockers for Focus Mode
  const ownerDecisionItems = useMemo(() => {
    const queueDecisions = (ownerOperations?.operationsQueue ?? [])
      .filter((item) => item.status === 'awaiting_owner' || item.status === 'proposed')
      .map((item) => item.next_required_action ?? item.title)
      .filter(Boolean);
    const blockerDecisions = safeArray(dashboard?.globalHealth)
      .filter((s) => s.blockers.length > 0)
      .map((s) => `${s.name}: ${s.blockers[0]}`);
    return [...queueDecisions, ...blockerDecisions].slice(0, 6) as string[];
  }, [dashboard, ownerOperations]);

  const waitingExternalItems = useMemo(() => {
    return (ownerOperations?.operationsQueue ?? [])
      .filter((item) => item.status === 'blocked')
      .map((item) => item.title)
      .slice(0, 4);
  }, [ownerOperations]);

  const focusItems = useMemo(() => (dashboard ? buildFocusItems(dashboard) : []), [dashboard]);
  const filteredFocusItems = useMemo(
    () => focusItems.filter((item) => itemMatchesFilter(item, activeFilter, displayPreferences.hideHealthyDefault)),
    [activeFilter, displayPreferences.hideHealthyDefault, focusItems],
  );
  const rootTextClass = displayPreferences.textScale === 'extra' ? 'text-[18px]' : displayPreferences.textScale === 'large' ? 'text-[16px]' : '';
  const contentDensityClass = displayPreferences.comfortableSpacing ? 'space-y-7' : 'space-y-5';
  const contrastClass = displayPreferences.highContrast ? 'brightness-110 contrast-125' : '';
  const motionClass = displayPreferences.reduceMotion ? '[&_*]:!transition-none [&_*]:!animate-none' : '';

  const globalHealth = safeArray(dashboard?.globalHealth).map((subsystem) => (
    missionControlMeta.usingCachedData ? { ...subsystem, status: 'stale' as MissionControlStatus } : subsystem
  ));
  const completenessMatrix = safeArray(dashboard?.completenessMatrix).map((subsystem) => (
    missionControlMeta.usingCachedData ? { ...subsystem, status: 'stale' as MissionControlStatus } : subsystem
  ));
  const harvesters = safeArray(dashboard?.harvesters);
  const scientificSystems = safeArray(dashboard?.scientificSystems).map((system) => (
    missionControlMeta.usingCachedData ? { ...system, status: 'stale' as MissionControlStatus } : system
  ));
  const repositories = safeArray(dashboard?.repositories);
  const recommendations = safeArray(dashboard?.recommendations);
  const recentActivity = safeArray(dashboard?.recentActivity);
  const safetyBoundaries = safeArray(dashboard?.safetyBoundaries);
  const diagnostics = safeArray(dashboard?.diagnostics);
  const governance = dashboard?.governance ?? {
    build: 'Mission Control',
    status: 'warning' as MissionControlStatus,
    northStar: 'Mission Control is running in safe fallback mode.',
    missions: [],
    policies: [],
    decisions: [],
    questions: [],
  };
  const calyxSelfAudit = dashboard?.calyxSelfAudit ?? {
    summary: 'Mission Control safe fallback is active. Some live telemetry may be unavailable.',
    canDo: ['Render the owner console', 'Preserve BUILD-050 intake UI'],
    cannotDoYet: ['Read malformed live telemetry safely without fallback normalization'],
    connectedTools: [],
    failingServices: [],
    riskLevel: 'safe fallback',
  };
  const ownerPermissions = ownerOperations?.permissions ?? ownerSession?.allowedActions;
  const ownerAuthorized = ownerSessionStatus === 'authenticated' && Boolean(ownerSession?.token);
  const canSubmitCommand = ownerAuthorized && ownerActionAllowed(ownerPermissions, 'submitCommand');
  const canGenerateAudit = ownerAuthorized && ownerActionAllowed(ownerPermissions, 'generateAudit');
  const canCreateResearch = ownerAuthorized && ownerActionAllowed(ownerPermissions, 'createResearchRequest');
  const canGeneratePacket = ownerAuthorized && ownerActionAllowed(ownerPermissions, 'generatePartnershipPacket');
  const dataAgeSeconds = dataAgeMs == null ? null : Math.floor(dataAgeMs / 1000);
  const dataAgeLabel = dataAgeSeconds == null ? 'unknown' : dataAgeSeconds < 0 ? `${dataAgeSeconds}s (clock skew)` : `${dataAgeSeconds}s`;
  const repositoryRevision = missionControlMeta.repositoryRevision;

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#07140d] text-[#f5f0e8]">
        <Navbar />
        <main className="flex min-h-screen items-center justify-center px-6 pt-28">
          <section className="w-full max-w-xl rounded-[2rem] border border-[#d4b34a]/25 bg-[#0d1d13]/90 p-8 shadow-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
              <LockKeyhole className="h-3.5 w-3.5" /> Owner-only access
            </div>
            <h1 className="mt-6 text-4xl leading-tight md:text-5xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
              Mission Control
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#cfc8b8]/85">
              Sign in directly with the Calyx backend. The access code is submitted once and is never stored by Mission Control.
            </p>
            <label className="mt-8 block font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">
              Access code
            </label>
            <input
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void unlock();
              }}
              type="password"
              className="mt-3 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-[#f5f0e8] outline-none focus:border-[#d4b34a]/60"
              placeholder="Enter owner code"
            />
            <button
              onClick={() => void unlock()}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#12170d] transition-colors hover:bg-[#e5c85c]"
            >
              <KeyRound className="h-3.5 w-3.5" /> Unlock backend session
            </button>
            <button
              onClick={resetLocalData}
              className="ml-3 mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a]/60 hover:text-[#d4b34a]"
            >
              Reset local Mission Control data
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#06110b] text-[#f5f0e8] ${rootTextClass} ${contrastClass} ${motionClass}`}>
      <Navbar />
      <main className="pt-20">
        <section className="border-b border-white/[0.08] bg-[#0a170f]">
          <div className="mx-auto max-w-[1540px] px-5 py-8 lg:px-8 lg:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
                  <ShieldCheck className="h-3.5 w-3.5" /> BUILD-059 - Calyx intelligent mission control
                </div>
                <h1 className="mt-5 max-w-5xl text-4xl leading-tight md:text-6xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
                  Mission Control <span className="italic text-[#d4b34a]">intelligent operations center.</span>
                </h1>
                <p className="mt-5 max-w-3xl text-[15px] leading-7 text-[#cfc8b8]/88">
                  Calyx actively guides you through scientific priorities, next actions, grant opportunities, and system health — backed by the live executive intelligence engine.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => void refresh()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#12170d] transition-colors hover:bg-[#e5c85c]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${missionControlLoadState === 'loading' ? 'animate-spin' : ''}`} /> Refresh Mission Control
                </button>
                <button
                  onClick={lock}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a]/60 hover:text-[#d4b34a]"
                >
                  <LockKeyhole className="h-3.5 w-3.5" /> Lock
                </button>
                <button
                  onClick={resetLocalData}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-amber-100 transition-colors hover:border-amber-200/60"
                >
                  Reset local Mission Control data
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1540px] px-5 py-6 lg:px-8">
          {missionControlLoadState === 'error' ? (
            <div className="mb-5 rounded-lg border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">
              <AlertTriangle className="mr-2 inline h-4 w-4" /> {missionControlError ?? error}
            </div>
          ) : null}

          <div className="mb-5 rounded-lg border border-white/[0.08] bg-[#0b1c11]/85 p-4 text-sm leading-6 text-[#cfc8b8]/84">
            <div className="mb-4 grid gap-2 rounded-lg border border-white/10 bg-black/15 p-3 font-mono text-[10px] sm:grid-cols-2 lg:grid-cols-3">
              <div>Backend connected: {missionControlMeta.backendAvailable ? 'yes' : 'no'}</div>
              <div>Owner authenticated: {ownerAuthorized ? 'yes' : 'no'}</div>
              <div>Repository revision: {repositoryRevision}</div>
              <div>Frontend build number: {missionControlMeta.frontendBuildNumber}</div>
              <div>API version: {missionControlMeta.apiVersion}</div>
              <div>Last synchronization: {displayTime(missionControlMeta.lastSuccessfulSync ?? missionControlMeta.liveTimestamp ?? undefined)}</div>
            </div>
            <span className="mr-3 inline-flex rounded-full border border-[#d4b34a]/30 bg-[#d4b34a]/10 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a]">
              {ownerSessionStatus === 'authenticated' ? 'Owner Session Active' : ownerSessionStatus === 'error' ? 'Owner auth error' : 'Backend auth missing'}
            </span>
            {ownerSessionStatus === 'authenticated'
              ? 'Privileged controls require a signed server session and per-action permission. State changes are written to the backend and logged.'
              : 'Read-only telemetry and local previews remain available; database writes, command records, audits, queue transitions, and harvester mutations are disabled.'}
            {ownerActionMessage ? <div className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-emerald-100/84">{ownerActionMessage}</div> : null}
            <div className="mt-4 grid gap-2 rounded-lg border border-white/10 bg-black/15 p-3 font-mono text-[10px] sm:grid-cols-2 lg:grid-cols-4">
              <div>Authenticated: {ownerAuthorized ? 'yes' : 'no'}</div>
              <div>Status: {ownerSessionStatus}</div>
              <div>Expires: {ownerSession?.expires_at ? new Date(Number(ownerSession.expires_at) * 1000).toLocaleString() : 'not active'}</div>
              <div>Transport: {ownerSession?.credential_transport ?? 'HttpOnly cookie pending'}</div>
              <div className="sm:col-span-2">Backend: {CALYX_BACKEND_BASE_URL}</div>
              <div>Last check: {lastSessionCheck ? new Date(lastSessionCheck).toLocaleString() : 'pending'}</div>
              <div>Reason: {ownerSession?.reason ?? (ownerSessionStatus === 'error' ? ownerActionMessage ?? 'session rejected' : 'none')}</div>
              <div>Live timestamp: {displayTime(missionControlMeta.liveTimestamp ?? undefined)}</div>
              <div>Data age: {dataAgeLabel}</div>
              <div>Source endpoint: {missionControlMeta.sourceEndpoint}</div>
              <div>
                Data source: {missionControlMeta.usingCachedData ? 'cached' : 'live'}
                {missionControlMeta.usingCachedData ? (
                  <span className="ml-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-2 py-0.5 text-[8px] uppercase tracking-[0.12em] text-[#f1d878]">stale</span>
                ) : null}
              </div>
              <div className="sm:col-span-2 lg:col-span-4">Permissions: {ownerPermissions ? Object.entries(ownerPermissions).filter(([, value]) => value.allowed).map(([key]) => key).join(', ') || 'none' : 'none'}</div>
              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
                {(['cycle', 'start', 'stop', 'restart'] as const).map((action) => (
                  <button key={action} disabled={!ownerAuthorized || !ownerActionAllowed(ownerPermissions, action === 'cycle' ? 'autonomousCycle' : `runtime${action[0].toUpperCase()}${action.slice(1)}`)} onClick={() => void handleRuntimeAction(action)} className="rounded-full border border-[#d4b34a]/30 px-3 py-1.5 uppercase text-[#d4b34a] disabled:cursor-not-allowed disabled:opacity-40">
                    Runtime {action}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {dashboard ? (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
              <aside className="h-fit rounded-lg border border-white/[0.08] bg-[#0b1c11]/85 p-4 xl:sticky xl:top-24">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#c9a24a]">Navigation</div>
                {navigationItems.map(({ label, targetId, icon: LucideIcon }) => {
                  return (
                    <button
                      key={targetId}
                      onClick={() => scrollToSection(targetId)}
                      className="mt-3 flex w-full items-center gap-3 rounded-lg border border-white/[0.06] bg-black/10 px-3 py-3 text-left text-sm text-[#f5f0e8]/85 transition-colors hover:border-[#d4b34a]/40 hover:text-[#d4b34a]"
                    >
                      <LucideIcon className="h-4 w-4 text-[#d4b34a]" strokeWidth={1.5} />
                      {label}
                    </button>
                  );
                })}
                <Link to="/" className="mt-5 block rounded-full border border-[#d4b34a]/25 px-4 py-3 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-[#d4b34a]">
                  Return to public site
                </Link>
                <div className="mt-5 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-[12px] leading-5 text-amber-100/82">
                  Backend authority: {ownerAuthorized ? 'signed owner session active; controls follow server allowedActions.' : 'local/read-only mode; privileged controls remain disabled.'}
                </div>
              </aside>

              <div className={contentDensityClass}>
                <DisplayPreferencesPanel preferences={displayPreferences} onChange={setDisplayPreferences} />

                {/* BUILD-059: Daily Brief */}
                <SafePanel title="Daily Brief">
                <DailyBriefPanel
                  dashboard={dashboard}
                  focusModeActive={focusModeActive}
                  onToggleFocusMode={() => setFocusModeActive((v) => !v)}
                />
                </SafePanel>

                {/* BUILD-059: Owner Focus Mode Widget — shown only when focus mode is on */}
                {focusModeActive && (
                  <SafePanel title="Owner Focus Mode">
                  <OwnerFocusModeWidget
                    scoredSystems={scoredSubsystems}
                    ownerDecisionItems={ownerDecisionItems}
                    waitingExternalItems={waitingExternalItems}
                    onClose={() => setFocusModeActive(false)}
                  />
                  </SafePanel>
                )}

                <AttentionSummary items={focusItems} activeFilter={activeFilter} onFilterChange={setActiveFilter} />

                <SafePanel title="Calyx Command Bar">
                <CommandBarPanel value={commandText} onChange={setCommandText} onSubmit={() => void prepareCommand()} disabled={!canSubmitCommand} statusMessage={ownerActionMessage} />
                </SafePanel>

                <SafePanel title="Subsystem Owner Guide">
                <OwnerGuidePanel />
                </SafePanel>

                <SafePanel title="Calyx Operations Queue">
                <CalyxOperationsQueuePanel backendItems={ownerOperations?.operationsQueue ?? []} ownerAuthorized={ownerAuthorized} onTransition={handleQueueTransition} />
                </SafePanel>

                <SafePanel title="Executive Audit Engine">
                <ExecutiveAuditPanel onDownload={(template, format) => void downloadAudit(template, format)} disabled={!canGenerateAudit} />
                </SafePanel>

                <SafePanel title="Research Command Center">
                <ResearchCommandPanel onPrepare={(template) => void prepareResearchCommand(template)} disabled={!canCreateResearch} />
                </SafePanel>

                <SafePanel title="Partnership Generator">
                <PartnershipGeneratorPanel onDownload={(template) => void downloadPartnershipPacket(template)} disabled={!canGeneratePacket} />
                </SafePanel>

                <SafePanel title="Research Inbox">
                <ResearchInboxPanel />
                </SafePanel>

                <SafePanel title="Owner Manual">
                <OwnerManualPanel />
                </SafePanel>

                <SafePanel title="Development Lifecycle">
                <LifecyclePanel />
                </SafePanel>

                <SafePanel title="Accessible Operations Queue">
                <Panel eyebrow="Focus" title="Accessible Operations Queue" icon={Eye}>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="max-w-3xl text-sm leading-6 text-[#cfc8b8]/80">
                      Select any operational item for a single-item focus view with priority, interpretation, next action, and Calyx context.
                    </p>
                    <span className="rounded-full border border-white/12 bg-black/20 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#cfc8b8]">
                      {filteredFocusItems.length} visible / {focusItems.length} total
                    </span>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {filteredFocusItems.slice(0, activeFilter === 'all' ? focusItems.length : 12).map((item) => (
                      <FocusItemCard key={item.id} item={item} onOpen={setFocusedItem} />
                    ))}
                  </div>
                </Panel>
                </SafePanel>

                <SafePanel title="Operations Metrics">
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="Overall health" value={`${stats.average}%`} detail="Average completeness across registered global systems." />
                  <MetricCard label="Healthy systems" value={stats.healthy} detail="Systems currently marked healthy by live or fallback data." />
                  <MetricCard label="Warnings" value={stats.warning} detail="Systems that need follow-up but are partially present." />
                  <MetricCard label="Stub / blocked" value={stats.blocked} detail="Planned or unavailable systems that need backend/data work." />
                </section>
                </SafePanel>

                <div id="mission-control-intelligence" className="scroll-mt-28">
                  <IntelligenceWorkspace
                    store={intelligenceStore}
                    setStore={setIntelligenceStore}
                    ownerSessionToken={ownerSession?.token ?? null}
                    ownerOperations={ownerOperations}
                    onRefreshOwnerOperations={() => loadOwnerOperations()}
                    onActionMessage={setOwnerActionMessage}
                  />
                </div>

                <SafePanel title="Overall Continuum Health">
                <Panel id="mission-control-health" eyebrow="Global health" title="Overall Continuum Health" icon={Activity}>
                  <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {globalHealth.map((subsystem) => (
                      <SubsystemCard key={subsystem.id} subsystem={subsystem} />
                    ))}
                  </div>
                </Panel>
                </SafePanel>

                <SafePanel title="System Completeness Matrix">
                <Panel id="mission-control-completeness" eyebrow="Audit" title="System Completeness Matrix" icon={SlidersHorizontal}>
                  <div className="space-y-3">
                    {completenessMatrix.slice(0, 18).map((subsystem) => (
                      <CompletenessRow key={`${subsystem.category}-${subsystem.id}`} subsystem={subsystem} />
                    ))}
                  </div>
                </Panel>
                </SafePanel>

                <SafePanel title="Harvester Operations">
                <Panel id="mission-control-harvesters" eyebrow="Pipelines" title="Harvester Operations" icon={Radar}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {harvesters.map((harvester) => (
                      <HarvesterRow
                        key={harvester.id}
                        harvester={harvester}
                        ownerAuthorized={ownerAuthorized}
                        pendingAction={pendingHarvesterAction}
                        onAction={handleHarvesterAction}
                      />
                    ))}
                  </div>
                </Panel>
                </SafePanel>

                <SafePanel title="Scientific Systems Registry">
                <Panel eyebrow="Science" title="Scientific Systems Registry" icon={Telescope}>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {scientificSystems.map((system) => (
                      <SubsystemCard key={system.id} subsystem={system} />
                    ))}
                  </div>
                </Panel>
                </SafePanel>

                <SafePanel title="Build / GitHub / Deployment Status">
                <Panel id="mission-control-builds" eyebrow="Delivery" title="Build / GitHub / Deployment Status" icon={GitBranch}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {repositories.map((repository) => (
                      <RepositoryRow key={repository.name} repository={repository} onCopy={(key, value) => void copyToClipboard(key, value)} copiedKey={copiedKey} />
                    ))}
                  </div>
                </Panel>
                </SafePanel>

                <SafePanel title="Constitution and Decision Ledger">
                <Panel id="mission-control-governance" eyebrow="Governance" title="Constitution and Decision Ledger" icon={ShieldCheck}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-200">
                        {governance.build} - {governance.status}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[#f5f0e8]/86">{governance.northStar}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
                      <div className="grid grid-cols-4 gap-3 text-center">
                        <div><div className="text-2xl text-[#d4b34a]">{safeArray(governance.missions).length}</div><div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#cfc8b8]/60">Missions</div></div>
                        <div><div className="text-2xl text-[#d4b34a]">{safeArray(governance.policies).length}</div><div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#cfc8b8]/60">Policies</div></div>
                        <div><div className="text-2xl text-[#d4b34a]">{safeArray(governance.decisions).length}</div><div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#cfc8b8]/60">Decisions</div></div>
                        <div><div className="text-2xl text-[#d4b34a]">{safeArray(governance.questions).length}</div><div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#cfc8b8]/60">Questions</div></div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      {safeArray(governance.policies).slice(0, 5).map((policy, index) => (
                        <div key={policy.policy_id ?? policy.policy_key ?? policy.title ?? `policy-${index}`} className="rounded-lg border border-white/[0.07] bg-black/18 p-3">
                          <div className="text-sm text-[#faf7f2]">{policy.title}</div>
                          <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/74">{policy.principle ?? policy.description ?? 'Policy preserved.'}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      {safeArray(governance.decisions).slice(0, 5).map((decision, index) => (
                        <div key={decision.decision_id ?? decision.action ?? decision.rationale ?? `decision-${index}`} className="rounded-lg border border-white/[0.07] bg-black/18 p-3">
                          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a]">{decision.status ?? decision.decision ?? 'decision'}</div>
                          <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/74">{decision.action ?? decision.rationale ?? decision.decision_id}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
                </SafePanel>
              </div>

              <aside className="h-fit space-y-5 xl:sticky xl:top-24">
                {/* BUILD-059: Executive Platform Status (replaces terse self-audit summary) */}
                <SafePanel title="Current Platform Status">
                <ExecutivePlatformStatusPanel dashboard={dashboard} />
                </SafePanel>

                {/* Keep the legacy self-audit detail under a details element */}
                <SafePanel title="Calyx Self-Audit Detail">
                <Panel eyebrow="Calyx" title="Calyx Self-Audit Detail" icon={Bot}>
                  <p className="text-sm leading-6 text-[#f5f0e8]/84">{calyxSelfAudit.summary}</p>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3">
                      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-200">Can do</div>
                      <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/80">
                        {safeArray(calyxSelfAudit.canDo).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
                      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-amber-200">Cannot do yet</div>
                      <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/80">
                        {safeArray(calyxSelfAudit.cannotDoYet).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                  <p className="mt-4 text-[12px] leading-5 text-[#cfc8b8]/70">Risk: {calyxSelfAudit.riskLevel}</p>
                </Panel>
                </SafePanel>

                <SafePanel title="Calyx Recommendations">
                <Panel id="mission-control-recommendations" eyebrow="Next actions" title="Calyx Recommendations" icon={Sparkles}>
                  <div className="space-y-3">
                    {recommendations.map((recommendation) => (
                      <RecommendationCard key={recommendation.id} recommendation={recommendation} onCopy={(key, value) => void copyToClipboard(key, value)} copiedKey={copiedKey} />
                    ))}
                  </div>
                </Panel>
                </SafePanel>

                {/* BUILD-059: Scientific Insights */}
                <SafePanel title="Today's Scientific Insights">
                <ScientificInsightsPanel dashboard={dashboard} />
                </SafePanel>

                {/* BUILD-059: Live Activity Feed */}
                <SafePanel title="Activity Timeline">
                <LiveActivityFeedPanel activities={recentActivity} />
                </SafePanel>

                <SafePanel title="Recent Activity">
                <Panel eyebrow="Activity" title="Recent Activity" icon={Workflow}>
                  <div className="space-y-3">
                    {recentActivity.slice(0, 7).map((activity) => (
                      <div key={activity.id} className="rounded-lg border border-white/[0.07] bg-black/18 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm text-[#faf7f2]">{activity.label}</div>
                          <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#c9a24a]">{activity.source}</span>
                        </div>
                        <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/74">{activity.detail}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
                </SafePanel>

                <SafePanel title="Owner Approval Boundaries">
                <Panel id="mission-control-safety" eyebrow="Safety" title="Owner Approval Boundaries" icon={LockKeyhole}>
                  <div className="space-y-3">
                    {safetyBoundaries.map((boundary) => (
                      <SafetyRow key={boundary.id} boundary={boundary} />
                    ))}
                  </div>
                </Panel>
                </SafePanel>

                <SafePanel title="Endpoint Assumptions">
                <Panel eyebrow="Diagnostics" title="Endpoint Assumptions" icon={Database}>
                  <button
                    onClick={() => void refresh()}
                    className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/25 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] transition-colors hover:border-[#d4b34a]/60 hover:bg-[#d4b34a]/10"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${missionControlLoadState === 'loading' ? 'animate-spin' : ''}`} /> Refresh telemetry
                  </button>
                  <div className="space-y-3">
                    {diagnostics.map((diagnostic) => (
                      <DiagnosticRow key={diagnostic.endpoint} diagnostic={diagnostic} onCopy={(key, value) => void copyToClipboard(key, value)} copiedKey={copiedKey} />
                    ))}
                  </div>
                  <div className="mt-4 rounded-lg border border-white/[0.08] bg-black/18 p-3 text-[12px] leading-5 text-[#cfc8b8]/72">
                    Backend: {CALYX_BACKEND_BASE_URL}
                    <button
                      onClick={() => void copyToClipboard('backend-base-url', CALYX_BACKEND_BASE_URL)}
                      className="ml-2 inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a]/60 hover:text-[#d4b34a]"
                    >
                      {copiedKey === 'backend-base-url' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy
                    </button>
                    <br />
                    Data mode: {dashboard.dataMode}
                    <br />
                    Generated: {displayTime(dashboard.generatedAt)}
                    <br />
                    Source endpoint: {missionControlMeta.sourceEndpoint}
                    <br />
                    Backend available: {missionControlMeta.backendAvailable ? 'yes' : 'no'}
                    <br />
                    Data age: {dataAgeLabel}
                  </div>
                </Panel>
                </SafePanel>
              </aside>
            </div>
          ) : (
            <div className="rounded-lg border border-white/[0.08] bg-[#0d1d13]/90 p-8 text-center">
              <RefreshCw className={`mx-auto h-6 w-6 text-[#d4b34a] ${missionControlLoadState === 'loading' ? 'animate-spin' : ''}`} />
              <p className="mt-4 text-sm text-[#cfc8b8]/80">Loading Mission Control operations center...</p>
            </div>
          )}
        </section>
      </main>
      <FocusModeDialog items={filteredFocusItems.length ? filteredFocusItems : focusItems} activeItem={focusedItem} onClose={() => setFocusedItem(null)} onChange={setFocusedItem} />
      <Footer />
    </div>
  );
};

const MissionControl: React.FC = () => (
  <MissionControlErrorBoundary>
    <MissionControlProvider>
      <MissionControlContent />
    </MissionControlProvider>
  </MissionControlErrorBoundary>
);

export default MissionControl;
