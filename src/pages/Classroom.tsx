import React from 'react';
import {
  Presentation,
  ClipboardList,
  Users,
  FileDown,
  CalendarRange,
  CheckCircle2,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';
import RoleBadge from '@/components/orchid/RoleBadge';
import EducationalOverlay from '@/components/orchid/EducationalOverlay';

/**
 * Classroom
 * ---------
 * Teacher-facing dashboard placeholder. Conceptual UI only — rosters,
 * assignments, and progress reporting wait on `/api/classrooms/*` and
 * `/api/assignments/*` endpoints.
 */

const sampleAssignments = [
  {
    title: 'Map a local orchid genus',
    subject: 'AP Biology · Period 3',
    submitted: 18,
    total: 24,
    due: 'Friday',
    phase: 'Open',
  },
  {
    title: 'Pollinator visitation transect',
    subject: 'Honors Ecology',
    submitted: 11,
    total: 16,
    due: 'Next Tue',
    phase: 'In progress',
  },
  {
    title: 'Bloom timeline (windowsill journal)',
    subject: 'Botany Club',
    submitted: 9,
    total: 9,
    due: 'Closed',
    phase: 'Reviewing',
  },
];

const teacherTools = [
  {
    Icon: Users,
    title: 'Classroom rosters',
    body: 'Invite students by code, group them into cohorts, and assign roles for collaborative investigations.',
  },
  {
    Icon: ClipboardList,
    title: 'Assignment composer',
    body: 'Pull any Orchid University investigation, customise the rubric, set due dates, and assign to a roster in two clicks.',
  },
  {
    Icon: CalendarRange,
    title: 'Project tracking',
    body: 'See where each student stands across the five movements of inquiry — a single, glanceable progress view.',
  },
  {
    Icon: FileDown,
    title: 'Exportable lesson materials',
    body: 'Print-ready PDFs, slide decks, and rubrics aligned to NGSS and Common Core where applicable.',
  },
];

const Classroom: React.FC = () => {
  return (
    <PageShell
      eyebrow="Classroom"
      title="A teacher's workshop,"
      titleAccent="anchored in living biology"
      intro="The Classroom dashboard turns the Continuum into a teaching surface. Assign Atlas explorations, track student inquiry, and export lesson materials — without leaving the platform."
      heroAside={
        <div className="rounded-xl border border-violet-300/30 bg-violet-300/[0.06] p-5">
          <div className="text-[10px] tracking-[0.25em] uppercase text-violet-200/90 mb-2">
            For educators
          </div>
          <p className="text-sm text-white/85 leading-relaxed">
            Designed in consultation with biology teachers, science fair
            advisors, and curriculum coordinators.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <RoleBadge role="teacher" size="sm" />
            <RoleBadge role="student" size="sm" />
          </div>
        </div>
      }
    >
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {teacherTools.map(t => (
            <div
              key={t.title}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-6"
            >
              <t.Icon className="h-5 w-5 text-violet-200 mb-3" />
              <h3 className="font-serif text-lg text-white mb-2 leading-snug">
                {t.title}
              </h3>
              <p className="text-[13px] text-white/65 leading-relaxed font-light">
                {t.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Demo dashboard */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-16">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="px-6 md:px-8 py-5 border-b border-white/10 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Presentation className="h-5 w-5 text-violet-200" />
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-violet-200/80">
                  Demo dashboard
                </div>
                <h3 className="font-serif text-xl text-white">
                  Active assignments
                </h3>
              </div>
            </div>
            <span className="text-[9px] tracking-[0.22em] uppercase text-amber-200/80 border border-amber-200/30 rounded-full px-2 py-0.5">
              Demo · awaiting /api/classrooms
            </span>
          </div>

          <table className="w-full text-sm">
            <thead className="text-[10px] tracking-[0.22em] uppercase text-white/50">
              <tr>
                <th className="text-left px-6 md:px-8 py-3 font-normal">
                  Investigation
                </th>
                <th className="text-left px-4 py-3 font-normal">Class</th>
                <th className="text-left px-4 py-3 font-normal">Submitted</th>
                <th className="text-left px-4 py-3 font-normal">Due</th>
                <th className="text-left px-6 md:px-8 py-3 font-normal">
                  Phase
                </th>
              </tr>
            </thead>
            <tbody>
              {sampleAssignments.map(a => (
                <tr
                  key={a.title}
                  className="border-t border-white/5 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-6 md:px-8 py-4 text-white">{a.title}</td>
                  <td className="px-4 py-4 text-white/70">{a.subject}</td>
                  <td className="px-4 py-4 text-white/70">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                      {a.submitted}/{a.total}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-white/70">{a.due}</td>
                  <td className="px-6 md:px-8 py-4">
                    <span className="text-[10px] tracking-[0.18em] uppercase text-violet-200 border border-violet-300/30 bg-violet-300/[0.06] rounded-full px-2 py-0.5">
                      {a.phase}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-24">
        <EducationalOverlay
          defaultOpen
          title="What the Classroom does — and does not do"
          body={
            <>
              The Classroom is a teaching <strong>workspace</strong>, not a
              gradebook. It tracks scientific progress, surfaces evidence, and
              produces exportable artefacts. Final grades remain in your
              school's system of record. No student data ever leaves the
              Orchid Continuum API boundary.
            </>
          }
        />
      </section>
    </PageShell>
  );
};

export default Classroom;
