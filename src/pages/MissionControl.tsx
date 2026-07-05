import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  Database,
  Eye,
  FileText,
  GitBranch,
  Image,
  KeyRound,
  Layers3,
  LockKeyhole,
  MessageSquareText,
  Monitor,
  Network,
  PlayCircle,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sprout,
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
    key: 'runner',
    title: 'Runner Health',
    endpoint: '/api/runner/health',
    status: 'idle',
    detail: 'Waiting for live telemetry.',
  },
  {
    key: 'connectors',
    title: 'Connector Health',
    endpoint: '/api/connectors/health',
    status: 'idle',
    detail: 'Waiting for GitHub and health connector telemetry.',
  },
  {
    key: 'summary',
    title: 'Runner Summary',
    endpoint: '/api/runner/summary',
    status: 'idle',
    detail: 'Waiting for runtime jobs and action summary.',
  },
  {
    key: 'autonomous',
    title: 'Autonomous Status',
    endpoint: '/api/runner/autonomous-status',
    status: 'idle',
    detail: 'Waiting for Calyx runtime engine status.',
  },
];

const quickPrompts = [
  'Audit the frontend homepage and tell me what needs repair first.',
  'Show me the status of Calyx, GitHub, and the runner.',
  'Prepare a Genus of the Day image repair plan.',
  'Summarize what changed in the Orchid Continuum today.',
  'Help me organize the grant work due this week.',
];

const workspaceCards = [
  {
    title: 'Frontend Workbench',
    status: 'Build 032 ready',
    description: 'Homepage repair queue for Genus of the Day, Discovery Trails, image URLs, and Knowledge Layers.',
    icon: Monitor,
  },
  {
    title: 'Calyx Chat',
    status: 'Shell active',
    description: 'Conversational command surface. Current build supports guided local planning; action wiring comes next.',
    icon: MessageSquareText,
  },
  {
    title: 'Visual Workspace',
    status: 'Canvas placeholder',
    description: 'Future home for graphs, mind maps, relationship diagrams, literature maps, and project boards.',
    icon: Workflow,
  },
  {
    title: 'Founding Charter',
    status: 'Build 031 preserved',
    description: 'The project philosophy is now version-controlled in the backend repository and ready for Calyx context loading.',
    icon: FileText,
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

  if (key === 'runner') {
    return `Runner ${value.status ?? 'unknown'} · active=${String(value.active_mode ?? 'unknown')} · autoloop=${String(value.autoloop_enabled ?? 'unknown')}`;
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

  if (key === 'autonomous') {
    return `Runtime engine loaded · enabled=${String(value.enabled ?? 'unknown')} · running=${String(value.running ?? 'unknown')}`;
  }

  return 'Telemetry loaded.';
}

const MissionControl: React.FC = () => {
  const [isUnlocked, setIsUnlocked] = useState(() => localStorage.getItem(ACCESS_STORAGE_KEY) === 'yes');
  const [accessCode, setAccessCode] = useState('');
  const [probes, setProbes] = useState<Probe[]>(initialProbes);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'Calyx',
      body:
        'Mission Control is online in protected shell mode. I can help organize frontend repair, runtime checks, grants, knowledge gaps, and the next integration steps. Action execution will be wired in the next build.',
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

  const refreshTelemetry = async () => {
    setProbes((current) => current.map((probe) => ({ ...probe, status: 'loading', detail: 'Checking live endpoint…' })));

    const next = await Promise.all(
      initialProbes.map(async (probe) => {
        try {
          const response = await fetch(`${CALYX_BACKEND_BASE_URL}${probe.endpoint}`);
          if (!response.ok) {
            return {
              ...probe,
              status: 'warning' as ProbeState,
              detail: `HTTP ${response.status} from ${probe.endpoint}`,
              updatedAt: new Date().toISOString(),
            };
          }
          const payload = await response.json();
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
    setLastRefresh(new Date().toLocaleString());
  };

  useEffect(() => {
    if (isUnlocked) {
      void refreshTelemetry();
    }
  }, [isUnlocked]);

  const sendMessage = (promptOverride?: string) => {
    const prompt = (promptOverride ?? chatText).trim();
    if (!prompt) return;

    setMessages((current) => [
      ...current,
      { role: 'Jeff', body: prompt },
      {
        role: 'Calyx',
        body:
          'I have captured this as a Mission Control instruction. In the current BUILD-033 shell I can organize the task and point to the right workbench; BUILD-034 should connect this chat directly to live Calyx actions, GitHub inspection, frontend audits, and grant workspace generation.',
      },
    ]);
    setChatText('');
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
              This private workspace is reserved for the Orchid Continuum owner. The current gate protects the interface shell; server-side role enforcement should be added before exposing write actions or sensitive data.
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
                  <ShieldCheck className="h-3.5 w-3.5" /> Build 033 · Owner Mission Control
                </div>
                <h1 className="mt-5 max-w-5xl text-5xl md:text-7xl leading-[0.95]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Orchid Continuum <span className="italic text-[#d4b34a]">headquarters.</span>
                </h1>
                <p className="mt-5 max-w-3xl text-[15px] md:text-[17px] leading-relaxed text-[#cfc8b8]/88">
                  A private operating environment for Calyx, frontend repair, live telemetry, visual thinking, grant work, and institutional memory.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => void refreshTelemetry()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] tracking-[0.22em] uppercase text-[#12170d] hover:bg-[#e5c85c] transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh telemetry
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
          <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_320px] gap-5">
            <aside className="rounded-[1.5rem] border border-white/[0.08] bg-[#0b1c11]/85 p-4 h-fit xl:sticky xl:top-24">
              <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">Navigation</div>
              {[
                ['Dashboard', Activity],
                ['Calyx Chat', Bot],
                ['Frontend Workbench', Monitor],
                ['Brain Explorer', Brain],
                ['Knowledge Gaps', Telescope],
                ['Visual Canvas', Workflow],
                ['Grant Workspace', FileText],
                ['Founding Charter', Sparkles],
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
                        Conversation console
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
                      <button key={prompt} onClick={() => sendMessage(prompt)} className="rounded-full border border-white/10 px-3 py-2 text-left text-[11px] text-[#cfc8b8]/80 hover:border-[#d4b34a]/45 hover:text-[#d4b34a]">
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-3">
                    <textarea
                      value={chatText}
                      onChange={(event) => setChatText(event.target.value)}
                      className="min-h-[92px] flex-1 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-[#f5f0e8] outline-none focus:border-[#d4b34a]/60"
                      placeholder="Talk to Calyx…"
                    />
                    <button onClick={() => sendMessage()} className="rounded-2xl bg-[#d4b34a] px-5 font-mono text-[10px] tracking-[0.18em] uppercase text-[#12170d]">
                      Send
                    </button>
                  </div>
                </article>

                <article className="rounded-[1.5rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5 lg:p-6">
                  <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">Visual monitor</div>
                  <h2 className="mt-2 text-3xl text-[#faf7f2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                    Knowledge layers map
                  </h2>
                  <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {layerNodes.map((node, index) => (
                      <div key={node} className="rounded-2xl border border-[#d4b34a]/18 bg-black/15 p-3 text-center">
                        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-[#d4b34a]/30 bg-[#d4b34a]/10 font-mono text-[10px] text-[#d4b34a]">
                          {index + 1}
                        </div>
                        <div className="mt-2 text-[12px] text-[#f5f0e8]/85">{node}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-5 text-[12.5px] leading-relaxed text-[#cfc8b8]/70">
                    This placeholder becomes the mind-map and relationship-graph canvas in BUILD-035. It is included now so Mission Control is designed around visual thinking from the beginning.
                  </p>
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

            <aside className="rounded-[1.5rem] border border-white/[0.08] bg-[#0b1c11]/85 p-5 h-fit xl:sticky xl:top-24">
              <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">Live state</div>
              <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <div className="text-4xl text-[#faf7f2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{healthScore}</div>
                <div className="mt-1 font-mono text-[9px] tracking-[0.18em] uppercase text-emerald-200">healthy probes</div>
              </div>
              <div className="mt-5 space-y-3 text-[12.5px] text-[#cfc8b8]/78">
                <div className="flex items-start gap-3"><Database className="h-4 w-4 text-[#d4b34a]" /> Backend: {CALYX_BACKEND_BASE_URL}</div>
                <div className="flex items-start gap-3"><GitBranch className="h-4 w-4 text-[#d4b34a]" /> Frontend workbench: planning queue ready</div>
                <div className="flex items-start gap-3"><Layers3 className="h-4 w-4 text-[#d4b34a]" /> Knowledge layers: mapped</div>
                <div className="flex items-start gap-3"><Eye className="h-4 w-4 text-[#d4b34a]" /> Owner gate: client shell only</div>
              </div>
              <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-[12px] leading-relaxed text-amber-100/85">
                This page currently avoids secrets and write controls. Server-side owner roles are required before direct GitHub writes, deployment controls, or sensitive logs are exposed.
              </div>
              {lastRefresh && (
                <div className="mt-4 font-mono text-[9px] tracking-[0.16em] uppercase text-[#cfc8b8]/55">
                  Last refresh: {lastRefresh}
                </div>
              )}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <Link to="/diagnostics/daily-genus" className="rounded-2xl border border-white/10 bg-black/15 p-3 text-center text-[11px] text-[#d4b34a]">
                  Diagnostics
                </Link>
                <Link to="/relationship-explorer" className="rounded-2xl border border-white/10 bg-black/15 p-3 text-center text-[11px] text-[#d4b34a]">
                  Relationships
                </Link>
                <Link to="/gallery" className="rounded-2xl border border-white/10 bg-black/15 p-3 text-center text-[11px] text-[#d4b34a]">
                  Images
                </Link>
                <Link to="/university" className="rounded-2xl border border-white/10 bg-black/15 p-3 text-center text-[11px] text-[#d4b34a]">
                  University
                </Link>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default MissionControl;
