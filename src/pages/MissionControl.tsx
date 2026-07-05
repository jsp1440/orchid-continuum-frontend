import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  Database,
  FileText,
  GitBranch,
  KeyRound,
  Layers3,
  LockKeyhole,
  MessageSquareText,
  Monitor,
  Network,
  Radar,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Telescope,
  Workflow,
} from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

type ProbeState = 'idle' | 'loading' | 'healthy' | 'warning' | 'error';

type Probe = {
  key: string;
  title: string;
  endpoint: string;
  status: ProbeState;
  detail: string;
  updatedAt?: string;
};

type Mission = {
  mission_id?: string;
  mission_key?: string;
  title: string;
  purpose?: string;
  status?: string;
  priority?: number;
  next_action?: string;
  safe_autonomy_level?: number | string;
  success_criteria?: string[];
};

type Policy = {
  policy_id?: string;
  policy_key?: string;
  title: string;
  principle?: string;
  description?: string;
  max_autonomy_level?: number | string;
  autonomy_level?: string;
  protected?: boolean;
};

type Decision = {
  decision_id?: string;
  mission_id?: string;
  mission_key?: string;
  action?: string;
  decision?: string;
  status?: string;
  risk_level?: string;
  confidence?: number;
  rationale?: string;
  rollback_checkpoint?: string | null;
  created_at?: string;
  timestamp?: string;
};

type GovernanceQuestion = {
  question_id?: string;
  mission_id?: string;
  mission_key?: string;
  question: string;
  reason?: string;
  status?: string;
  created_at?: string;
  timestamp?: string;
};

type ConstitutionalStatus = {
  build?: string;
  status?: string;
  mode?: string;
  policy_count?: number;
  mission_count?: number;
  decision_count?: number;
  open_governance_questions?: number;
  north_star?: string;
  timestamp?: string;
};

type ChatMessage = {
  role: 'Jeff' | 'Calyx';
  body: string;
};

const ACCESS_STORAGE_KEY = 'oc_mission_control_owner_access_v1';

const OWNER_ACCESS_CODE =
  (import.meta.env.VITE_MISSION_CONTROL_ACCESS_CODE as string | undefined) ||
  'orchid-continuum-owner';

const initialProbes: Probe[] = [
  {
    key: 'constitutional',
    title: 'Constitutional Orchestrator',
    endpoint: '/api/runtime/constitutional/status',
    status: 'idle',
    detail: 'Waiting for BUILD-034 constitutional telemetry.',
  },
  {
    key: 'runner',
    title: 'Runner Health',
    endpoint: '/api/runner/health',
    status: 'idle',
    detail: 'Waiting for live runner telemetry.',
  },
  {
    key: 'connectors',
    title: 'Connector Health',
    endpoint: '/api/connectors/health',
    status: 'idle',
    detail: 'Waiting for GitHub and connector telemetry.',
  },
  {
    key: 'summary',
    title: 'Runner Summary',
    endpoint: '/api/runner/summary',
    status: 'idle',
    detail: 'Waiting for runtime jobs and action summary.',
  },
];

const quickPrompts = [
  'Evaluate homepage repair as an engineering mission.',
  'Evaluate grant preparation as a funding mission.',
  'Evaluate literature extraction as a science mission.',
  'Evaluate Orchid University glossary expansion as an education mission.',
  'Evaluate pollinator and mycorrhizal integration as a science mission.',
];

const workspaceCards = [
  {
    title: 'Frontend Workbench',
    status: 'Repair queue',
    description: 'Homepage, Genus of the Day, Discovery Trails, image diagnostics, and knowledge-layer wiring.',
    icon: Monitor,
  },
  {
    title: 'Constitutional Kernel',
    status: 'BUILD-034 live',
    description: 'Autonomy levels, policies, decision records, governance questions, and rollback checkpoints.',
    icon: ShieldCheck,
  },
  {
    title: 'Calyx Chat',
    status: 'Action evaluator',
    description: 'Mission Control now evaluates owner prompts through the constitutional backend before work proceeds.',
    icon: MessageSquareText,
  },
  {
    title: 'Visual Workspace',
    status: 'Canvas foundation',
    description: 'Mission maps, knowledge layers, relationship diagrams, grant boards, and literature maps.',
    icon: Workflow,
  },
];

const layerNodes = [
  'Beauty',
  'Identity',
  'Ecology',
  'Geography',
  'Literature',
  'History',
  'Culture',
  'Conservation',
  'Media',
  'Education',
  'Community',
  'Ways of Thinking',
];

function summarizePayload(key: string, payload: unknown): string {
  const value = payload as Record<string, unknown>;

  if (key === 'constitutional') {
    return `${String(value.build ?? 'unknown')} · ${String(value.status ?? 'unknown')} · policies=${String(value.policy_count ?? 'unknown')} · missions=${String(value.mission_count ?? 'unknown')}`;
  }

  if (key === 'runner') {
    return `Runner ${value.status ?? 'unknown'} · active=${String(value.active_mode ?? 'unknown')} · autoloop=${String(value.autoloop_enabled ?? 'unknown')} · mode=${String(value.mode ?? 'unknown')}`;
  }

  if (key === 'connectors') {
    const summary = value.summary as Record<string, unknown> | undefined;
    const connectors = value.connectors as Record<string, unknown> | undefined;
    const github = connectors?.github as Record<string, unknown> | undefined;
    return `Connectors ${value.status ?? 'unknown'} · healthy=${String(summary?.healthy ?? 'unknown')}/${String(summary?.total ?? 'unknown')} · GitHub token=${String(github?.token_configured ?? 'unknown')}`;
  }

  if (key === 'summary') {
    const jobs = Array.isArray(value.jobs) ? value.jobs.length : 0;
    const actions = Array.isArray(value.runtime_actions) ? value.runtime_actions.length : 0;
    return `Summary loaded · jobs=${jobs} · runtime actions=${actions}`;
  }

  return 'Telemetry loaded.';
}

function inferMission(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('grant') || lower.includes('fund')) return 'funding';
  if (lower.includes('lesson') || lower.includes('university') || lower.includes('glossary')) return 'education';
  if (lower.includes('habitat') || lower.includes('conservation') || lower.includes('threat')) return 'conservation';
  if (lower.includes('literature') || lower.includes('pollinator') || lower.includes('mycorrhiza') || lower.includes('matrix') || lower.includes('vision')) return 'science';
  if (lower.includes('homepage') || lower.includes('frontend') || lower.includes('deploy') || lower.includes('github')) return 'engineering';
  return 'institutional_memory';
}

const MissionControl: React.FC = () => {
  const [isUnlocked, setIsUnlocked] = useState(() => localStorage.getItem(ACCESS_STORAGE_KEY) === 'yes');
  const [accessCode, setAccessCode] = useState('');
  const [probes, setProbes] = useState<Probe[]>(initialProbes);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [constitutionalStatus, setConstitutionalStatus] = useState<ConstitutionalStatus | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [questions, setQuestions] = useState<GovernanceQuestion[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'Calyx',
      body:
        'Mission Control is connected to the BUILD-034 constitutional orchestrator. Give me a mission, and I will evaluate it through policy, autonomy level, provenance, and rollback guardrails.',
    },
  ]);
  const [chatText, setChatText] = useState('');

  const healthScore = useMemo(() => {
    const healthy = probes.filter((probe) => probe.status === 'healthy').length;
    return `${healthy}/${probes.length}`;
  }, [probes]);

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
  };

  const getJson = async <T,>(endpoint: string): Promise<T> => {
    const response = await fetch(`${CALYX_BACKEND_BASE_URL}${endpoint}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${endpoint}`);
    }
    return response.json() as Promise<T>;
  };

  const refreshTelemetry = async () => {
    setProbes((current) => current.map((probe) => ({ ...probe, status: 'loading', detail: 'Checking live endpoint…' })));

    const next = await Promise.all(
      initialProbes.map(async (probe) => {
        try {
          const payload = await getJson<unknown>(probe.endpoint);
          return {
            ...probe,
            status: 'healthy' as ProbeState,
            detail: summarizePayload(probe.key, payload),
            updatedAt: new Date().toISOString(),
          };
        } catch (error) {
          return {
            ...probe,
            status: 'error' as ProbeState,
            detail: error instanceof Error ? error.message : 'Unknown telemetry error',
            updatedAt: new Date().toISOString(),
          };
        }
      }),
    );

    setProbes(next);

    try {
      const [statusPayload, missionPayload, policyPayload, decisionPayload, questionPayload] = await Promise.all([
        getJson<ConstitutionalStatus>('/api/runtime/constitutional/status'),
        getJson<{ missions?: Mission[] }>('/api/runtime/constitutional/missions'),
        getJson<{ policies?: Policy[] }>('/api/runtime/constitutional/policies'),
        getJson<{ decisions?: Decision[] }>('/api/runtime/constitutional/decision-ledger'),
        getJson<{ questions?: GovernanceQuestion[] }>('/api/runtime/constitutional/governance-questions'),
      ]);

      setConstitutionalStatus(statusPayload);
      setMissions(missionPayload.missions ?? []);
      setPolicies(policyPayload.policies ?? []);
      setDecisions(decisionPayload.decisions ?? []);
      setQuestions(questionPayload.questions ?? []);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'Calyx',
          body: `Mission Control telemetry partially failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        },
      ]);
    }

    setLastRefresh(new Date().toLocaleString());
  };

  useEffect(() => {
    if (isUnlocked) {
      void refreshTelemetry();
    }
  }, [isUnlocked]);

  const evaluateMission = async (promptOverride?: string) => {
    const prompt = (promptOverride ?? chatText).trim();
    if (!prompt) return;

    const missionId = inferMission(prompt);
    setMessages((current) => [...current, { role: 'Jeff', body: prompt }]);
    setChatText('');

    try {
      const response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/runtime/constitutional/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mission_id: missionId,
          action: prompt,
          requested_autonomy_level: prompt.toLowerCase().includes('deploy') ? 4 : 2,
          evidence: ['Owner instruction from Mission Control', 'BUILD-031 Founding Charter', 'BUILD-034 Constitutional Orchestrator'],
          reversible: true,
          provenance_available: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from constitutional evaluator`);
      }

      const payload = await response.json();
      const decision = (payload.decision ?? payload.decision_record ?? {}) as Decision;
      const governanceQuestion = (payload.governance_question ?? undefined) as GovernanceQuestion | undefined;
      const status = decision.status ?? decision.decision ?? 'evaluated';
      const risk = decision.risk_level ?? 'unknown risk';
      const checkpoint = decision.rollback_checkpoint ? ` Rollback checkpoint: ${decision.rollback_checkpoint}.` : '';
      const review = governanceQuestion ? ` Governance question opened: ${governanceQuestion.question}` : '';

      setMessages((current) => [
        ...current,
        {
          role: 'Calyx',
          body: `Constitutional evaluation complete. Mission: ${missionId}. Status: ${status}. Risk: ${risk}.${checkpoint}${review}`,
        },
      ]);
      await refreshTelemetry();
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'Calyx',
          body: `I could not evaluate that mission yet: ${error instanceof Error ? error.message : 'unknown error'}`,
        },
      ]);
    }
  };

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#07140d] text-[#f5f0e8]">
        <Navbar />
        <main className="min-h-screen pt-28 flex items-center justify-center px-6">
          <section className="w-full max-w-xl rounded-[2rem] border border-[#d4b34a]/25 bg-[#0d1d13]/90 p-8 shadow-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.24em] uppercase text-[#d4b34a]">
              <LockKeyhole className="h-3.5 w-3.5" /> Owner-only access
            </div>
            <h1 className="mt-6 text-4xl md:text-5xl leading-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Mission Control
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#cfc8b8]/85">
              This private workspace is reserved for the Orchid Continuum owner. BUILD-035 connects the interface to the live constitutional orchestrator; server-side owner roles are still required before exposing write controls.
            </p>
            <label className="mt-8 block font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a]">
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
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] tracking-[0.22em] uppercase text-[#12170d] hover:bg-[#e5c85c] transition-colors"
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
        <section className="relative overflow-hidden border-b border-white/[0.08]">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at 12% 5%, rgba(212,179,74,0.18) 0%, rgba(6,17,11,0) 46%),' +
                'radial-gradient(ellipse at 85% 15%, rgba(76,211,194,0.12) 0%, rgba(6,17,11,0) 45%),' +
                'radial-gradient(ellipse at 50% 100%, rgba(52,211,153,0.13) 0%, rgba(6,17,11,0) 58%)',
            }}
          />
          <div className="relative z-10 max-w-[1500px] mx-auto px-5 lg:px-8 py-10 lg:py-14">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.24em] uppercase text-[#d4b34a]">
                  <ShieldCheck className="h-3.5 w-3.5" /> Build 035 · Live Mission Control
                </div>
                <h1 className="mt-5 max-w-5xl text-5xl md:text-7xl leading-[0.95]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Orchid Continuum <span className="italic text-[#d4b34a]">operations center.</span>
                </h1>
                <p className="mt-5 max-w-3xl text-[15px] md:text-[17px] leading-relaxed text-[#cfc8b8]/88">
                  A private interface for Calyx missions, constitutional guardrails, decision ledgers, governance questions, frontend repair, grants, and visual thinking.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => void refreshTelemetry()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] tracking-[0.22em] uppercase text-[#12170d] hover:bg-[#e5c85c] transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh live state
                </button>
                <button
                  onClick={lock}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-mono text-[10px] tracking-[0.22em] uppercase text-[#f5f0e8] hover:border-[#d4b34a]/60 hover:text-[#d4b34a] transition-colors"
                >
                  <LockKeyhole className="h-3.5 w-3.5" /> Lock
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-[1500px] mx-auto px-5 lg:px-8 py-6">
          <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_330px] gap-5">
            <aside className="rounded-[1.5rem] border border-white/[0.08] bg-[#0b1c11]/85 p-4 h-fit xl:sticky xl:top-24">
              <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">Navigation</div>
              {[
                ['Dashboard', Activity],
                ['Calyx Chat', Bot],
                ['Missions', Radar],
                ['Policies', ShieldCheck],
                ['Decision Ledger', FileText],
                ['Governance Queue', AlertTriangle],
                ['Visual Canvas', Workflow],
                ['Grant Workspace', Telescope],
              ].map(([label, Icon]) => {
                const LucideIcon = Icon as typeof Activity;
                return (
                  <div key={String(label)} className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3 text-sm text-[#f5f0e8]/85">
                    <LucideIcon className="h-4 w-4 text-[#d4b34a]" strokeWidth={1.5} />
                    {label as string}
                  </div>
                );
              })}
              <Link to="/" className="mt-5 block rounded-full border border-[#d4b34a]/25 px-4 py-3 text-center font-mono text-[9px] tracking-[0.18em] uppercase text-[#d4b34a]">
                Return to public site
              </Link>
            </aside>

            <div className="space-y-5">
              <section className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4">
                {probes.map((probe) => (
                  <article key={probe.key} className="rounded-[1.35rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-10 h-10 rounded-full border border-[#d4b34a]/30 bg-[#d4b34a]/10 flex items-center justify-center">
                        {probe.status === 'healthy' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-300" strokeWidth={1.5} />
                        ) : probe.status === 'loading' ? (
                          <RefreshCw className="h-5 w-5 text-[#d4b34a] animate-spin" strokeWidth={1.5} />
                        ) : probe.status === 'error' ? (
                          <AlertTriangle className="h-5 w-5 text-red-300" strokeWidth={1.5} />
                        ) : (
                          <Radar className="h-5 w-5 text-amber-200" strokeWidth={1.5} />
                        )}
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 font-mono text-[8.5px] tracking-[0.16em] uppercase text-[#cfc8b8]/70">
                        {probe.status}
                      </span>
                    </div>
                    <h3 className="mt-5 text-xl text-[#faf7f2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                      {probe.title}
                    </h3>
                    <p className="mt-3 text-[12.5px] leading-relaxed text-[#cfc8b8]/75">{probe.detail}</p>
                  </article>
                ))}
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-5">
                <article className="rounded-[1.5rem] border border-[#d4b34a]/18 bg-[#0b1c11]/90 p-5 lg:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">Calyx</div>
                      <h2 className="mt-2 text-3xl text-[#faf7f2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                        Constitutional conversation console
                      </h2>
                    </div>
                    <Bot className="h-7 w-7 text-[#d4b34a]" strokeWidth={1.5} />
                  </div>
                  <div className="mt-5 max-h-[380px] overflow-auto space-y-3 pr-2">
                    {messages.map((message, index) => (
                      <div key={`${message.role}-${index}`} className={`rounded-2xl border p-4 ${message.role === 'Jeff' ? 'border-[#d4b34a]/25 bg-[#d4b34a]/10' : 'border-white/[0.08] bg-black/20'}`}>
                        <div className="font-mono text-[9px] tracking-[0.22em] uppercase text-[#d4b34a]">{message.role}</div>
                        <p className="mt-2 text-sm leading-relaxed text-[#f5f0e8]/85">{message.body}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {quickPrompts.map((prompt) => (
                      <button key={prompt} onClick={() => void evaluateMission(prompt)} className="rounded-full border border-white/10 px-3 py-2 text-left text-[11px] text-[#cfc8b8]/80 hover:border-[#d4b34a]/45 hover:text-[#d4b34a]">
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-3">
                    <textarea
                      value={chatText}
                      onChange={(event) => setChatText(event.target.value)}
                      className="min-h-[92px] flex-1 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-[#f5f0e8] outline-none focus:border-[#d4b34a]/60"
                      placeholder="Ask Calyx to evaluate a mission…"
                    />
                    <button onClick={() => void evaluateMission()} className="rounded-2xl bg-[#d4b34a] px-5 font-mono text-[10px] tracking-[0.18em] uppercase text-[#12170d]">
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </article>

                <article className="rounded-[1.5rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5 lg:p-6">
                  <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">Constitution</div>
                  <h2 className="mt-2 text-3xl text-[#faf7f2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                    BUILD-034 live state
                  </h2>
                  <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                    <div className="text-2xl text-[#faf7f2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                      {constitutionalStatus?.build ?? 'Waiting'}
                    </div>
                    <div className="mt-1 font-mono text-[9px] tracking-[0.18em] uppercase text-emerald-200">
                      {constitutionalStatus?.status ?? 'not loaded'}
                    </div>
                    <p className="mt-3 text-[12.5px] leading-relaxed text-[#cfc8b8]/78">
                      {constitutionalStatus?.north_star ?? 'The Orchid Continuum exists to cultivate understanding by revealing relationships.'}
                    </p>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-black/15 p-3 text-center">
                      <div className="text-2xl text-[#d4b34a]">{constitutionalStatus?.mission_count ?? missions.length}</div>
                      <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#cfc8b8]/60">Missions</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/15 p-3 text-center">
                      <div className="text-2xl text-[#d4b34a]">{constitutionalStatus?.policy_count ?? policies.length}</div>
                      <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#cfc8b8]/60">Policies</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/15 p-3 text-center">
                      <div className="text-2xl text-[#d4b34a]">{constitutionalStatus?.open_governance_questions ?? questions.length}</div>
                      <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#cfc8b8]/60">Questions</div>
                    </div>
                  </div>
                </article>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <article className="rounded-[1.5rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5">
                  <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]"><Radar className="h-4 w-4" /> Mission registry</div>
                  <div className="mt-4 space-y-3">
                    {missions.slice(0, 7).map((mission) => (
                      <div key={mission.mission_id ?? mission.mission_key ?? mission.title} className="rounded-2xl border border-white/[0.07] bg-black/15 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-lg text-[#faf7f2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{mission.title}</h3>
                          <span className="rounded-full border border-[#d4b34a]/25 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[#d4b34a]">L{String(mission.safe_autonomy_level ?? mission.status ?? '—')}</span>
                        </div>
                        <p className="mt-2 text-[12px] leading-relaxed text-[#cfc8b8]/72">{mission.purpose ?? mission.next_action ?? 'Mission lane active.'}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-[1.5rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5">
                  <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]"><ShieldCheck className="h-4 w-4" /> Policy registry</div>
                  <div className="mt-4 space-y-3">
                    {policies.slice(0, 7).map((policy) => (
                      <div key={policy.policy_id ?? policy.policy_key ?? policy.title} className="rounded-2xl border border-white/[0.07] bg-black/15 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-lg text-[#faf7f2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{policy.title}</h3>
                          {policy.protected && <span className="rounded-full bg-amber-300/15 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-amber-200">protected</span>}
                        </div>
                        <p className="mt-2 text-[12px] leading-relaxed text-[#cfc8b8]/72">{policy.principle ?? policy.description ?? 'Constitutional policy active.'}</p>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {workspaceCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <article key={card.title} className="rounded-[1.35rem] border border-white/[0.08] bg-[#102816]/88 p-5">
                      <Icon className="h-5 w-5 text-[#d4b34a]" strokeWidth={1.5} />
                      <h3 className="mt-5 text-2xl leading-tight text-[#faf7f2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                        {card.title}
                      </h3>
                      <div className="mt-2 font-mono text-[9px] tracking-[0.18em] uppercase text-emerald-300">{card.status}</div>
                      <p className="mt-4 text-[12.5px] leading-relaxed text-[#cfc8b8]/75">{card.description}</p>
                    </article>
                  );
                })}
              </section>
            </div>

            <aside className="space-y-5 xl:sticky xl:top-24 h-fit">
              <section className="rounded-[1.5rem] border border-white/[0.08] bg-[#0b1c11]/85 p-5">
                <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">Live state</div>
                <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <div className="text-4xl text-[#faf7f2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{healthScore}</div>
                  <div className="mt-1 font-mono text-[9px] tracking-[0.18em] uppercase text-emerald-200">healthy probes</div>
                </div>
                <div className="mt-5 space-y-3 text-[12.5px] text-[#cfc8b8]/78">
                  <div className="flex items-start gap-3"><Database className="h-4 w-4 text-[#d4b34a]" /> Backend: {CALYX_BACKEND_BASE_URL}</div>
                  <div className="flex items-start gap-3"><GitBranch className="h-4 w-4 text-[#d4b34a]" /> Constitutional build: {constitutionalStatus?.build ?? 'loading'}</div>
                  <div className="flex items-start gap-3"><Layers3 className="h-4 w-4 text-[#d4b34a]" /> Knowledge layers: mapped</div>
                  <div className="flex items-start gap-3"><Network className="h-4 w-4 text-[#d4b34a]" /> Mission registry: {missions.length || 'loading'} lanes</div>
                </div>
                <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-[12px] leading-relaxed text-amber-100/85">
                  Direct write controls remain withheld. Mission Control can evaluate and display governance now; server-side owner roles are required before production mutation controls are exposed.
                </div>
                {lastRefresh && (
                  <div className="mt-4 font-mono text-[9px] tracking-[0.16em] uppercase text-[#cfc8b8]/55">
                    Last refresh: {lastRefresh}
                  </div>
                )}
              </section>

              <section className="rounded-[1.5rem] border border-white/[0.08] bg-[#0b1c11]/85 p-5">
                <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">Decision ledger</div>
                <div className="mt-4 space-y-3">
                  {(decisions.length ? decisions : [{ decision_id: 'waiting', action: 'No live decisions yet', status: 'ready', risk_level: 'low' }]).slice(0, 4).map((decision) => (
                    <div key={decision.decision_id ?? decision.action} className="rounded-2xl border border-white/[0.07] bg-black/15 p-3">
                      <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#d4b34a]">{decision.status ?? decision.decision ?? 'decision'}</div>
                      <p className="mt-2 text-[12px] leading-relaxed text-[#cfc8b8]/75">{decision.action ?? decision.rationale ?? decision.decision_id}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-white/[0.08] bg-[#0b1c11]/85 p-5">
                <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">Visual layers</div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {layerNodes.map((node) => (
                    <div key={node} className="rounded-xl border border-[#d4b34a]/15 bg-black/15 px-3 py-2 text-[11px] text-[#cfc8b8]/78">
                      {node}
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default MissionControl;
