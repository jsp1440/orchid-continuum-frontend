import React from 'react';
import {
  GraduationCap,
  BookOpenCheck,
  Beaker,
  Trophy,
  Lightbulb,
  ListChecks,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';
import GlossaryTerm from '@/components/orchid/GlossaryTerm';
import EducationalOverlay from '@/components/orchid/EducationalOverlay';
import RoleBadge from '@/components/orchid/RoleBadge';

/**
 * OrchidUniversity
 * ----------------
 * The student-facing entry point. Walks learners through the scientific
 * method using the Continuum's living catalogue as their evidence base.
 *
 * Conceptual UI only — investigation templates, science-fair workspaces,
 * and progress tracking await `/api/learning/*` endpoints.
 */

const inquirySteps = [
  {
    n: '01',
    Icon: Lightbulb,
    title: 'Pose a question',
    body: 'Begin with curiosity. The Continuum offers thousands of open questions about pollinators, climate, and habitat — from windowsill observations to field-scale puzzles.',
  },
  {
    n: '02',
    Icon: ListChecks,
    title: 'Design an investigation',
    body: 'Choose a method that fits your question. Photograph documentation, atlas analysis, growth journals, and pollinator transects are all available templates.',
  },
  {
    n: '03',
    Icon: Beaker,
    title: 'Gather evidence',
    body: 'Document orchid sightings, record measurements, or query the Continuum catalogue. Every observation is timestamped and attributed to the student.',
  },
  {
    n: '04',
    Icon: BookOpenCheck,
    title: 'Build understanding',
    body: 'Compare your findings against published literature and the Continuum knowledge graph. The system surfaces relevant studies and ecological context.',
  },
  {
    n: '05',
    Icon: Trophy,
    title: 'Share findings',
    body: 'Compose a science-fair-ready report or contribute back to the Continuum as a documented observation, with credit returned to the student and their school.',
  },
];

const investigations = [
  {
    title: 'Why does this orchid only bloom at this elevation?',
    level: 'Middle school',
    duration: '3–4 weeks',
    skills: ['Observation', 'Climate data', 'Mapping'],
  },
  {
    title: 'Which pollinator visits your local Cattleya relatives?',
    level: 'High school',
    duration: '6–8 weeks',
    skills: ['Field observation', 'Photo-vouchering', 'Statistics'],
  },
  {
    title: 'How does humidity shape Phalaenopsis blooming on a windowsill?',
    level: 'Beginner / Home',
    duration: '2 months',
    skills: ['Sensors (OACS)', 'Journaling', 'Bloom timeline'],
  },
  {
    title: 'Mapping range shifts across a century of herbarium records',
    level: 'Advanced / IB',
    duration: '1 semester',
    skills: ['Data wrangling', 'GIS', 'Historical records'],
  },
];

const OrchidUniversity: React.FC = () => {
  return (
    <PageShell
      eyebrow="Orchid University"
      title="A living laboratory"
      titleAccent="for scientific inquiry"
      intro="Orchid University guides students through the scientific method using real biodiversity data. Every investigation is a real question — about pollinators, climate, habitat, or care — answered with real evidence drawn from the Continuum's living catalogue."
      heroAside={
        <div className="rounded-xl border border-amber-300/30 bg-amber-300/[0.05] p-5">
          <div className="text-[10px] tracking-[0.25em] uppercase text-amber-200/90 mb-2">
            For students
          </div>
          <p className="text-sm text-white/85 leading-relaxed">
            Earn a documented record of every investigation you complete —
            citable, timestamped, and credited to you.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <RoleBadge role="student" size="sm" />
            <RoleBadge role="teacher" size="sm" />
          </div>
        </div>
      }
    >
      {/* Inquiry workflow */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-16">
        <div className="text-[10px] tracking-[0.3em] uppercase text-emerald-200/80 mb-3">
          The scientific method, made tangible
        </div>
        <h2 className="font-serif text-3xl md:text-4xl text-white max-w-3xl mb-3">
          Five movements of inquiry
        </h2>
        <p className="text-sm md:text-base text-white/70 max-w-2xl leading-relaxed mb-10">
          A guided path that mirrors how working biologists actually think —
          stripped of jargon, scaffolded with{' '}
          <GlossaryTerm
            term="Hypothesis"
            definition="A testable, falsifiable statement about how the world might work, written precisely enough that an observation could disagree with it."
          >
            hypotheses
          </GlossaryTerm>
          , evidence, and{' '}
          <GlossaryTerm
            term="Provenance"
            definition="The traceable record of where a piece of data came from — who collected it, when, where, and under what license — so others can verify and reuse it."
          >
            provenance
          </GlossaryTerm>
          .
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {inquirySteps.map(s => (
            <div
              key={s.n}
              className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:border-emerald-300/30 transition-colors"
            >
              <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/70 mb-3">
                {s.n}
              </div>
              <s.Icon className="h-5 w-5 text-emerald-200 mb-3" />
              <h3 className="font-serif text-lg text-white mb-2 leading-snug">
                {s.title}
              </h3>
              <p className="text-[13px] text-white/65 leading-relaxed font-light">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Investigations */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-20">
        <div className="flex items-end justify-between gap-6 mb-8 flex-wrap">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-emerald-200/80 mb-2">
              Guided investigations
            </div>
            <h2 className="font-serif text-3xl md:text-4xl text-white">
              Real questions, ready to be answered
            </h2>
          </div>
          <EducationalOverlay
            compact
            title="Science-fair mode"
            body="When science-fair mode is enabled, an investigation upgrades to a structured workspace with rubric-aligned milestones, a citation manager, and a presentation export — designed to satisfy school and district science-fair requirements."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {investigations.map(inv => (
            <div
              key={inv.title}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 hover:border-amber-300/30 hover:bg-white/[0.035] transition-colors"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] tracking-[0.22em] uppercase text-amber-200/80 border border-amber-200/30 rounded-full px-2 py-0.5">
                  {inv.level}
                </span>
                <span className="text-[10px] tracking-[0.18em] uppercase text-white/55">
                  {inv.duration}
                </span>
              </div>
              <h3 className="font-serif text-xl text-white leading-snug mb-4">
                {inv.title}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {inv.skills.map(s => (
                  <span
                    key={s}
                    className="text-[10px] tracking-wide text-white/65 border border-white/10 rounded-full px-2 py-0.5"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Glossary surface */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-20">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 md:p-10">
          <div className="flex items-center gap-2 text-emerald-200 mb-4">
            <GraduationCap className="h-4 w-4" />
            <span className="text-[10px] tracking-[0.3em] uppercase">
              Glossary tooltips on every page
            </span>
          </div>
          <h3 className="font-serif text-2xl md:text-3xl text-white max-w-3xl leading-snug mb-4">
            Every technical term across the Continuum carries a plain-language
            definition one hover away.
          </h3>
          <p className="text-sm text-white/70 max-w-2xl leading-relaxed">
            Try it: a {' '}
            <GlossaryTerm
              term="Mycorrhiza"
              definition="A symbiotic partnership between fungi and plant roots. For most orchids it is essential — seeds cannot germinate without the right fungal partner."
            >
              mycorrhiza
            </GlossaryTerm>{' '}
            is not a piece of trivia, it is a living relationship that decides
            whether an orchid seed becomes a plant. Understanding terms like
            this turns a beautiful flower into a window onto an ecosystem.
          </p>
        </div>
      </section>
    </PageShell>
  );
};

export default OrchidUniversity;
