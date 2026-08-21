import React from 'react';
import { ArrowRight, FlaskConical, GraduationCap, HeartHandshake, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { featuredTaxonResearchHref } from '@/lib/featuredTaxonNavigation';

const HomepageStewardshipClose: React.FC = () => {
  const { genus, continuum } = useDailyGenus();
  const gapCount = continuum?.gaps.length ?? 0;
  const researchHref = featuredTaxonResearchHref(genus);

  return (
    <section className="border-b border-white/[0.06] bg-[#102116] text-[#f5f0e8]">
      <div className="mx-auto max-w-[1200px] px-6 py-14 lg:px-10 lg:py-18">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#d4b34a]">
              <span className="inline-block h-px w-8 bg-[#d4b34a]/60" />
              From evidence to stewardship
            </div>
            <h2 className="mt-5 max-w-3xl font-serif text-4xl leading-tight text-[#fffaf0] md:text-5xl">
              What we know about <span className="italic text-[#d4b34a]">{genus}</span> should lead to the next question — and better protection.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#d8cfbd]/86">
              The Continuum keeps evidence, uncertainty, and knowledge gaps visible so growers, students, researchers, and conservation partners can act without confusing an incomplete record with biological absence.
            </p>
            {gapCount > 0 && (
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[#c9a24a]">
                {gapCount} current featured-taxon evidence gap{gapCount === 1 ? '' : 's'} visible in this journey
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link to={researchHref} className="rounded-2xl border border-white/10 bg-black/15 p-4 transition-colors hover:border-[#d4b34a]/45 hover:bg-[#d4b34a]/8">
              <FlaskConical className="h-5 w-5 text-[#d4b34a]" />
              <p className="mt-3 font-serif text-xl text-[#fffaf0]">Research Station</p>
              <p className="mt-2 text-sm leading-6 text-[#cfc8b8]/78">Carry this featured genus into the research workflow without promoting route context to evidence.</p>
            </Link>
            <Link to="/university" className="rounded-2xl border border-white/10 bg-black/15 p-4 transition-colors hover:border-[#d4b34a]/45 hover:bg-[#d4b34a]/8">
              <GraduationCap className="h-5 w-5 text-[#d4b34a]" />
              <p className="mt-3 font-serif text-xl text-[#fffaf0]">Orchid University</p>
              <p className="mt-2 text-sm leading-6 text-[#cfc8b8]/78">Learn the biology behind the relationships.</p>
            </Link>
            <Link to="/get-involved" className="rounded-2xl border border-white/10 bg-black/15 p-4 transition-colors hover:border-[#d4b34a]/45 hover:bg-[#d4b34a]/8">
              <HeartHandshake className="h-5 w-5 text-[#d4b34a]" />
              <p className="mt-3 font-serif text-xl text-[#fffaf0]">Get involved</p>
              <p className="mt-2 text-sm leading-6 text-[#cfc8b8]/78">Support the people and partnerships building the Continuum.</p>
            </Link>
            <Link to="/conservation" className="group rounded-2xl border border-[#d4b34a]/30 bg-[#d4b34a]/10 p-4 transition-colors hover:bg-[#d4b34a]/16">
              <ShieldCheck className="h-5 w-5 text-[#d4b34a]" />
              <p className="mt-3 font-serif text-xl text-[#fffaf0]">Conservation</p>
              <p className="mt-2 text-sm leading-6 text-[#cfc8b8]/78">Follow evidence toward protection and recovery.</p>
              <span className="mt-3 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#d4b34a]">
                Continue <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomepageStewardshipClose;
