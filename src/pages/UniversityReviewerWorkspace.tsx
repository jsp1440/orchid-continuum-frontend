import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';
import UniversityReviewerPanel from '@/components/university/UniversityReviewerPanel';

const UniversityReviewerWorkspace = () => (
  <PageShell
    eyebrow="Orchid Continuum University · Mission Control"
    title="Scientific reviewer"
    titleAccent="workspace"
    intro="A separately governed human-review surface for submitted University investigations. Authentication alone is insufficient: the backend must resolve an explicit current scientific-review qualification before review records or decision controls are exposed."
  >
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-14 lg:px-10">
      <div className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.035] p-6 md:p-8">
        <div className="flex items-center gap-3 text-violet-100">
          <ShieldCheck className="h-5 w-5" />
          <h2 className="font-serif text-2xl">Governed review boundary</h2>
        </div>
        <div className="mt-4 grid gap-3 text-sm leading-relaxed text-white/68 md:grid-cols-2">
          <p>Administrator or learner identity does not imply scientific-review authority.</p>
          <p>Learning approval requires the backend-governed <code>review.science</code> capability.</p>
          <p>Candidate Knowledge consideration additionally requires <code>review.expert</code>.</p>
          <p>Candidate Knowledge consideration is not promotion, and no action here performs publication.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/45">
        <ClipboardCheck className="h-4 w-4" /> Human review only · no autonomous publication
      </div>

      <UniversityReviewerPanel />
    </section>
  </PageShell>
);

export default UniversityReviewerWorkspace;
