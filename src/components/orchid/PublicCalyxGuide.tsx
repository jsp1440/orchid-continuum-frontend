import React from 'react';
import { Bot, BookOpen, Compass, FlaskConical, GraduationCap, Leaf, MessageCircle, ShieldCheck } from 'lucide-react';

const guidePrompts = [
  { label: 'Grow', prompt: 'Habitat clues, roots, seasons, and bloom timing.', icon: Leaf },
  { label: 'Learn', prompt: 'Plain-language terms, diagrams, and examples.', icon: GraduationCap },
  { label: 'Research', prompt: 'Literature, evidence, and knowledge gaps.', icon: FlaskConical },
  { label: 'Protect', prompt: 'Relationships that matter for conservation.', icon: ShieldCheck },
];

const PublicCalyxGuide: React.FC = () => {
  return (
    <section id="ask-calyx" className="relative overflow-hidden border-y border-white/[0.08] bg-[#0a170f] text-[#f5f0e8]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 16% 10%, rgba(212,179,74,0.14) 0%, transparent 40%),' +
            'radial-gradient(ellipse at 84% 60%, rgba(76,211,194,0.08) 0%, transparent 42%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1300px] px-6 py-10 lg:px-10 lg:py-12">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#d4b34a]">
              <span className="inline-block h-px w-8 bg-[#d4b34a]/60" />
              Meet Calyx
            </div>
            <h2
              className="mt-4 max-w-2xl leading-[1.02] tracking-[-0.01em] text-[#fffaf0]"
              style={{
                fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontSize: 'clamp(2rem, 4vw, 3.4rem)',
                fontWeight: 560,
              }}
            >
              Your quiet guide to the Continuum.
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#d8cfbd]/84 md:text-[16px]">
              Calyx helps translate orchid relationships into plain language: names, habitats, pollinators, fungi, literature, maps, and conservation questions. Ask when you want help; wander when you don&apos;t.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="#the-knowledge-graph"
                className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#14281c] transition-colors hover:bg-[#e6c763]"
              >
                <Compass className="h-4 w-4" />
                See the graph
              </a>
              <a
                href="/university"
                className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/40 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f0e8] transition-colors hover:border-[#d4b34a] hover:bg-[#d4b34a]/10"
              >
                <BookOpen className="h-4 w-4" />
                Orchid University
              </a>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[#d4b34a]/18 bg-white/[0.045] p-4 shadow-[0_14px_36px_rgba(0,0,0,0.18)]">
            <div className="flex items-start gap-4 rounded-[1.25rem] border border-white/[0.08] bg-black/20 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/12 text-[#d4b34a]">
                <Bot className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#d4b34a]">Ask in ordinary language</div>
                <p className="mt-2 text-sm leading-6 text-[#d8cfbd]/82">
                  “Why does this genus matter?” “What does peloton mean?” “Where are the knowledge gaps?” Calyx will use the page context instead of making you start from scratch.
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {guidePrompts.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.label} className="rounded-2xl border border-white/[0.08] bg-black/15 p-3">
                    <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#d4b34a]">
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </div>
                    <p className="mt-2 text-[12px] leading-5 text-[#d8cfbd]/72">{item.prompt}</p>
                  </article>
                );
              })}
            </div>

            <button
              type="button"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d4b34a] transition-colors hover:bg-[#d4b34a]/18"
            >
              <MessageCircle className="h-4 w-4" />
              Public Calyx chat is next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PublicCalyxGuide;
