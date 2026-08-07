import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Beaker, BookOpenCheck, LockKeyhole, ShieldCheck } from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';
import UniversityLearnerNotebook from '@/components/university/UniversityLearnerNotebook';
import { universityApi } from '@/lib/universityApi';
import {
  releaseBlockers,
  releaseMode,
  safeScienceContent,
  summarizeRelease,
} from '@/lib/universityRelease';

const StatusBadge = ({ children }: { children: string }) => (
  <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100">
    {children}
  </span>
);

const UniversityLabPrototype = () => {
  const release = useQuery({
    queryKey: ['university-release-readiness'],
    queryFn: universityApi.releaseReadiness,
    retry: false,
  });
  const capability = useQuery({
    queryKey: ['university-capability'],
    queryFn: universityApi.capability,
    retry: false,
  });

  const mode = release.data ? releaseMode(release.data) : null;
  const capabilityConsistent = Boolean(
    capability.data?.enabled &&
      ((mode === 'read_only' &&
        capability.data.session_writes_enabled === false &&
        capability.data.durable_sessions_enabled === false &&
        capability.data.persistence === 'process_local_memory') ||
        (mode === 'durable' &&
          capability.data.session_writes_enabled === true &&
          capability.data.durable_sessions_enabled === true &&
          capability.data.persistence === 'postgres_durable')),
  );
  const enabled = Boolean(
    release.data && safeScienceContent(release.data) && capabilityConsistent,
  );
  const durableWorkspace = enabled && mode === 'durable';
  const blockers = release.data ? releaseBlockers(release.data) : [];
  if (release.data && capability.data && !capabilityConsistent && mode !== 'disabled') {
    blockers.push('Capability and release-readiness persistence states do not agree.');
  }

  const catalog = useQuery({
    queryKey: ['university-catalog'],
    queryFn: universityApi.catalog,
    enabled,
    retry: false,
  });
  const chapter = useQuery({
    queryKey: ['university-chapter', catalog.data?.chapter.id],
    queryFn: () => universityApi.chapter(catalog.data!.chapter.id),
    enabled: Boolean(catalog.data?.chapter.id),
    retry: false,
  });
  const laboratory = useQuery({
    queryKey: ['university-laboratory', catalog.data?.laboratory.id],
    queryFn: () => universityApi.laboratory(catalog.data!.laboratory.id),
    enabled: Boolean(catalog.data?.laboratory.id),
    retry: false,
  });

  return (
    <PageShell
      eyebrow="Orchid Continuum University"
      title="Scientific inquiry"
      titleAccent="laboratory"
      intro="Book in the Brain connected to an evidence-labelled orchid investigation. The interface remains read-only unless the backend proves the separately governed durable-session release gate."
    >
      <section className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
        {(release.isLoading || capability.isLoading) && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
            Checking University release readiness…
          </div>
        )}

        {(release.isError || capability.isError) && (
          <div className="rounded-2xl border border-red-300/30 bg-red-300/10 p-8">
            <div className="mb-3 flex items-center gap-2 text-red-100">
              <AlertTriangle className="h-5 w-5" />
              <h2 className="font-serif text-2xl">University service unavailable</h2>
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-white/70">
              The frontend could not verify the Calyx University release contract. No educational
              data has been inferred or substituted. Check the deployed API origin and the
              <code className="mx-1">/api/learning/release-readiness</code> endpoint.
            </p>
          </div>
        )}

        {release.data && !enabled && (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.07] p-8 md:p-10">
            <div className="mb-4 flex items-center gap-3 text-amber-100">
              <LockKeyhole className="h-5 w-5" />
              <h2 className="font-serif text-2xl md:text-3xl">{summarizeRelease(release.data)}</h2>
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-white/75">
              The University remains closed whenever the backend and capability contracts disagree
              or any scientific safety boundary is not satisfied. No mock science is substituted.
            </p>
            {blockers.length > 0 && (
              <ul className="mt-5 space-y-2 text-sm text-amber-50/80">
                {blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
              </ul>
            )}
          </div>
        )}

        {enabled && (catalog.isLoading || chapter.isLoading || laboratory.isLoading) && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
            Loading the evidence-backed chapter and laboratory…
          </div>
        )}

        {enabled && chapter.data && laboratory.data && release.data && (
          <div className="space-y-8">
            <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.045] p-5 text-sm text-emerald-50/80">
              <strong>{summarizeRelease(release.data)}.</strong>{' '}
              {durableWorkspace
                ? 'Learner revisions may be stored durably; publication, Candidate Knowledge writes, and Calyx model calls remain disabled, and human review is required.'
                : 'Learner writes, publication, Candidate Knowledge writes, and Calyx model calls are disabled; human review is required.'}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-7 md:p-9">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <BookOpenCheck className="h-5 w-5 text-emerald-200" />
                  <StatusBadge>{chapter.data.status}</StatusBadge>
                  <StatusBadge>Book in the Brain</StatusBadge>
                </div>
                <h2 className="mb-3 font-serif text-3xl text-white">{chapter.data.title}</h2>
                <p className="mb-7 max-w-3xl text-sm leading-relaxed text-white/70">{chapter.data.summary}</p>
                <div className="space-y-5">
                  {chapter.data.sections.map((section) => (
                    <section key={section.section_id} className="border-l border-emerald-300/30 pl-5">
                      <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-emerald-200/80">{section.epistemic_status}</div>
                      <h3 className="mb-2 font-serif text-xl text-white">{section.title}</h3>
                      <p className="text-sm leading-relaxed text-white/68">{section.body}</p>
                    </section>
                  ))}
                </div>
              </article>

              <aside className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.04] p-7 md:p-9">
                <div className="mb-4 flex items-center gap-3 text-emerald-100">
                  <ShieldCheck className="h-5 w-5" />
                  <h2 className="font-serif text-2xl">Scientific boundaries</h2>
                </div>
                <div className="space-y-3 text-sm leading-relaxed text-white/72">
                  <p>Publication is disabled.</p>
                  <p>Candidate Knowledge writes are disabled.</p>
                  <p>Calyx model calls are disabled.</p>
                  <p>Human review remains required.</p>
                  <p>
                    Session persistence: {durableWorkspace ? 'verified Postgres durable storage' : 'process-local, non-durable prototype'}.
                  </p>
                </div>
              </aside>
            </div>

            <article className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.035] p-7 md:p-9">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <Beaker className="h-5 w-5 text-amber-200" />
                <StatusBadge>{laboratory.data.status}</StatusBadge>
                <StatusBadge>{durableWorkspace ? 'Durable laboratory' : 'Read-only laboratory'}</StatusBadge>
              </div>
              <h2 className="mb-3 font-serif text-3xl text-white">{laboratory.data.title}</h2>
              <p className="mb-7 max-w-3xl text-sm leading-relaxed text-white/70">{laboratory.data.summary}</p>
              <div className="mb-8 flex flex-wrap gap-2">
                {laboratory.data.inquiry_sequence.map((stage, index) => (
                  <div key={stage} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/75">{index + 1}. {stage}</div>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {laboratory.data.evidence_catalog.map((evidence) => (
                  <div key={evidence.evidence_id} className="rounded-xl border border-white/10 bg-black/10 p-5">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-amber-100/80">{evidence.epistemic_status}</div>
                    <h3 className="mb-2 font-serif text-lg text-white">{evidence.label}</h3>
                    <p className="text-sm leading-relaxed text-white/65">{evidence.summary}</p>
                  </div>
                ))}
              </div>
            </article>

            {durableWorkspace && (
              <UniversityLearnerNotebook
                chapterId={chapter.data.chapter_id}
                laboratoryId={laboratory.data.laboratory_id}
              />
            )}
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default UniversityLabPrototype;
