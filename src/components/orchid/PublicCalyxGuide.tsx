import React from 'react';
import { Link } from 'react-router-dom';
import { Bot, Bug, FlaskConical, Globe2, MessageCircle, Sprout } from 'lucide-react';
import { useDailyGenus } from '@/lib/dailyGenusContext';

const PublicCalyxGuide: React.FC = () => {
  const { genus, continuum } = useDailyGenus();
  const relationships = continuum?.relationships ?? null;

  const prompts = [
    {
      label: 'Pollination',
      icon: Bug,
      question: relationships?.pollinators.hasData
        ? `What does the documented pollinator evidence for ${genus} actually show?`
        : `Why is missing pollinator evidence for ${genus} scientifically useful?`,
    },
    {
      label: 'Fungi',
      icon: Sprout,
      question: relationships?.fungi.hasData
        ? `What do the documented fungal partnerships tell us about ${genus}?`
        : `What would researchers need to document the fungal partners of ${genus}?`,
    },
    {
      label: 'Place',
      icon: Globe2,
      question: relationships?.geography.hasData
        ? `What can the occurrence evidence tell us about where ${genus} is known?`
        : `What does it mean when geographic evidence is not yet linked for ${genus}?`,
    },
    {
      label: 'Evidence',
      icon: FlaskConical,
      question: continuum?.gaps.length
        ? `Which evidence gaps for ${genus} would be most valuable to close next?`
        : `Which sources support what the Continuum currently shows for ${genus}?`,
    },
  ];

  return (
    <section id="ask-calyx" className="relative overflow-hidden border-y border-white/[0.08] bg-[#0a170f] text-[#f5f0e8]">
      <div className="absolute inset-0 pointer-events-none" style={{
        background:
          'radial-gradient(ellipse at 16% 10%, rgba(212,179,74,0.14) 0%, transparent 40%),' +
          'radial-gradient(ellipse at 84% 60%, rgba(76,211,194,0.08) 0%, transparent 42%)',
      }} />

      <div className="relative z-10 mx-auto max-w-[1300px] px-6 py-10 lg:px-10 lg:py-12">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#d4b34a]">
              <span className="inline-block h-px w-8 bg-[#d4b34a]/60" />
              Calyx · scientific guide
            </div>
            <h2 className="mt-4 max-w-2xl font-serif text-[clamp(2rem,4vw,3.4rem)] leading-[1.02] tracking-[-0.01em] text-[#fffaf0]">
              Ask about the evidence already on screen.
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#d8cfbd]/84 md:text-[16px]">
              Calyx is being grounded in the same Continuum context as the page: <span className="italic">{genus}</span>, its linked relationships, and its explicit knowledge gaps. The guide should explain evidence, not manufacture a complete story when the graph is incomplete.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-[#d4b34a]/18 bg-white/[0.045] p-4 shadow-[0_14px_36px_rgba(0,0,0,0.18)]">
            <div className="flex items-start gap-4 rounded-[1.25rem] border border-white/[0.08] bg-black/20 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/12 text-[#d4b34a]">
                <Bot className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#d4b34a]">Context now</div>
                <p className="mt-2 text-sm leading-6 text-[#d8cfbd]/82">
                  Featured taxon: <span className="italic">{genus}</span>. {continuum?.gaps.length
                    ? `${continuum.gaps.length} graph domain${continuum.gaps.length === 1 ? '' : 's'} currently show knowledge gaps.`
                    : continuum ? 'No zero-coverage graph domains were returned in this traversal.' : 'Continuum context is still loading or unavailable.'}
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {prompts.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.label} className="rounded-2xl border border-white/[0.08] bg-black/15 p-3">
                    <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#d4b34a]">
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </div>
                    <p className="mt-2 text-[12px] leading-5 text-[#d8cfbd]/78">{item.question}</p>
                  </article>
                );
              })}
            </div>

            <Link
              to="/calyx"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d4b34a] transition-colors hover:bg-[#d4b34a]/18"
            >
              <MessageCircle className="h-4 w-4" />
              Open Calyx
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PublicCalyxGuide;
