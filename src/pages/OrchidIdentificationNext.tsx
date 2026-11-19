import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowRight, CheckCircle2, ChevronDown, CircleHelp, FlaskConical, KeyRound, Lock, RotateCcw, Sparkles } from "lucide-react";

import { readIdentificationSourceContext } from "@/features/calyx-workspace/identificationContext";
import { recordCalyxSurfaceContext } from "@/features/calyx-workspace/sessionContext";

import AuthModal from "@/components/auth/AuthModal";
import MatrixCandidateEvidence from "@/components/matrix/MatrixCandidateEvidence";
import MatrixLexiconGuide from "@/components/matrix/MatrixLexiconGuide";
import MatrixVisionReviewPanel from "@/components/matrix/MatrixVisionReviewPanel";
import { EvidenceFeedbackControl } from "@/components/evidence-feedback/EvidenceFeedbackControl";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { matrixEvidenceFeedbackPayload } from "@/lib/matrixEvidenceFeedback";
import {
  addSessionObservation,
  coerceObservationValue,
  createIdentificationSession,
  evaluateIdentificationSession,
  explainIdentificationSession,
  explanationText,
  getRegistryVersion,
  isAnswerableCharacter,
  isWithheld,
  listMatrixRegistries,
  matrixErrorAccess,
  MATRIX_OWNER_ONLY_PANEL_MESSAGE,
  MATRIX_WITHHELD_LABEL,
  type CalyxExplanation,
  type Certainty,
  type ExplanationAudience,
  type NextObservation,
  type RegistryCharacter,
  type RegistrySummary,
  type SessionEvaluation,
} from "@/lib/matrixIdentification";
import { explanationCandidates, explanationProvenance } from "@/lib/matrixCandidateEvidence";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function scopeLabel(scope?: Record<string, unknown>): string {
  if (!scope) return "Governed orchid matrix";
  const genus = typeof scope.genus === "string" ? scope.genus : null;
  const clade = typeof scope.clade === "string" ? scope.clade : null;
  if (isWithheld(genus) || (!genus && isWithheld(clade))) return `Scope ${MATRIX_WITHHELD_LABEL}`;
  return genus ? `Genus ${genus}` : clade ? clade : "Governed orchid matrix";
}

/** A value from a member-shaped payload, with the privacy marker said as what it is. */
function shown(value: string | null | undefined, fallback: string): string {
  if (isWithheld(value)) return MATRIX_WITHHELD_LABEL;
  return value || fallback;
}

/** A registry version a session can be started from: its identity is not withheld. */
function isStartable(registry: RegistrySummary): boolean {
  return Boolean(registry.registry_id && registry.version)
    && !isWithheld(registry.registry_id)
    && !isWithheld(registry.version);
}

type PageStatus = "loading" | "ready" | "working" | "error" | "restricted" | "signin" | "unconfigured";

const STATUS_PILL: Record<PageStatus, string> = {
  loading: "loading",
  ready: "ready",
  working: "working",
  error: "error",
  restricted: "owner access",
  signin: "sign in",
  unconfigured: "not configured",
};

/**
 * A refused Matrix request is an access state, not an error the visitor
 * caused. Owner decision (R1 J4): Matrix identification is open to signed-in
 * members, so an anonymous visitor is asked to sign in (never told Matrix is
 * owner-only), a member whose session was not accepted is asked to sign in
 * again, and only a genuine owner-only refusal says "owner access". Outages —
 * including member verification being briefly unavailable — stay errors with
 * a retry path; a server without member-auth settings is its own state.
 */
function failure(error: unknown, fallback: string): { status: PageStatus; message: string } {
  const message = error instanceof Error ? error.message : fallback;
  switch (matrixErrorAccess(error)) {
    case "owner_access_required":
      return { status: "restricted", message };
    case "sign_in_required":
    case "member_session_unverified":
      return { status: "signin", message };
    case "member_access_unconfigured":
      return { status: "unconfigured", message };
    default:
      return { status: "error", message };
  }
}

/**
 * Shown to a signed-in member in place of an owner-only panel. The member is
 * told plainly that the view is kept to owner access — not shown an error,
 * and not asked to sign in again (which could not change the answer).
 */
function OwnerOnlyPanel({ title, detail, testId }: { title: string; detail: string; testId: string }) {
  return (
    <section className="rounded-3xl border bg-card p-6 sm:p-8" data-testid={testId}>
      <div className="flex items-start gap-3">
        <Lock className="mt-1 h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-2 text-base font-semibold">{MATRIX_OWNER_ONLY_PANEL_MESSAGE}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
        </div>
      </div>
    </section>
  );
}

export default function OrchidIdentificationNext() {
  const location = useLocation();
  // A visitor arriving from a Lexicon entry carries that concept with them. It is
  // recorded as where they came from, never as an observed character on the session.
  const sourceContext = useMemo(
    () => readIdentificationSourceContext(location.search),
    [location.search],
  );

  useEffect(() => {
    recordCalyxSurfaceContext({
      surface: "matrix-identification",
      module: "matrix-identification",
      object_type: sourceContext.concept ? "lexicon_context" : "identification_workspace",
      object_id: sourceContext.concept ?? "matrix-identification",
      label: sourceContext.label ?? "Matrix Identification Lab",
      path: "/orchid-identification",
      metadata: {
        source_lexicon_concept: sourceContext.concept ?? null,
        source_lexicon_label: sourceContext.label ?? null,
        context_is_observation: false,
      },
    });
  }, [sourceContext.concept, sourceContext.label]);

  const auth = useOptionalAuth();
  const authLoading = auth?.loading ?? false;
  const userId = auth?.user?.id ?? null;
  const [showAuth, setShowAuth] = useState(false);
  const [registries, setRegistries] = useState<RegistrySummary[]>([]);
  const [withheldRegistryCount, setWithheldRegistryCount] = useState(0);
  const [registryCharacters, setRegistryCharacters] = useState<{ key: string; characters: RegistryCharacter[] } | null>(null);
  const [alternateCharacter, setAlternateCharacter] = useState("");
  const [selectedRegistryKey, setSelectedRegistryKey] = useState("");
  const [evaluation, setEvaluation] = useState<SessionEvaluation | null>(null);
  const [status, setStatus] = useState<PageStatus>("loading");
  const [message, setMessage] = useState("Loading governed identification matrices…");
  const [answer, setAnswer] = useState("");
  const [certainty, setCertainty] = useState<Certainty>("certain");
  const [audience, setAudience] = useState<ExplanationAudience>("beginner");
  const [calyxText, setCalyxText] = useState("");
  const [calyxPacket, setCalyxPacket] = useState<CalyxExplanation | null>(null);
  const requestId = useRef(0);

  const selectedRegistry = useMemo(
    () => registries.find((item) => `${item.registry_id}:${item.version}` === selectedRegistryKey) ?? null,
    [registries, selectedRegistryKey],
  );
  const session = evaluation?.session ?? null;
  const next = evaluation?.next_observation ?? null;
  // The backend returned the member view (`mine: true`): this is a signed-in
  // member's own session, and the owner-only panels are not offered.
  const memberView = session?.mine === true;
  const nextAnswerable = isAnswerableCharacter(next);
  const sessionRegistryKey = session ? `${session.registry.registry_id}:${session.registry.version}` : "";
  // When the Matrix's next character is withheld from the member view, the
  // member can still answer any other character the registry defines.
  const alternatives = useMemo(() => {
    if (!session || !registryCharacters || registryCharacters.key !== sessionRegistryKey) return [];
    const observed = new Set(session.observations.map((item) => item.character));
    return registryCharacters.characters.filter((item) => isAnswerableCharacter(item) && !observed.has(item.character));
  }, [session, registryCharacters, sessionRegistryKey]);
  const target: NextObservation | null = nextAnswerable
    ? next
    : (() => {
        const picked = alternatives.find((item) => item.character === alternateCharacter);
        return picked
          ? { character: picked.character, label: picked.label || picked.character, description: picked.description, value_type: picked.value_type ?? undefined }
          : null;
      })();
  const feedbackPayload = useMemo(
    () => evaluation && evaluation.session.mine !== true ? matrixEvidenceFeedbackPayload(evaluation) : null,
    [evaluation],
  );

  const [registryAttempt, setRegistryAttempt] = useState(0);

  // A session is private to the account that started it: when the signed-in
  // account changes (sign in, sign out, another member), the open session is
  // dropped rather than carried across accounts.
  const lastUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (authLoading) return;
    if (lastUser.current !== undefined && lastUser.current !== userId) {
      setEvaluation(null);
      setAnswer("");
      setCalyxText(""); setCalyxPacket(null);
      setRegistryCharacters(null);
      setAlternateCharacter("");
    }
    lastUser.current = userId;
  }, [authLoading, userId]);

  useEffect(() => {
    // Wait for the identity session to hydrate, so a member is not first
    // shown the anonymous sign-in prompt.
    if (authLoading) return;
    const id = ++requestId.current;
    setStatus("loading");
    setMessage("Loading governed identification matrices…");
    void listMatrixRegistries()
      .then((listed) => {
        if (id !== requestId.current) return;
        const items = listed.filter(isStartable);
        setRegistries(items);
        setWithheldRegistryCount(listed.length - items.length);
        setSelectedRegistryKey(items[0] ? `${items[0].registry_id}:${items[0].version}` : "");
        setStatus("ready");
        setMessage(items.length ? "Choose a governed matrix and begin." : "No governed Matrix registry versions are available yet.");
      })
      .catch((error) => {
        if (id !== requestId.current) return;
        const failed = failure(error, "Unable to load Matrix registries.");
        setRegistries([]);
        setStatus(failed.status);
        setMessage(failed.message);
      });
    return () => { requestId.current += 1; };
  }, [registryAttempt, authLoading, userId]);

  // Load the registry's character definitions only when the member needs
  // them: the Matrix's next character is withheld from the member view.
  useEffect(() => {
    if (!session || !next || nextAnswerable) return;
    if (registryCharacters?.key === sessionRegistryKey) return;
    let active = true;
    void getRegistryVersion(session.registry.registry_id, session.registry.version)
      .then((detail) => {
        if (active) setRegistryCharacters({ key: sessionRegistryKey, characters: detail.characters });
      })
      .catch(() => {
        if (active) setRegistryCharacters({ key: sessionRegistryKey, characters: [] });
      });
    return () => { active = false; };
  }, [session, next, nextAnswerable, registryCharacters, sessionRegistryKey]);

  async function start(): Promise<void> {
    if (!selectedRegistry) return;
    const id = ++requestId.current;
    setStatus("working");
    setMessage("Starting an evidence-bound identification session…");
    setCalyxText(""); setCalyxPacket(null);
    setAnswer("");
    setAlternateCharacter("");
    try {
      const created = await createIdentificationSession(selectedRegistry);
      const result = await evaluateIdentificationSession(created.session_id);
      if (id !== requestId.current) return;
      setEvaluation(result);
      setStatus("ready");
      setMessage("Session ready. Add the most useful observation you can make.");
    } catch (error) {
      if (id !== requestId.current) return;
      const failed = failure(error, "Unable to start identification.");
      setStatus(failed.status);
      setMessage(failed.message);
    }
  }

  async function submitObservation(): Promise<void> {
    if (!session || !target || !answer.trim()) return;
    const id = ++requestId.current;
    setStatus("working");
    setMessage(`Recording ${target.label.toLowerCase()} and recalculating the candidates…`);
    try {
      await addSessionObservation(
        session.session_id,
        target.character,
        coerceObservationValue(answer, target.value_type),
        certainty,
      );
      const result = await evaluateIdentificationSession(session.session_id);
      if (id !== requestId.current) return;
      setEvaluation(result);
      setAnswer("");
      setAlternateCharacter("");
      setCalyxText(""); setCalyxPacket(null);
      setStatus("ready");
      setMessage(result.next_observation ? "Evidence updated. The Matrix selected the next most discriminating observation." : "No further discriminating Matrix character is available in this registry.");
    } catch (error) {
      if (id !== requestId.current) return;
      const failed = failure(error, "Unable to record observation.");
      setStatus(failed.status);
      setMessage(failed.message);
    }
  }

  async function refreshAfterVisionReview(): Promise<void> {
    if (!session) return;
    const result = await evaluateIdentificationSession(session.session_id);
    setEvaluation(result);
    setCalyxText(""); setCalyxPacket(null);
    setStatus("ready");
    setMessage("Reviewed Vision evidence was incorporated and the Matrix ranking was recalculated.");
  }

  async function askCalyx(focus: "summary" | "next_observation" | "candidate_comparison"): Promise<void> {
    if (!session) return;
    const id = ++requestId.current;
    setStatus("working");
    setMessage("Calyx is explaining the structured Matrix evidence…");
    try {
      const explanation = await explainIdentificationSession(session.session_id, audience, focus);
      if (id !== requestId.current) return;
      setCalyxText(explanationText(explanation) || "Calyx returned a governed explanation packet without narrative text.");
      setCalyxPacket(explanation);
      setStatus("ready");
      setMessage("Calyx explanation loaded. The Matrix ranking itself is unchanged.");
    } catch (error) {
      if (id !== requestId.current) return;
      const failed = failure(error, "Unable to ask Calyx.");
      setStatus(failed.status);
      setMessage(failed.message);
    }
  }

  function reset(): void {
    requestId.current += 1;
    setEvaluation(null);
    setAnswer("");
    setCalyxText(""); setCalyxPacket(null);
    setAlternateCharacter("");
    setCertainty("certain");
    setStatus("ready");
    setMessage("Choose a governed matrix and begin.");
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-3xl border bg-card">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.25fr_.75fr] lg:p-10">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-700">Calyx Matrix · Guided Identification</p>
              <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Investigate the orchid, one piece of evidence at a time.</h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
                The Matrix ranks governed candidates from your observations. Calyx explains what the evidence means and why the next observation matters. Scores are evidence for review, not a verified taxonomic identification.
              </p>
            </div>
            <div className="rounded-2xl border bg-background/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scientific boundary</p>
              <p className="mt-2 text-sm leading-6">Matrix calculations determine ranking and the next diagnostic character. Calyx can explain those results, but cannot rewrite them.</p>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4" /> Missing data ≠ biological absence</div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4" /> Score and evidence coverage stay separate</div>
            </div>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-center gap-3" aria-live="polite">
          <span className="rounded-full border px-3 py-1 text-xs font-semibold uppercase">{STATUS_PILL[status]}</span>
          <span className="text-sm text-muted-foreground" data-testid="matrix-status-message">{message}</span>
          {status === "signin" && auth ? (
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              data-testid="matrix-sign-in"
              className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white"
            >
              <KeyRound className="h-3 w-3" /> Sign in
            </button>
          ) : null}
          {memberView ? <span className="rounded-full border px-3 py-1 text-xs" data-testid="matrix-session-private">Your session · private to your account</span> : null}
          {status === "error" && !session && registries.length === 0 && (
            <button
              type="button"
              onClick={() => setRegistryAttempt((n) => n + 1)}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold"
            >
              <RotateCcw className="h-3 w-3" /> Try again
            </button>
          )}
          {session && <span className="rounded-full border px-3 py-1 text-xs">Revision {session.revision}</span>}
        </div>

        {!session ? (
          <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_.8fr]">
            <div className="rounded-3xl border bg-card p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">1 · Choose the scientific scope</p>
              <h2 className="mt-2 text-2xl font-semibold">Start with a governed character matrix</h2>
              <label className="mt-6 block text-sm font-medium" htmlFor="matrix-registry">Identification matrix</label>
              <div className="relative mt-2">
                <select
                  id="matrix-registry"
                  value={selectedRegistryKey}
                  onChange={(event) => setSelectedRegistryKey(event.target.value)}
                  className="w-full appearance-none rounded-xl border bg-background px-4 py-3 pr-10"
                  disabled={status === "loading" || status === "working"}
                >
                  {registries.map((registry) => (
                    <option key={`${registry.registry_id}:${registry.version}`} value={`${registry.registry_id}:${registry.version}`}>
                      {shown(registry.title, registry.registry_id)} · {registry.version}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
              </div>
              {withheldRegistryCount > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground" data-testid="matrix-registry-withheld">
                  {withheldRegistryCount} registry version{withheldRegistryCount === 1 ? " is" : "s are"} withheld from the member view and cannot be started here.
                </p>
              ) : null}
              {selectedRegistry && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Scope</p><p className="mt-1 text-sm font-medium">{scopeLabel(selectedRegistry.scope)}</p></div>
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Candidates</p><p className="mt-1 text-sm font-medium">{selectedRegistry.candidate_count ?? "—"}</p></div>
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Characters</p><p className="mt-1 text-sm font-medium">{selectedRegistry.character_count ?? "—"}</p></div>
                </div>
              )}
              <button type="button" onClick={() => void start()} disabled={!selectedRegistry || status === "working"} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
                Begin guided identification <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <aside className="rounded-3xl border bg-card p-6 sm:p-8">
              <FlaskConical className="h-7 w-7 text-emerald-700" />
              <h2 className="mt-4 text-xl font-semibold">What happens next?</h2>
              <ol className="mt-5 space-y-4 text-sm leading-6 text-muted-foreground">
                <li><strong className="text-foreground">Observe.</strong> The Matrix asks for a character that can separate the remaining candidates.</li>
                <li><strong className="text-foreground">Compare.</strong> Candidate rankings update, with match and coverage shown independently.</li>
                <li><strong className="text-foreground">Understand.</strong> Ask Calyx why the character matters or why candidates differ.</li>
                <li><strong className="text-foreground">Repeat.</strong> The next question adapts to the evidence already recorded.</li>
              </ol>
            </aside>
          </section>
        ) : (
          <>
            <section className="mt-8 grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
              <div className="rounded-3xl border bg-card p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">2 · Next observation</p>
                    <h2 className="mt-2 text-2xl font-semibold">{next ? (nextAnswerable ? next.label : target ? target.label : "The next character is withheld from the member view") : "Matrix evidence complete for this registry"}</h2>
                  </div>
                  <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><RotateCcw className="h-4 w-4" /> Start over</button>
                </div>

                {next && !nextAnswerable ? (
                  <div className="mt-3 rounded-2xl border bg-background p-4 text-sm leading-6" data-testid="matrix-next-withheld">
                    <p className="text-muted-foreground">
                      The Matrix&apos;s most discriminating next character is withheld from the member view, so it cannot be answered here. It is not recorded, and nothing is assumed about it.
                    </p>
                    {alternatives.length ? (
                      <>
                        <label className="mt-3 block text-sm font-medium" htmlFor="alternate-character">Answer another character instead</label>
                        <select
                          id="alternate-character"
                          value={alternateCharacter}
                          onChange={(event) => { setAlternateCharacter(event.target.value); setAnswer(""); }}
                          className="mt-2 w-full rounded-xl border bg-background px-4 py-3"
                          disabled={status === "working"}
                        >
                          <option value="">Choose a character…</option>
                          {alternatives.map((item) => (
                            <option key={item.character} value={item.character}>{item.label || item.character}</option>
                          ))}
                        </select>
                      </>
                    ) : registryCharacters?.key === sessionRegistryKey ? (
                      <p className="mt-2 text-muted-foreground">No other character in this registry is available to answer. Review the ranking below or ask Calyx to explain it.</p>
                    ) : null}
                  </div>
                ) : null}
                {target ? (
                  <>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{shown(target.description, "") || "Record what you can observe. If you cannot determine the character confidently, lower the certainty rather than guessing."}</p>
                    <MatrixLexiconGuide
                      registryId={session.registry.registry_id}
                      registryVersion={session.registry.version}
                      characterId={target.character}
                    />
                    {nextAnswerable ? (
                      <div className="mt-5 rounded-2xl border bg-background p-4">
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>{target.distinct_state_count ?? "—"} distinct states</span>
                          <span>{target.candidate_coverage == null ? "—" : percent(target.candidate_coverage)} candidate coverage</span>
                          <span>{target.reason_code?.replaceAll("_", " ")}</span>
                        </div>
                        {target.explanation_boundary ? <p className="mt-2 text-xs text-muted-foreground">{shown(target.explanation_boundary, "")}</p> : null}
                      </div>
                    ) : null}
                    <label className="mt-6 block text-sm font-medium" htmlFor="observation-answer">Your observation</label>
                    <input
                      id="observation-answer"
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") void submitObservation(); }}
                      placeholder={target.value_type?.startsWith("numeric") ? "Enter a measurement" : "Describe the observed state"}
                      className="mt-2 w-full rounded-xl border bg-background px-4 py-3"
                    />
                    <div className="mt-4">
                      <label className="text-sm font-medium" htmlFor="certainty">How certain are you?</label>
                      <select id="certainty" value={certainty} onChange={(event) => setCertainty(event.target.value as Certainty)} className="mt-2 w-full rounded-xl border bg-background px-4 py-3 sm:w-auto">
                        <option value="certain">Certain</option>
                        <option value="probable">Probable</option>
                        <option value="uncertain">Uncertain</option>
                        <option value="unknown">Unknown / cannot determine</option>
                      </select>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button type="button" onClick={() => void submitObservation()} disabled={!answer.trim() || status === "working"} className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">Record observation</button>
                      <button type="button" onClick={() => void askCalyx("next_observation")} disabled={status === "working"} className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 font-medium"><CircleHelp className="h-4 w-4" /> Why are you asking this?</button>
                    </div>
                  </>
                ) : next ? null : (
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">The current registry has no additional unobserved character that can discriminate the ranked candidates. Review the evidence below or ask Calyx to compare the remaining candidates.</p>
                )}
              </div>

              <div className="rounded-3xl border bg-card p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">3 · Candidate field</p><h2 className="mt-2 text-2xl font-semibold">Evidence narrows the possibilities</h2></div>
                  <button type="button" onClick={() => void askCalyx("candidate_comparison")} disabled={status === "working"} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium"><Sparkles className="h-4 w-4" /> Ask Calyx to compare</button>
                </div>
                <div className="mt-6 space-y-3">
                  {evaluation ? (
                    <p className="text-xs text-muted-foreground" data-testid="matrix-ranking-basis">
                      {evaluation.report.observation_count} observation{evaluation.report.observation_count === 1 ? "" : "s"} recorded · {evaluation.report.compared_character_count} used for ranking
                      {evaluation.report.observation_count > evaluation.report.compared_character_count ? " (observations marked unknown are ignored, not counted against any candidate)" : ""}
                    </p>
                  ) : null}
                  {(evaluation?.report.candidates ?? []).slice(0, 8).map((candidate, index) => (
                    <MatrixCandidateEvidence key={`${candidate.taxon_id}:${index}`} candidate={candidate} rank={index + 1} />
                  ))}
                </div>
                <p className="mt-5 text-xs leading-5 text-muted-foreground">{evaluation?.report.disclaimer}</p>
              </div>
            </section>

            {feedbackPayload ? (
              <div className="mt-6">
                <EvidenceFeedbackControl
                  key={`${session.session_id}:${session.revision}`}
                  objectId={`matrix-identification:${session.session_id}`}
                  objectType="matrix_identification"
                  objectPayload={feedbackPayload}
                  pageContext="/orchid-identification"
                  objectLabel={`Matrix session ${session.session_id}, revision ${session.revision}`}
                  initialFeedbackClass="challenge"
                />
              </div>
            ) : null}

            {memberView ? (
              <div className="mt-6">
                <OwnerOnlyPanel
                  testId="matrix-feedback-owner-only"
                  title="Feedback on this Matrix result"
                  detail="Recording a challenge or correction against a Matrix ranking is kept to owner access in this release. Your identification session is unaffected, and signing in again will not change this."
                />
              </div>
            ) : null}

            <div className="mt-6">
              {memberView ? (
                <OwnerOnlyPanel
                  testId="matrix-vision-owner-only"
                  title="Calyx Vision review · evidence reports · persistence status"
                  detail="Members can identify with the Matrix and ask Calyx to explain the ranking. Reviewing machine Vision suggestions, freezing evidence reports and inspecting persistence stay with the owner. This is not a problem with your session."
                />
              ) : (
                <MatrixVisionReviewPanel
                  sessionId={session.session_id}
                  disabled={status === "working"}
                  onObservationAccepted={refreshAfterVisionReview}
                />
              )}
            </div>

            <section className="mt-6 rounded-3xl border bg-card p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Calyx · explanation layer</p><h2 className="mt-2 text-2xl font-semibold">Understand the evidence</h2></div>
                <div className="flex items-center gap-2"><label htmlFor="audience" className="text-sm text-muted-foreground">Level</label><select id="audience" value={audience} onChange={(event) => setAudience(event.target.value as ExplanationAudience)} className="rounded-xl border bg-background px-3 py-2 text-sm"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="expert">Expert</option></select></div>
              </div>
              {calyxText ? <div className="mt-5 whitespace-pre-wrap rounded-2xl border bg-background p-5 text-sm leading-7">{calyxText}</div> : null}
              {calyxText && calyxPacket ? <CalyxPacketProvenance packet={calyxPacket} /> : null}
              {calyxText ? null : <p className="mt-4 text-sm text-muted-foreground">Ask Calyx why the Matrix selected a character or how the leading candidates differ. Calyx receives the structured evidence but cannot rewrite it.</p>}
              <button type="button" onClick={() => void askCalyx("summary")} disabled={status === "working"} className="mt-5 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium"><Sparkles className="h-4 w-4" /> Explain the identification so far</button>
            </section>

            <details className="mt-6 rounded-2xl border bg-card p-5">
              <summary className="cursor-pointer text-sm font-semibold">Expert provenance trail</summary>
              <div className="mt-4 grid gap-4 text-xs text-muted-foreground sm:grid-cols-3">
                <div><p className="font-semibold text-foreground">Session</p><p className="mt-1 break-all">{session.session_id}</p></div>
                <div><p className="font-semibold text-foreground">Registry</p><p className="mt-1">{shown(session.registry.registry_id, "not recorded")} · {shown(session.registry.version, "not recorded")}</p><p className="mt-1" data-testid="matrix-registry-publication-state">Publication state: {(evaluation?.report.registry?.publication_state ?? session.registry.publication_state ?? "not recorded").replaceAll("_", " ")}</p>{session.registry.checksum_sha256 ? <p className="mt-1 break-all">Checksum {session.registry.checksum_sha256}</p> : null}</div>
                <div><p className="font-semibold text-foreground">Observations</p><p className="mt-1">{session.observations.length} recorded · revision {session.revision}</p><ul className="mt-1 space-y-1">{session.observations.map((item) => <li key={item.observation_id}>{isWithheld(item.character) ? `character ${MATRIX_WITHHELD_LABEL}` : item.character.replaceAll("_", " ")} · {item.certainty} · {String(item.source?.kind ?? "source not recorded").replaceAll("_", " ")}{item.review_state ? ` · ${item.review_state.replaceAll("_", " ")}` : ""}</li>)}</ul></div>
              </div>
            </details>
          </>
        )}
      </div>
      {showAuth ? <AuthModal open onClose={() => setShowAuth(false)} initialMode="signin" /> : null}
    </main>
  );
}

function names(characters: string[]): string {
  return characters.map((item) => (isWithheld(item) ? "withheld" : item)).join(", ");
}

/** What produced the Calyx text and what it is allowed to be: explanation, never evidence. */
function CalyxPacketProvenance({ packet }: { packet: CalyxExplanation }) {
  const provenance = explanationProvenance(packet);
  const candidates = explanationCandidates(packet);
  return (
    <div className="mt-3 space-y-2 text-xs text-muted-foreground" data-testid="calyx-explanation-provenance">
      {provenance ? (
        <p>
          Produced by {provenance.provider ?? "an unrecorded provider"}{provenance.model ? ` (${provenance.model})` : ""} ·{" "}
          {(provenance.epistemicState ?? "epistemic state not recorded").replaceAll("_", " ")}
          {provenance.fallbackError ? ` · provider unavailable, deterministic fallback used: ${provenance.fallbackError}` : ""}
        </p>
      ) : null}
      {candidates.length ? (
        <ul className="space-y-1">
          {candidates.map((item) => (
            <li key={item.taxon_id}>
              <i>{shown(item.scientific_name, "name not recorded")}</i>: supported by {item.supporting_characters?.length ? names(item.supporting_characters) : "none"}
              {item.partial_characters?.length ? `; partial ${names(item.partial_characters)}` : ""}
              {item.conflicting_characters?.length ? `; conflicts ${names(item.conflicting_characters)}` : ""}
              {item.missing_characters?.length ? `; not recorded ${names(item.missing_characters)}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
