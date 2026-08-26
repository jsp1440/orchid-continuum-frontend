import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FlaskConical,
  Map as MapIcon,
  MessagesSquare,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PageShell from '@/components/orchid/PageShell';
import {
  classroomAtlasHref,
  classroomCalyxHref,
} from '@/lib/classroomInvestigationNavigation';

type InvestigationDraft = {
  title: string;
  taxon: string;
  observation: string;
  question: string;
  hypothesis: string;
  design: string;
  collection: string;
  analysis: string;
  conclusion: string;
  communication: string;
  updatedAt: string;
};

const STORAGE_KEY = 'orchid-continuum:classroom:scientific-method-draft:v1';

const emptyDraft: InvestigationDraft = {
  title: '',
  taxon: '',
  observation: '',
  question: '',
  hypothesis: '',
  design: '',
  collection: '',
  analysis: '',
  conclusion: '',
  communication: '',
  updatedAt: '',
};

const stages: Array<{
  key: keyof Omit<InvestigationDraft, 'title' | 'taxon' | 'updatedAt'>;
  title: string;
  prompt: string;
  placeholder: string;
}> = [
  {
    key: 'observation',
    title: '1. Observe',
    prompt: 'Record what you saw or measured before interpreting it.',
    placeholder: 'Example: Flowers opened earlier on plants receiving cooler nights…',
  },
  {
    key: 'question',
    title: '2. Question',
    prompt: 'Ask a focused question that evidence could answer.',
    placeholder: 'Does night temperature affect flowering time in this taxon?',
  },
  {
    key: 'hypothesis',
    title: '3. Hypothesize',
    prompt: 'State a testable explanation and its predicted result.',
    placeholder: 'If cooler nights promote floral induction, then…',
  },
  {
    key: 'design',
    title: '4. Design',
    prompt: 'Define comparisons, variables, controls, replication, and stopping rules.',
    placeholder: 'Treatment groups, measurements, sample size, duration, controls…',
  },
  {
    key: 'collection',
    title: '5. Collect',
    prompt: 'Describe the observations, records, or source-backed evidence collected.',
    placeholder: 'Measurements, dates, instruments, source identifiers, missing values…',
  },
  {
    key: 'analysis',
    title: '6. Analyze',
    prompt: 'Record patterns, uncertainty, limitations, and counterevidence.',
    placeholder: 'Observed pattern, analysis method, uncertainty, alternative explanations…',
  },
  {
    key: 'conclusion',
    title: '7. Conclude',
    prompt: 'Say whether evidence supports, weakens, or leaves the hypothesis unresolved.',
    placeholder: 'The available evidence supports / does not support / is insufficient because…',
  },
  {
    key: 'communication',
    title: '8. Communicate',
    prompt: 'Plan how the result, methods, citations, and provenance will be shared.',
    placeholder: 'Audience, output format, citations, verification steps, next experiment…',
  },
];

const ScientificMethodLab: React.FC = () => {
  const [draft, setDraft] = useState<InvestigationDraft>(emptyDraft);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setDraft({ ...emptyDraft, ...JSON.parse(stored) });
      }
    } catch {
      // A corrupt or unavailable local draft must not block the workspace.
    }
  }, []);

  const completed = useMemo(
    () => stages.filter(stage => draft[stage.key].trim()).length,
    [draft],
  );

  const update = (key: keyof InvestigationDraft, value: string) => {
    setSaved(false);
    setDraft(current => ({ ...current, [key]: value }));
  };

  const saveDraft = () => {
    const next = { ...draft, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setDraft(next);
    setSaved(true);
  };

  // The learner's own subject and question, taken into the Continuum. Nothing
  // else from the draft can travel: the producers accept a taxon and a question
  // and have no parameter for a hypothesis, observation, design, analysis or
  // conclusion. Both fail closed on a subject they cannot bound, so a learner
  // who wrote "my windowsill orchid" gets no button rather than a conversation
  // about nothing.
  const atlasHref = classroomAtlasHref(draft.taxon);
  const calyxHref = classroomCalyxHref(draft.taxon, draft.question);

  const exportDraft = () => {
    const exportedAt = new Date().toISOString();
    const record = {
      schema: 'orchid-continuum.scientific-method-draft.v1',
      recordType: 'learner_investigation_draft',
      evidenceStatus: 'non_evidentiary_draft',
      provenance: {
        createdIn: 'Orchid Continuum Classroom',
        exportedAt,
        localOnly: true,
        governedVerificationRequired: true,
      },
      investigation: { ...draft, updatedAt: draft.updatedAt || exportedAt },
    };
    const blob = new Blob([JSON.stringify(record, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'orchid-investigation-draft.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell
      eyebrow="Classroom · Investigation Lab"
      title="Build a scientific argument,"
      titleAccent="one accountable step at a time"
      intro="A recovered Orchid Continuum learning workflow for moving from observation to a transparent, verifiable scientific result."
      heroAside={
        <div className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-5">
          <div className="flex items-center gap-2 text-amber-200 mb-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-[10px] tracking-[0.22em] uppercase">
              Non-evidentiary workspace
            </span>
          </div>
          <p className="text-sm text-white/75 leading-relaxed">
            Entries here are learner notes. They do not become Continuum
            evidence or knowledge-graph claims without governed submission,
            source review, and verification.
          </p>
        </div>
      }
    >
      <section className="max-w-5xl mx-auto px-6 lg:px-10 py-12">
        <Link
          to="/classroom"
          className="inline-flex items-center gap-2 text-sm text-violet-200 hover:text-white mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Classroom
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <label className="block">
              <span className="text-xs tracking-[0.16em] uppercase text-white/55">
                Investigation title
              </span>
              <input
                value={draft.title}
                onChange={event => update('title', event.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-300/60"
                placeholder="A focused name for this investigation"
              />
            </label>
            <label className="block">
              <span className="text-xs tracking-[0.16em] uppercase text-white/55">
                Taxon or subject
              </span>
              <input
                value={draft.taxon}
                onChange={event => update('taxon', event.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-300/60"
                placeholder="Genus, species, habitat, or phenomenon"
              />
            </label>
          </div>
        </div>

        <div className="space-y-4">
          {stages.map(stage => (
            <label
              key={stage.key}
              className="block rounded-2xl border border-white/10 bg-white/[0.02] p-6"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h2 className="font-serif text-xl text-white">{stage.title}</h2>
                  <p className="text-sm text-white/60 mt-1">{stage.prompt}</p>
                </div>
                {draft[stage.key].trim() && (
                  <CheckCircle2 className="h-5 w-5 text-emerald-300 shrink-0" />
                )}
              </div>
              <textarea
                value={draft[stage.key]}
                onChange={event => update(stage.key, event.target.value)}
                rows={4}
                className="w-full resize-y rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-300/60"
                placeholder={stage.placeholder}
              />
            </label>
          ))}
        </div>

        <div className="sticky bottom-4 mt-6 rounded-2xl border border-violet-300/25 bg-[#11101b]/95 p-4 shadow-2xl backdrop-blur flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-5 w-5 text-violet-200" />
            <div>
              <div className="text-sm text-white">{completed} of 8 stages recorded</div>
              <div className="text-xs text-white/45">
                {saved ? 'Local draft saved' : 'Draft changes are not yet saved'}
              </div>
              {atlasHref || calyxHref ? (
                <div className="mt-1 text-xs text-white/45">
                  Only your taxon and question travel onward. Your hypothesis, observations and
                  conclusion stay in this draft — they are your work, not Continuum evidence.
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveDraft}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-300/30 px-4 py-2 text-sm text-violet-100 hover:bg-violet-300/10"
            >
              <Save className="h-4 w-4" />
              Save locally
            </button>
            {atlasHref ? (
              <Link
                to={atlasHref}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-300/30 px-4 py-2 text-sm text-violet-100 hover:bg-violet-300/10"
              >
                <MapIcon className="h-4 w-4" />
                See it in the Atlas
              </Link>
            ) : null}
            {calyxHref ? (
              <Link
                to={calyxHref}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-300/30 px-4 py-2 text-sm text-violet-100 hover:bg-violet-300/10"
              >
                <MessagesSquare className="h-4 w-4" />
                Ask Calyx
              </Link>
            ) : null}
            <button
              type="button"
              onClick={exportDraft}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-200 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-white"
            >
              <Download className="h-4 w-4" />
              Export research record
            </button>
          </div>
        </div>
      </section>
    </PageShell>
  );
};

export default ScientificMethodLab;
