import React from 'react';
import { Bot, BookOpen, Compass, FlaskConical, GraduationCap, Leaf, MessageCircle, ShieldCheck } from 'lucide-react';

const guidePrompts = [
  {
    label: 'Growers',
    prompt: 'Ask how habitat, season, and roots can inform cultivation.',
    icon: Leaf,
  },
  {
    label: 'Students',
    prompt: 'Ask for plain-language definitions, diagrams, and examples.',
    icon: GraduationCap,
  },
  {
    label: 'Researchers',
    prompt: 'Ask where evidence, literature, and knowledge gaps connect.',
    icon: FlaskConical,
  },
  {
    label: 'Conservationists',
    prompt: 'Ask which relationships matter for protection and recovery.',
    icon: ShieldCheck,
  },
];

const PublicCalyxGuide: React.FC = () => {
  return (
    <section id="ask-calyx" className="relative overflow-hidden border-y border-white/[0.08] bg-[#0a170f] text-[#f5f0e8]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 16% 10%, rgba(212,179,74,0.16) 0%, transparent 42%),' +
            'radial-gradient(ellipse at 84% 60%, rgba(76,211,194,0.10) 0%, transparent 46%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 py-16 lg:px-10 lg:py-22">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[#d4b34a]">
              <span className="inline-block h-px w-8 bg-[#d4b34a]/60" />
              Meet Calyx
            </div>
            <h2
              className="mt-6 max-w-3xl leading-[1.02] tracking-[-0.01em] text-[#fffaf0]"
              style={{
                fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontSize: 'clamp(2.25rem, 4.6vw, 4.2rem)',
                fontWeight: 560,
              }}
            >
              A guide for a complicated living world.
            </h2>
            <div className="mt-6 max-w-3xl space-y-4 text-[16px] leading-7 text-[#d8cfbd]/88 md:text-[18px] md:leading-8">
              <p>
                Orchids are connected to names, fungi, pollinators, habitats, climate, literature, growers, field records, and conservation decisions. Calyx helps visitors follow those connections without having to know where to start.
              </p>
              <p>
                Calyx is not an intrusive pop-up. He is the Orchid Continuum&apos;s research guide: available when you want help, quiet when you simply want to explore.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#the-knowledge-graph"
                className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-6 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#14281c] transition-colors hover:bg-[#e6c763]"
              >
                <Compass className="h-4 w-4" />
                Start with the graph
              </a>
              <a
                href="/university"
                className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/40 px-6 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a] hover:bg-[#d4b34a]/10"
              >
                <BookOpen className="h-4 w-4" />
                Open Orchid University
              </a>
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#d4b34a]/18 bg-white/[0.045] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.20)] lg:p-6">
            <div className="flex items-start gap-4 rounded-[1.5rem] border border-white/[0.08] bg-black/20 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/12 text-[#d4b34a]">
                <Bot className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#d4b34a]">Calyx can help</div>
                <p className="mt-2 text-sm leading-6 text-[#d8cfbd]/82">
                  You are exploring the Featured Genus. Ask Calyx what makes it unusual, where its species occur, which pollinators or fungi are known, what terms mean, or what evidence is still missing.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {guidePrompts.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.label} className="rounded-2xl border border-white/[0.08] bg-black/15 p-4">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d4b34a]">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </div>
                    <p className="mt-2 text-[13px] leading-6 text-[#d8cfbd]/76">{item.prompt}</p>
                  </article>
                );
              })}
            </div>

            <button
              type="button"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d4b34a] transition-colors hover:bg-[#d4b34a]/18"
            >
              <MessageCircle className="h-4 w-4" />
              Ask Calyx interface coming online
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PublicCalyxGuide;
