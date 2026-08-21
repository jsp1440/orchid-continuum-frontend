import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CircleDashed,
  FlaskConical,
  Globe2,
  HelpCircle,
  Layers,
  MessageCircle,
  Microscope,
  Network,
  ScrollText,
} from 'lucide-react';
import { CalyxApiError } from '@/lib/calyxWorkspace';
import {
  buildResearchDossier,
  getResearchProject,
  listResearchDocuments,
  listResearchEvidence,
  listResearchNotes,
  listResearchProjects,
  listResearchTaxa,
  researchStationCalyxQuestion,
  type ResearchStationDossier,
} from '@/lib/researchStation';
import {
  researchStationAtlasHref,
  researchStationCalyxHref,
  researchStationLexiconHref,
  researchStationMatrixHref,
  researchStationRelationshipsHref,
  researchStationSpeciesHref,
} from '@/lib/researchStationNavigation';
import {
  ResearchStationQuestionMissing,
  groupClaimCoverage,
  hasUnresolvedConflict,
  runResearchStationSynthesis,
  synthesisGaps,
  type ClaimCoverageGroups,
  type ResearchStationSynthesis,
} from '@/lib/researchStationSynthesis';

/**
 * ResearchStationWorkbench — one investigation, read end to end.
 *
 * The station answers, in order: what am I investigating, what am I asking,
 * what does the Continuum actually hold, where does that evidence disagree,
 * what is genuinely unknown, and where do I go next. It reads the canonical
 * Research Workspace contract and renders what is there. It never derives a
 * scientific conclusion in the browser: interpretation comes from Calyx, over
 * the governed evidence-synthesis path, and is reached from here.
 *
 * An empty section means the workspace holds nothing of that kind yet. That is
 * a gap in the record, and is always labelled as one — never as a finding.
 */

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; dossier: ResearchStationDossier }
  | { status: 'empty' }
  | { status: 'error'; kind: string; message: string };

const SectionShell: React.FC<{
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}> = ({ icon, eyebrow, title, children }) => (
  <section className="rounded-2xl border border-white/10 bg-[#142a1f] p-5 md:p-6">
    <div className="flex items-center gap-2 text-emerald-300/80">
      {icon}
      <span className="font-mono text-[10px] uppercase tracking-[0.25em]">{eyebrow}</span>
    </div>
    <h3 className="mt-2 font-serif text-xl text-white md:text-2xl">{title}</h3>
    <div className="mt-4">{children}</div>
  </section>
);

/** An absent section states what is missing, never a scientific zero. */
const NothingRecorded: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-2 rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-3">
    <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
    <p className="text-xs leading-5 text-white/60">{children}</p>
  </div>
);

const ToolLink: React.FC<{ to: string; icon: React.ReactNode; label: string; detail: string }> = ({
  to,
  icon,
  label,
  detail,
}) => (
  <Link
    to={to}
    className="group flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 transition-colors hover:border-emerald-300/50 hover:bg-emerald-300/[0.06]"
  >
    <span className="mt-0.5 text-emerald-300/80">{icon}</span>
    <span className="min-w-0">
      <span className="flex items-center gap-1.5 text-sm font-medium text-white">
        {label}
        <ArrowRight className="h-3.5 w-3.5 text-emerald-300/70 transition-transform group-hover:translate-x-0.5" />
      </span>
      <span className="mt-0.5 block text-xs leading-5 text-white/55">{detail}</span>
    </span>
  </Link>
);

type SynthesisState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ready'; result: ResearchStationSynthesis }
  | { status: 'error'; kind: string; message: string };

const COVERAGE_LABEL: Record<keyof ClaimCoverageGroups, string> = {
  supported: 'Supported by the linked evidence',
  contested: 'Evidence disagrees',
  contradicted: 'Contradicted by the linked evidence',
  unresolved: 'No linked evidence resolves this',
};

/**
 * The governed synthesis, run from the station and read here.
 *
 * Deliberately not run on mount: a turn starts a governed Brain mission, and
 * firing one on every page view would spend real retrieval on an investigation
 * nobody asked about yet. The user asks, exactly as they would in Calyx.
 *
 * The integrated answer is the primary surface. Claim coverage, conflicts, gaps
 * and provenance sit behind a disclosure so the prose stays readable without the
 * machinery being hidden.
 */
const SynthesisPanel: React.FC<{
  dossier: ResearchStationDossier;
  question: string;
  calyxHref: string;
  onConversation: (conversationId: string) => void;
}> = ({ dossier, question, calyxHref, onConversation }) => {
  const [state, setState] = useState<SynthesisState>({ status: 'idle' });

  const run = useCallback(async () => {
    setState({ status: 'running' });
    try {
      const result = await runResearchStationSynthesis(dossier);
      setState({ status: 'ready', result });
      onConversation(result.conversationId);
    } catch (error) {
      if (error instanceof ResearchStationQuestionMissing) {
        setState({ status: 'error', kind: 'validation_failed', message: error.message });
        return;
      }
      if (error instanceof CalyxApiError) {
        setState({ status: 'error', kind: error.kind, message: error.message });
        return;
      }
      setState({
        status: 'error',
        kind: 'server_error',
        message: 'Calyx could not be reached for this investigation.',
      });
    }
  }, [dossier, onConversation]);

  if (state.status === 'idle' || state.status === 'running') {
    return (
      <div className="mt-4 grid gap-3">
        <button
          type="button"
          onClick={() => void run()}
          disabled={state.status === 'running'}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-300/15 disabled:opacity-60"
        >
          <MessageCircle className="h-4 w-4" />
          {state.status === 'running' ? 'Reasoning over the evidence…' : 'Synthesize this investigation'}
        </button>
        <p className="text-xs leading-5 text-white/45">{question}</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 px-4 py-3" role="status">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-200">
          {state.kind === 'authentication_required' ? 'Sign-in required' : 'Synthesis unavailable'}
        </p>
        <p className="mt-2 text-sm leading-6 text-white/75">{state.message}</p>
        <p className="mt-2 text-xs leading-5 text-white/50">
          No interpretation is shown in its place. This says nothing about the evidence — only
          that Calyx could not be reached.
        </p>
        <button
          type="button"
          onClick={() => void run()}
          className="mt-3 rounded-full border border-white/20 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white hover:bg-white/5"
        >
          Try again
        </button>
      </div>
    );
  }

  const { result } = state;
  const groups = groupClaimCoverage(result.structure);
  const gaps = synthesisGaps(result.structure);
  const conflicted = hasUnresolvedConflict(result.structure);
  const provenance = result.structure?.governed_provenance;
  const coverageOrder: Array<keyof ClaimCoverageGroups> = [
    'supported',
    'contested',
    'contradicted',
    'unresolved',
  ];

  return (
    <div className="mt-4 grid gap-4">
      {/* The answer, exactly as Calyx composed it. */}
      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
        {result.answer.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-7 text-white/85">{result.answer}</p>
        ) : (
          <NothingRecorded>
            Calyx returned no answer for this question. Nothing is shown in its place.
          </NothingRecorded>
        )}
      </div>

      {conflicted && (
        <p className="flex items-start gap-2 text-xs leading-5 text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The evidence behind this answer does not agree. Read the conflicts below before
          relying on it.
        </p>
      )}

      {result.degraded && (
        <p className="text-xs leading-5 text-white/50">
          Composed from the linked evidence rather than reasoned generatively, so it
          integrates and qualifies what is recorded without explaining mechanism.
        </p>
      )}

      {result.structure ? (
        <details className="group rounded-xl border border-white/10 bg-black/10">
          <summary className="cursor-pointer list-none px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/55 hover:text-white/80">
            How this answer was reached
            {conflicted ? ' · evidence disagrees' : ''}
          </summary>
          <div className="grid gap-4 border-t border-white/10 px-4 py-4">
            {coverageOrder.map((key) =>
              groups[key].length ? (
                <div key={key}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                    {COVERAGE_LABEL[key]}
                  </p>
                  <ul className="mt-2 grid gap-1.5">
                    {groups[key].map((claim) => (
                      <li key={claim.claim_id} className="text-xs leading-5 text-white/70">
                        {claim.claim}
                        {claim.source_families?.length ? (
                          <span className="text-white/40">
                            {' '}
                            — {claim.source_families.join(', ')}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}

            {gaps.length ? (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                  Still missing
                </p>
                <ul className="mt-2 grid gap-1.5">
                  {gaps.map((gap) => (
                    <li key={gap} className="text-xs leading-5 text-white/70">
                      {gap}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] leading-5 text-white/40">
                  Missing evidence, not evidence of absence.
                </p>
              </div>
            ) : null}

            {result.structure.resolved_subject ? (
              <p className="text-xs leading-5 text-white/55">
                Subject resolved server-side as{' '}
                <span className="text-white/75">{result.structure.resolved_subject}</span>.
              </p>
            ) : null}

            {provenance ? (
              <p className="font-mono text-[10px] leading-5 text-white/40">
                {[
                  provenance.mission_id ? `mission ${provenance.mission_id}` : null,
                  provenance.evidence_packet_id ? `packet ${provenance.evidence_packet_id}` : null,
                  provenance.review_status ? `review ${provenance.review_status}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
          </div>
        </details>
      ) : (
        <p className="text-xs leading-5 text-white/45">
          This backend does not return the synthesis structure, so the support, disagreement
          and gap detail behind the answer cannot be inspected here.
        </p>
      )}

      <Link
        to={calyxHref}
        className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-200/90 hover:text-emerald-100"
      >
        Continue this thread in Calyx
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
};

const ResearchStationWorkbench: React.FC<{ projectId?: string | null }> = ({ projectId }) => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  // Lifted so every "continue" link carries the thread the synthesis opened.
  // Without it a follow-up asked in Calyx would restart the subject instead of
  // resolving against the turn the user just read here.
  const [conversationId, setConversationId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      let resolvedId = String(projectId ?? '').trim();
      if (!resolvedId) {
        const { items } = await listResearchProjects(1);
        if (!items?.length) {
          setState({ status: 'empty' });
          return;
        }
        resolvedId = items[0].project_id;
      }

      const [project, taxa, documents, evidence, notes] = await Promise.all([
        getResearchProject(resolvedId),
        listResearchTaxa(resolvedId),
        listResearchDocuments(resolvedId),
        listResearchEvidence(resolvedId),
        listResearchNotes(resolvedId),
      ]);

      setState({
        status: 'ready',
        dossier: buildResearchDossier({
          project,
          taxa: taxa.items ?? [],
          documents: documents.items ?? [],
          evidence: evidence.items ?? [],
          notes: notes.items ?? [],
        }),
      });
    } catch (error) {
      // Fail closed: the station never renders a partial investigation as if it
      // were complete, and never substitutes placeholder scientific content.
      if (error instanceof CalyxApiError) {
        setState({ status: 'error', kind: error.kind, message: error.message });
        return;
      }
      setState({
        status: 'error',
        kind: 'server_error',
        message: 'The Research Workspace could not be reached.',
      });
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-6 text-sm text-white/60">
        Opening the investigation…
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/5 p-6" role="status">
        <div className="flex items-center gap-2 text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
            {state.kind === 'authentication_required'
              ? 'Sign-in required'
              : 'Research Workspace unavailable'}
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-white/75">{state.message}</p>
        <p className="mt-2 text-xs leading-5 text-white/50">
          No placeholder investigation is shown in its place. Nothing here is a statement
          about the science — only about what could be retrieved.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-full border border-white/20 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white hover:bg-white/5"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-6">
        <h3 className="font-serif text-xl text-white">No research projects yet</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
          The Research Station opens an investigation you already hold in the Research
          Workspace. Once a project exists — with a research question and a subject taxon —
          this is where its evidence, conflicts and open questions are read together.
        </p>
      </div>
    );
  }

  const { dossier } = state;
  const subjectTaxon = dossier.subject?.taxon_id ?? '';
  const question = dossier.project.research_question?.trim() ?? '';
  const calyxQuestion = researchStationCalyxQuestion(dossier);
  const navContext = {
    taxon: subjectTaxon,
    projectId: dossier.project.project_id,
    conversationId,
  };

  return (
    <div className="grid gap-5">
      {/* SUBJECT + QUESTION */}
      <SectionShell
        icon={<Microscope className="h-3.5 w-3.5" />}
        eyebrow="Subject"
        title={subjectTaxon || dossier.project.title}
      >
        {subjectTaxon ? (
          <p className="text-sm leading-6 text-white/70">
            The taxon under investigation in{' '}
            <span className="text-white">{dossier.project.title}</span>.
            {dossier.comparisons.length
              ? ` Compared against ${dossier.comparisons.map((item) => item.taxon_id).join(', ')}.`
              : ''}
          </p>
        ) : (
          <NothingRecorded>
            This project has no taxon linked as its subject yet, so the station cannot carry a
            canonical taxon identity into the Atlas, Matrix or Calyx.
          </NothingRecorded>
        )}
      </SectionShell>

      <SectionShell
        icon={<HelpCircle className="h-3.5 w-3.5" />}
        eyebrow="Question"
        title="What is being asked"
      >
        {question ? (
          <p className="text-sm leading-6 text-white/80">{question}</p>
        ) : (
          <NothingRecorded>
            No research question has been recorded on this project. The station will not
            invent one, and Calyx is not offered a question the investigation does not hold.
          </NothingRecorded>
        )}
        {dossier.project.hypothesis?.trim() ? (
          <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/65">
            <span className="font-mono uppercase tracking-[0.18em] text-emerald-300/70">
              Hypothesis
            </span>
            <br />
            {dossier.project.hypothesis}
          </p>
        ) : null}
      </SectionShell>

      {/* KNOWN */}
      <SectionShell
        icon={<Layers className="h-3.5 w-3.5" />}
        eyebrow="Known"
        title="What the Continuum actually holds"
      >
        {dossier.evidenceEmpty ? (
          <NothingRecorded>
            No evidence has been linked to this investigation yet. That is an empty record,
            not a finding that no evidence exists.
          </NothingRecorded>
        ) : (
          <ul className="grid gap-2">
            {dossier.supporting.map((item) => (
              <li
                key={`${item.document_id}-${item.relationship}`}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5"
              >
                <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-200">
                  {item.relationship.toLowerCase()}
                </span>
                <span className="min-w-0 break-words text-xs leading-5 text-white/75">
                  {item.document_id}
                </span>
              </li>
            ))}
            {dossier.evidence.map((item) => (
              <li
                key={`${item.evidence_kind}-${item.evidence_id}`}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5"
              >
                <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/70">
                  {item.evidence_kind.toLowerCase()}
                </span>
                <span className="min-w-0 break-words text-xs leading-5 text-white/75">
                  {item.evidence_id}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionShell>

      {/* SYNTHESIS — run over the governed path, never computed here */}
      <SectionShell
        icon={<FlaskConical className="h-3.5 w-3.5" />}
        eyebrow="Synthesis"
        title="What the combined evidence means"
      >
        <p className="text-sm leading-6 text-white/70">
          Interpretation is not derived in this page. Calyx reasons over the linked evidence
          through the governed synthesis path and returns one integrated answer, with the
          support, disagreement and gaps behind it inspectable.
        </p>
        {calyxQuestion && subjectTaxon ? (
          <SynthesisPanel
            dossier={dossier}
            question={calyxQuestion}
            calyxHref={researchStationCalyxHref(navContext)}
            onConversation={setConversationId}
          />
        ) : (
          <div className="mt-4">
            <NothingRecorded>
              Calyx needs both a subject taxon and a research question to continue this
              investigation. Record them on the project first.
            </NothingRecorded>
          </div>
        )}
      </SectionShell>

      {/* CONFLICTS */}
      <SectionShell
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        eyebrow="Conflicts"
        title="Where the evidence disagrees"
      >
        {dossier.conflicts.length ? (
          <ul className="grid gap-2">
            {dossier.conflicts.map((item) => (
              <li
                key={item.document_id}
                className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-4 py-2.5 text-xs leading-5 text-amber-100/90"
              >
                {item.document_id}
              </li>
            ))}
          </ul>
        ) : (
          <NothingRecorded>
            No contradicting source has been recorded. Absence of a recorded conflict is not
            evidence of agreement — it may simply mean no one has linked one.
          </NothingRecorded>
        )}
      </SectionShell>

      {/* UNKNOWN + NEXT */}
      <SectionShell
        icon={<ScrollText className="h-3.5 w-3.5" />}
        eyebrow="Unknown"
        title="What we genuinely do not know yet"
      >
        {dossier.openQuestions.length ? (
          <ul className="grid gap-2">
            {dossier.openQuestions.map((note) => (
              <li
                key={note.note_id}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-2.5"
              >
                {note.title ? (
                  <p className="text-sm font-medium text-white">{note.title}</p>
                ) : null}
                <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-white/70">
                  {note.body}
                </p>
                <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
                  Researcher annotation · not evidence
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <NothingRecorded>
            No open questions have been recorded on this project yet.
          </NothingRecorded>
        )}
      </SectionShell>

      {/* TOOLS */}
      <SectionShell
        icon={<Network className="h-3.5 w-3.5" />}
        eyebrow="Continue"
        title="Where to take this investigation"
      >
        {subjectTaxon ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ToolLink
              to={researchStationAtlasHref(navContext)}
              icon={<Globe2 className="h-4 w-4" />}
              label="Atlas"
              detail="Where this taxon has been recorded."
            />
            <ToolLink
              to={researchStationRelationshipsHref(navContext)}
              icon={<Network className="h-4 w-4" />}
              label="Relationships"
              detail="Documented partners and linked traits."
            />
            <ToolLink
              to={researchStationMatrixHref(navContext)}
              icon={<Layers className="h-4 w-4" />}
              label="Matrix"
              detail="Morphology and identification evidence."
            />
            <ToolLink
              to={researchStationLexiconHref(navContext)}
              icon={<BookOpen className="h-4 w-4" />}
              label="Lexicon"
              detail="The terminology this investigation uses."
            />
            <ToolLink
              to={researchStationSpeciesHref(navContext)}
              icon={<Microscope className="h-4 w-4" />}
              label="Taxon dossier"
              detail="The full record for the subject taxon."
            />
            <ToolLink
              to={researchStationCalyxHref(navContext)}
              icon={<MessageCircle className="h-4 w-4" />}
              label="Calyx"
              detail="Reason over the evidence conversationally."
            />
          </div>
        ) : (
          <NothingRecorded>
            Link a subject taxon to this project to carry the investigation into the Atlas,
            Matrix, Lexicon and Calyx without restating it.
          </NothingRecorded>
        )}
        <p className="mt-4 text-xs leading-5 text-white/45">
          These links carry the taxon and project identity only. Locality and occurrence
          detail are never passed between modules this way.
        </p>
      </SectionShell>
    </div>
  );
};

export default ResearchStationWorkbench;
