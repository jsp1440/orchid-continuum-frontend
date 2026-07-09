import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Database,
  ExternalLink,
  GitBranch,
  KeyRound,
  LockKeyhole,
  PauseCircle,
  PlayCircle,
  Radar,
  RefreshCw,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Telescope,
  Workflow,
} from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import {
  fetchMissionControlOperations,
  type ContinuumSubsystem,
  type ControlState,
  type EndpointDiagnostic,
  type HarvesterStatus,
  type MissionControlOperations,
  type MissionControlStatus,
  type Recommendation,
  type RepositoryStatus,
  type SafetyBoundary,
} from '@/lib/missionControlOps';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const ACCESS_STORAGE_KEY = 'oc_mission_control_owner_access_v1';
const BACKEND_OWNER_AUTHORIZATION_LABEL = 'Requires backend owner authorization.';

const OWNER_ACCESS_CODE =
  (import.meta.env.VITE_MISSION_CONTROL_ACCESS_CODE as string | undefined) ||
  'orchid-continuum-owner';

const navigationItems = [
  { label: 'Health', targetId: 'mission-control-health', icon: Activity },
  { label: 'Completeness', targetId: 'mission-control-completeness', icon: SlidersHorizontal },
  { label: 'Harvesters', targetId: 'mission-control-harvesters', icon: Radar },
  { label: 'Calyx Audit', targetId: 'mission-control-calyx-audit', icon: Bot },
  { label: 'Builds', targetId: 'mission-control-builds', icon: GitBranch },
  { label: 'Governance', targetId: 'mission-control-governance', icon: ShieldCheck },
  { label: 'Recommendations', targetId: 'mission-control-recommendations', icon: Sparkles },
  { label: 'Safety', targetId: 'mission-control-safety', icon: LockKeyhole },
];

function statusClass(status: MissionControlStatus): string {
  if (status === 'healthy') return 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100';
  if (status === 'warning') return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
  if (status === 'error') return 'border-red-300/25 bg-red-300/10 text-red-100';
  if (status === 'stub') return 'border-sky-300/20 bg-sky-300/10 text-sky-100';
  return 'border-white/10 bg-white/[0.05] text-[#cfc8b8]';
}

function controlLabel(state: ControlState): string {
  if (state === 'read_only') return 'read-only';
  if (state === 'requires_owner_authorization' || state === 'disabled' || state === 'planned') {
    return BACKEND_OWNER_AUTHORIZATION_LABEL;
  }
  return state;
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
  return (
    <article className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a24a]">{subsystem.category}</div>
          <h3 className="mt-1 text-lg text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            {subsystem.name}
          </h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${statusClass(subsystem.status)}`}>
          {subsystem.status}
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#d4b34a]" style={{ width: `${Math.max(0, Math.min(100, subsystem.completeness))}%` }} />
      </div>
      <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#cfc8b8]/60">
        {subsystem.completeness}% complete
      </div>
      <p className="mt-3 text-[12.5px] leading-5 text-[#cfc8b8]/76">{subsystem.summary}</p>
      {subsystem.blockers.length ? (
        <p className="mt-3 text-[12px] leading-5 text-amber-100/82">Blocker: {subsystem.blockers[0]}</p>
      ) : null}
      <p className="mt-3 text-[12px] leading-5 text-emerald-100/78">Next: {subsystem.recommendedNextAction}</p>
    </article>
  );
}

function CompletenessRow({ subsystem }: { subsystem: ContinuumSubsystem }) {
  return (
    <div className="grid gap-3 rounded-lg border border-white/[0.07] bg-black/18 p-3 sm:grid-cols-[190px_1fr_96px] sm:items-center">
      <div>
        <div className="text-sm text-[#faf7f2]">{subsystem.name}</div>
        <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[#c9a24a]">{subsystem.category}</div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#d4b34a]" style={{ width: `${subsystem.completeness}%` }} />
      </div>
      <span className={`rounded-full border px-2.5 py-1 text-center font-mono text-[9px] uppercase tracking-[0.16em] ${statusClass(subsystem.status)}`}>
        {subsystem.completeness}%
      </span>
    </div>
  );
}

function HarvesterRow({ harvester }: { harvester: HarvesterStatus }) {
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
        <div>Last run: {displayTime(harvester.lastRun)}</div>
        <div>Next run: {harvester.nextRun ?? 'unknown'}</div>
        <div>Rows processed: {harvester.rowsProcessed ?? 0}</div>
        <div>Rows inserted: {harvester.rowsInserted ?? 0}</div>
        <div>Checkpoint: {harvester.checkpoint ?? 'not exposed'}</div>
        <div>Warnings: {harvester.warningCount}</div>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-[#cfc8b8]/70">{harvester.logSummary}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          disabled
          title="Harvester execution requires a server-side owner authorization API before this frontend may trigger jobs."
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#cfc8b8]/55"
        >
          <PlayCircle className="h-3.5 w-3.5" /> Run now: {controlLabel(harvester.runNow)}
        </button>
        <button
          disabled
          title="Pause and resume controls require backend owner authorization so the browser cannot alter production jobs directly."
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#cfc8b8]/55"
        >
          <PauseCircle className="h-3.5 w-3.5" /> Pause/resume: {controlLabel(harvester.pauseResume)}
        </button>
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
      {repository.knownBlockers.length ? (
        <p className="mt-3 text-[12px] leading-5 text-amber-100/80">{repository.knownBlockers[0]}</p>
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
          title="Production deployment requires backend owner authorization and cannot be triggered safely from this frontend."
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
          {recommendation.title}
        </h3>
        <span className="rounded-full border border-[#d4b34a]/30 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a]">
          {recommendation.priority}
        </span>
      </div>
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

const MissionControl: React.FC = () => {
  const [isUnlocked, setIsUnlocked] = useState(() => localStorage.getItem(ACCESS_STORAGE_KEY) === 'yes');
  const [accessCode, setAccessCode] = useState('');
  const [state, setState] = useState<LoadState>('idle');
  const [dashboard, setDashboard] = useState<MissionControlOperations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = async () => {
    setState('loading');
    setError(null);
    try {
      const next = await fetchMissionControlOperations();
      setDashboard(next);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown Mission Control load failure');
      setState('error');
    }
  };

  useEffect(() => {
    if (isUnlocked) {
      void load();
    }
  }, [isUnlocked]);

  const unlock = () => {
    if (accessCode.trim() === OWNER_ACCESS_CODE) {
      localStorage.setItem(ACCESS_STORAGE_KEY, 'yes');
      setIsUnlocked(true);
    }
  };

  const lock = () => {
    localStorage.removeItem(ACCESS_STORAGE_KEY);
    setIsUnlocked(false);
    setAccessCode('');
    setDashboard(null);
    setState('idle');
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

  const stats = useMemo(() => {
    const health = dashboard?.globalHealth ?? [];
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
              This unlock preserves the existing owner workflow, but it is only a frontend UI gate. Real actions still require server-side owner authorization.
            </p>
            <label className="mt-8 block font-mono text-[10px] uppercase tracking-[0.24em] text-[#c9a24a]">
              Access code
            </label>
            <input
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') unlock();
              }}
              type="password"
              className="mt-3 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-[#f5f0e8] outline-none focus:border-[#d4b34a]/60"
              placeholder="Enter owner code"
            />
            <button
              onClick={unlock}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#12170d] transition-colors hover:bg-[#e5c85c]"
            >
              <KeyRound className="h-3.5 w-3.5" /> Unlock
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06110b] text-[#f5f0e8]">
      <Navbar />
      <main className="pt-20">
        <section className="border-b border-white/[0.08] bg-[#0a170f]">
          <div className="mx-auto max-w-[1540px] px-5 py-8 lg:px-8 lg:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
                  <ShieldCheck className="h-3.5 w-3.5" /> BUILD-036 - Calyx operations center
                </div>
                <h1 className="mt-5 max-w-5xl text-4xl leading-tight md:text-6xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
                  Orchid Continuum <span className="italic text-[#d4b34a]">master operations center.</span>
                </h1>
                <p className="mt-5 max-w-3xl text-[15px] leading-7 text-[#cfc8b8]/88">
                  Mission Control now acts as Calyx's read-only cockpit for global health, harvesters, build status, science completeness, governance, recommendations, and safety boundaries.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => void load()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#12170d] transition-colors hover:bg-[#e5c85c]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${state === 'loading' ? 'animate-spin' : ''}`} /> Refresh Mission Control
                </button>
                <button
                  onClick={lock}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a]/60 hover:text-[#d4b34a]"
                >
                  <LockKeyhole className="h-3.5 w-3.5" /> Lock
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1540px] px-5 py-6 lg:px-8">
          {state === 'error' ? (
            <div className="mb-5 rounded-lg border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">
              <AlertTriangle className="mr-2 inline h-4 w-4" /> {error}
            </div>
          ) : null}

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
                  Frontend unlock is not real security. It only hides this UI until server-side owner roles are available.
                </div>
              </aside>

              <div className="space-y-5">
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="Overall health" value={`${stats.average}%`} detail="Average completeness across registered global systems." />
                  <MetricCard label="Healthy systems" value={stats.healthy} detail="Systems currently marked healthy by live or fallback data." />
                  <MetricCard label="Warnings" value={stats.warning} detail="Systems that need follow-up but are partially present." />
                  <MetricCard label="Stub / blocked" value={stats.blocked} detail="Planned or unavailable systems that need backend/data work." />
                </section>

                <Panel id="mission-control-health" eyebrow="Global health" title="Overall Continuum Health" icon={Activity}>
                  <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {dashboard.globalHealth.map((subsystem) => (
                      <SubsystemCard key={subsystem.id} subsystem={subsystem} />
                    ))}
                  </div>
                </Panel>

                <Panel id="mission-control-completeness" eyebrow="Audit" title="System Completeness Matrix" icon={SlidersHorizontal}>
                  <div className="space-y-3">
                    {dashboard.completenessMatrix.slice(0, 18).map((subsystem) => (
                      <CompletenessRow key={`${subsystem.category}-${subsystem.id}`} subsystem={subsystem} />
                    ))}
                  </div>
                </Panel>

                <Panel id="mission-control-harvesters" eyebrow="Pipelines" title="Harvester Operations" icon={Radar}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {dashboard.harvesters.map((harvester) => (
                      <HarvesterRow key={harvester.id} harvester={harvester} />
                    ))}
                  </div>
                </Panel>

                <Panel eyebrow="Science" title="Scientific Systems Registry" icon={Telescope}>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {dashboard.scientificSystems.map((system) => (
                      <SubsystemCard key={system.id} subsystem={system} />
                    ))}
                  </div>
                </Panel>

                <Panel id="mission-control-builds" eyebrow="Delivery" title="Build / GitHub / Deployment Status" icon={GitBranch}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {dashboard.repositories.map((repository) => (
                      <RepositoryRow key={repository.name} repository={repository} onCopy={(key, value) => void copyToClipboard(key, value)} copiedKey={copiedKey} />
                    ))}
                  </div>
                </Panel>

                <Panel id="mission-control-governance" eyebrow="Governance" title="Constitution and Decision Ledger" icon={ShieldCheck}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-200">
                        {dashboard.governance.build} - {dashboard.governance.status}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[#f5f0e8]/86">{dashboard.governance.northStar}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-black/18 p-4">
                      <div className="grid grid-cols-4 gap-3 text-center">
                        <div><div className="text-2xl text-[#d4b34a]">{dashboard.governance.missions.length}</div><div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#cfc8b8]/60">Missions</div></div>
                        <div><div className="text-2xl text-[#d4b34a]">{dashboard.governance.policies.length}</div><div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#cfc8b8]/60">Policies</div></div>
                        <div><div className="text-2xl text-[#d4b34a]">{dashboard.governance.decisions.length}</div><div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#cfc8b8]/60">Decisions</div></div>
                        <div><div className="text-2xl text-[#d4b34a]">{dashboard.governance.questions.length}</div><div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#cfc8b8]/60">Questions</div></div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      {dashboard.governance.policies.slice(0, 5).map((policy, index) => (
                        <div key={policy.policy_id ?? policy.policy_key ?? policy.title ?? `policy-${index}`} className="rounded-lg border border-white/[0.07] bg-black/18 p-3">
                          <div className="text-sm text-[#faf7f2]">{policy.title}</div>
                          <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/74">{policy.principle ?? policy.description ?? 'Policy preserved.'}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      {dashboard.governance.decisions.slice(0, 5).map((decision, index) => (
                        <div key={decision.decision_id ?? decision.action ?? decision.rationale ?? `decision-${index}`} className="rounded-lg border border-white/[0.07] bg-black/18 p-3">
                          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a]">{decision.status ?? decision.decision ?? 'decision'}</div>
                          <p className="mt-2 text-[12px] leading-5 text-[#cfc8b8]/74">{decision.action ?? decision.rationale ?? decision.decision_id}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
              </div>

              <aside className="h-fit space-y-5 xl:sticky xl:top-24">
                <Panel id="mission-control-calyx-audit" eyebrow="Calyx" title="Executive Summary / Self-Audit" icon={Bot}>
                  <p className="text-sm leading-6 text-[#f5f0e8]/84">{dashboard.calyxSelfAudit.summary}</p>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3">
                      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-200">Can do</div>
                      <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/80">
                        {dashboard.calyxSelfAudit.canDo.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
                      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-amber-200">Cannot do yet</div>
                      <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#cfc8b8]/80">
                        {dashboard.calyxSelfAudit.cannotDoYet.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                  <p className="mt-4 text-[12px] leading-5 text-[#cfc8b8]/70">Risk: {dashboard.calyxSelfAudit.riskLevel}</p>
                </Panel>

                <Panel id="mission-control-recommendations" eyebrow="Next actions" title="Calyx Recommendations" icon={Sparkles}>
                  <div className="space-y-3">
                    {dashboard.recommendations.map((recommendation) => (
                      <RecommendationCard key={recommendation.id} recommendation={recommendation} onCopy={(key, value) => void copyToClipboard(key, value)} copiedKey={copiedKey} />
                    ))}
                  </div>
                </Panel>

                <Panel eyebrow="Activity" title="Recent Activity" icon={Workflow}>
                  <div className="space-y-3">
                    {dashboard.recentActivity.slice(0, 7).map((activity) => (
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

                <Panel id="mission-control-safety" eyebrow="Safety" title="Owner Approval Boundaries" icon={LockKeyhole}>
                  <div className="space-y-3">
                    {dashboard.safetyBoundaries.map((boundary) => (
                      <SafetyRow key={boundary.id} boundary={boundary} />
                    ))}
                  </div>
                </Panel>

                <Panel eyebrow="Diagnostics" title="Endpoint Assumptions" icon={Database}>
                  <button
                    onClick={() => void load()}
                    className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/25 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#d4b34a] transition-colors hover:border-[#d4b34a]/60 hover:bg-[#d4b34a]/10"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${state === 'loading' ? 'animate-spin' : ''}`} /> Refresh telemetry
                  </button>
                  <div className="space-y-3">
                    {dashboard.diagnostics.map((diagnostic) => (
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
                  </div>
                </Panel>
              </aside>
            </div>
          ) : (
            <div className="rounded-lg border border-white/[0.08] bg-[#0d1d13]/90 p-8 text-center">
              <RefreshCw className={`mx-auto h-6 w-6 text-[#d4b34a] ${state === 'loading' ? 'animate-spin' : ''}`} />
              <p className="mt-4 text-sm text-[#cfc8b8]/80">Loading Mission Control operations center...</p>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default MissionControl;
