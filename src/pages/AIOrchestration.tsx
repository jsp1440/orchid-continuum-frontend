import React, { useMemo, useState } from 'react';
import { Bot, Brain, Clipboard, Download, FileArchive, GitPullRequest, Network, Search, ShieldCheck, Sparkles } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';

type AgentRole = {
  name: string;
  role: string;
  output: string;
  guardrail: string;
};

const agents: AgentRole[] = [
  {
    name: 'Claude',
    role: 'Implementation engineer',
    output: 'GitHub branch, code changes, PR, build report, deployment note',
    guardrail: 'Code first; do not invent architecture or fake data.',
  },
  {
    name: 'Perplexity',
    role: 'Research analyst',
    output: 'Downloadable Markdown research report with citations and examples',
    guardrail: 'Research orchids explicitly; return one complete file, not fragmented cards.',
  },
  {
    name: 'Kimi',
    role: 'Independent reviewer',
    output: 'Downloadable Markdown review with blockers, fixes, and merge recommendation',
    guardrail: 'Audit data-source integrity, SQL, architecture, and regressions.',
  },
  {
    name: 'ChatGPT / Calyx',
    role: 'Chief architect and orchestrator',
    output: 'Backlog updates, integration decisions, prompt templates, final deployment guidance',
    guardrail: 'Keep work aligned with OCCC, OCOS, provenance, and the master tracker.',
  },
];

const taskTemplates = [
  {
    title: 'Featured Genus backend rebuild',
    assignee: 'Claude',
    summary: 'Rebuild the Featured Genus data endpoint from Orchid Continuum tables only. No iNaturalist fallback.',
  },
  {
    title: 'Orchid genus experience research',
    assignee: 'Perplexity',
    summary: 'Research orchid-specific genus pages, pollinator/fungi storytelling, atlas previews, and public-vs-research UX.',
  },
  {
    title: 'BUILD PR review',
    assignee: 'Kimi',
    summary: 'Review the pull request for data-source integrity, regressions, SQL assumptions, and merge safety.',
  },
];

const protocol = `# Orchid Continuum AI Collaboration Protocol\n\nAll AI work supports the Orchid Continuum: an orchid biodiversity, conservation, education, and scientific cognition platform.\n\nRules:\n- Produce downloadable Markdown files for substantial work.\n- Do not leave important output trapped in chat cards or fragmented tables.\n- Preserve provenance.\n- Do not fabricate live data.\n- Use Orchid Continuum sources before external fallbacks.\n- Update the tracker and build documentation.\n- State blockers honestly.\n\nRoles:\n- Claude implements.\n- Perplexity researches.\n- Kimi reviews.\n- ChatGPT/Calyx integrates and prioritizes.\n`;

const AIOrchestration: React.FC = () => {
  const [copied, setCopied] = useState<string | null>(null);
  const downloadUrl = useMemo(() => {
    const blob = new Blob([protocol], { type: 'text/markdown' });
    return URL.createObjectURL(blob);
  }, []);

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="min-h-screen bg-[#07140d] text-[#f5f0e8]">
      <Navbar />
      <main className="pt-24">
        <section className="border-b border-white/[0.08] bg-[#0a170f]">
          <div className="mx-auto max-w-[1400px] px-6 py-12 lg:px-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
              <Network className="h-3.5 w-3.5" /> BUILD-041 · AI Orchestration
            </div>
            <h1 className="mt-5 max-w-5xl text-4xl leading-tight md:text-6xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
              Stop making Jeff the router.
            </h1>
            <p className="mt-4 max-w-3xl text-[16px] leading-7 text-[#cfc8b8]/88">
              Mission Control now has a first orchestration workspace for coordinating Claude, Perplexity, Kimi, ChatGPT, and Calyx through one protocol, one tracker, and one file-output standard.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-[1.5rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5 lg:p-6">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
                <Brain className="h-4 w-4" /> Agent roles
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {agents.map((agent) => (
                  <div key={agent.name} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-2xl text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>{agent.name}</h2>
                      <Bot className="h-5 w-5 text-[#d4b34a]" />
                    </div>
                    <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300">{agent.role}</div>
                    <p className="mt-3 text-sm leading-6 text-[#cfc8b8]/78"><strong>Output:</strong> {agent.output}</p>
                    <p className="mt-2 text-sm leading-6 text-[#cfc8b8]/70"><strong>Guardrail:</strong> {agent.guardrail}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[1.5rem] border border-[#d4b34a]/18 bg-[#102816]/88 p-5 lg:p-6">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
                <FileArchive className="h-4 w-4" /> File-output standard
              </div>
              <h2 className="mt-4 text-3xl text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Every AI returns files.</h2>
              <p className="mt-3 text-sm leading-6 text-[#cfc8b8]/80">
                Research reports, code reviews, build summaries, blockers, and implementation notes must be delivered as Markdown files and, when multiple artifacts exist, a ZIP archive.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={() => copy('protocol', protocol)} className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#12170d]">
                  <Clipboard className="h-4 w-4" /> {copied === 'protocol' ? 'Copied' : 'Copy protocol'}
                </button>
                <a href={downloadUrl} download="Orchid_Continuum_AI_Collaboration_Protocol.md" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f5f0e8] hover:border-[#d4b34a]/60">
                  <Download className="h-4 w-4" /> Download MD
                </a>
              </div>
            </article>
          </div>

          <section className="mt-5 rounded-[1.5rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5 lg:p-6">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
              <GitPullRequest className="h-4 w-4" /> Current orchestration queue
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {taskTemplates.map((task) => (
                <article key={task.title} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300">{task.assignee}</div>
                  <h3 className="mt-2 text-xl text-[#faf7f2]" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>{task.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#cfc8b8]/75">{task.summary}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            <article className="rounded-[1.5rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5 lg:p-6">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
                <ShieldCheck className="h-4 w-4" /> Constitutional alignment
              </div>
              <p className="mt-4 text-sm leading-6 text-[#cfc8b8]/80">
                BUILD-041 does not attempt full autonomous cross-AI execution. It creates the human-reviewable coordination layer required before automation: roles, file requirements, task templates, and approval gates.
              </p>
            </article>
            <article className="rounded-[1.5rem] border border-white/[0.08] bg-[#0d1d13]/90 p-5 lg:p-6">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">
                <Search className="h-4 w-4" /> Next automation step
              </div>
              <p className="mt-4 text-sm leading-6 text-[#cfc8b8]/80">
                Next: persist AI tasks and outputs in the backend/Brain, generate prompts from structured tasks, attach returned files, and update the master tracker automatically.
              </p>
            </article>
          </section>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default AIOrchestration;
